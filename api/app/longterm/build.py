"""Calibra o modelo de horizontes com o histórico e grava o resultado que a API serve.

Uso: python -m app.longterm.build [--history data/history.json] [--out data/longterm.json]
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import fmean, median

from .history import History, load
from .model import (
    FEATURE_LABELS,
    FEATURES,
    HORIZONS,
    FeatureBuilder,
    build_samples,
    fit_logistic,
    walk_forward,
)
from .stats import (
    CRISES,
    annual_returns,
    annualize,
    crisis_behaviour,
    current_scenario,
    regime_performance,
    regimes,
    risk_metrics,
)

MODEL_VERSION = "horizontes-v1"
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _percentile(values: list[float], q: float) -> float:
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo, hi = int(pos), min(int(pos) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def window_stats(history: History, ticker: str, months: int, bench) -> dict | None:
    """Distribuição dos retornos anualizados do ativo em todas as janelas de H meses do histórico."""
    p, cdi = history.prices[ticker], history.cdi
    rets, beat_cdi, beat_bench = [], [], []
    for i in range(len(p) - months):
        if p[i] is None or p[i + months] is None:
            continue
        total = p[i + months] / p[i] - 1
        rets.append(annualize(total, months))
        window = cdi[i + 1 : i + months + 1]
        if all(c is not None for c in window):
            cdi_total = 1.0
            for c in window:
                cdi_total *= 1 + c
            beat_cdi.append(total > cdi_total - 1)
        if bench[i] is not None and bench[i + months] is not None:
            beat_bench.append(total > bench[i + months] / bench[i] - 1)
    if len(rets) < 6:
        return None
    return {
        "windows": len(rets),
        "median": round(median(rets), 4),
        "p10": round(_percentile(rets, 0.1), 4),
        "p90": round(_percentile(rets, 0.9), 4),
        "beat_cdi_freq": round(fmean(beat_cdi), 3) if beat_cdi else None,
        "beat_benchmark_freq": round(fmean(beat_bench), 3) if beat_bench else None,
    }


def build_class(history: History, asset_class: str, regime_list: list, scenario: tuple | None, log) -> dict:
    bench = history.benchmarks[asset_class]
    fb = FeatureBuilder(history, asset_class, regime_list)
    last = len(history.months) - 1
    current_z = fb.zscores(last) or {}

    horizons = {}
    for years, months in HORIZONS.items():
        samples = build_samples(history, fb, months)
        result: dict = {"years": years, "months": months, "samples": len(samples)}
        models = {}
        for target in ("beat_benchmark", "beat_cdi"):
            data = [s for s in samples if getattr(s, target) >= 0]
            validation = walk_forward(samples, target, months, history.first)
            base = (
                sum(s.weight * getattr(s, target) for s in data) / sum(s.weight for s in data) if data else 0.5
            )
            model = None
            if data and validation["validated"]:
                model = fit_logistic([s.x for s in data], [getattr(s, target) for s in data], [s.weight for s in data])
            models[target] = model
            result[target] = {
                "base_rate": round(base, 3),
                "validation": validation,
                "coefficients": (
                    {f: round(c, 3) for f, c in zip(FEATURES, model.coefs)} if model else None
                ),
            }
            log(f"{asset_class} {years}a {target}: base {base:.2f} {validation}")

        assets = []
        for ticker in history.tickers(asset_class):
            if history.prices[ticker][last] is None:
                continue
            stats = window_stats(history, ticker, months, bench.levels)
            z = current_z.get(ticker)
            row: dict = {"ticker": ticker, "name": history.names[ticker], "history": stats}
            for target in ("beat_benchmark", "beat_cdi"):
                model = models[target]
                base = result[target]["base_rate"]
                if model and z is not None:
                    x = [z[f] for f in FEATURES]
                    row[f"prob_{target}"] = round(model.prob(x), 3)
                    if target == "beat_benchmark":
                        contribs = sorted(
                            ((f, c * v) for f, c, v in zip(FEATURES, model.coefs, x)), key=lambda t: -abs(t[1])
                        )
                        row["top_factors"] = [
                            {"factor": f, "label": FEATURE_LABELS[f], "contribution": round(c, 3)}
                            for f, c in contribs[:3]
                        ]
                else:
                    # Sem modelo validado, a estimativa honesta é a frequência histórica da classe.
                    row[f"prob_{target}"] = base
            row.setdefault("top_factors", [])
            risk = risk_metrics(history.prices[ticker], history.cdi, last)
            row["sharpe_10y"] = risk["sharpe"] if risk else None
            assets.append(row)

        # Com modelo validado, ordena pela chance de superar o índice. Sem ele (ou no empate), pelo retorno
        # ajustado ao risco dos últimos 10 anos (índice de Sharpe contra o CDI).
        sharpe = lambda a: a["sharpe_10y"] if a["sharpe_10y"] is not None else -9  # noqa: E731
        assets.sort(key=lambda a: (-a["prob_beat_benchmark"], -sharpe(a)))
        for rank, a in enumerate(assets, start=1):
            a["rank"] = rank
        result["model_used"] = models["beat_benchmark"] is not None
        result["assets"] = assets
        horizons[str(years)] = result

    return {
        "benchmark": bench.label,
        "benchmark_is_proxy": bench.proxy,
        "benchmark_risk": risk_metrics(bench.levels, history.cdi, last),
        "benchmark_annual": annual_returns(history, bench.levels),
        "benchmark_crises": crisis_behaviour(history, bench.levels),
        "benchmark_in_scenario": regime_performance(history, bench.levels, regime_list, scenario) if scenario else None,
        "horizons": horizons,
    }


def cdi_levels(history: History) -> list:
    levels, level = [], None
    for c in history.cdi:
        if c is None:
            levels.append(None)
            continue
        level = (level or 100.0) * (1 + c)
        levels.append(level)
    return levels


def build(history: History, log=lambda _: None) -> dict:
    regime_list = regimes(history)
    scenario_info = current_scenario(history, regime_list)
    scenario = tuple(scenario_info["key"].split("|")) if scenario_info.get("key") else None
    last = len(history.months) - 1
    cdi = cdi_levels(history)

    classes = {c: build_class(history, c, regime_list, scenario, log) for c in sorted(set(history.classes.values()))}

    assets = {}
    for ticker, levels in history.prices.items():
        first = next((i for i, v in enumerate(levels) if v is not None), None)
        if first is None or levels[last] is None:
            continue
        asset_class = history.classes[ticker]
        assets[ticker] = {
            "name": history.names[ticker],
            "asset_class": asset_class,
            "first_month": history.months[first],
            "risk_10y": risk_metrics(levels, history.cdi, last),
            "annual": annual_returns(history, levels),
            "crises": crisis_behaviour(history, levels),
            "in_scenario": regime_performance(history, levels, regime_list, scenario) if scenario else None,
            "horizons": {
                years: next(
                    (
                        {k: a[k] for k in ("rank", "prob_beat_benchmark", "prob_beat_cdi", "history", "top_factors")}
                        | {"total": len(h["assets"])}
                        for a in h["assets"]
                        if a["ticker"] == ticker
                    ),
                    None,
                )
                for years, h in classes[asset_class]["horizons"].items()
            },
        }

    return {
        "model_version": MODEL_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_source": history.source,
        "data_fetched_at": history.fetched_at,
        "data_from": history.months[0],
        "data_through": history.months[last],
        "scenario": scenario_info,
        "crises": [{"key": c.key, "label": c.label, "start": c.start, "end": c.end, "description": c.description} for c in CRISES],
        "cdi_risk": risk_metrics(cdi, history.cdi, last),
        "cdi_annual": annual_returns(history, cdi),
        "classes": classes,
        "assets": assets,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", default=str(DATA_DIR / "history.json"))
    parser.add_argument("--out", default=str(DATA_DIR / "longterm.json"))
    args = parser.parse_args()
    result = build(load(Path(args.history)), log=lambda m: print(m, file=sys.stderr))
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=1))
    print(f"gravado em {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
