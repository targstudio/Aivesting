"""Medidas de risco e retorno, comportamento em crises e cenário macro, a partir do histórico mensal."""

import math
from dataclasses import dataclass
from statistics import fmean, pstdev

from .history import History, Series


@dataclass(frozen=True)
class Crisis:
    key: str
    label: str
    start: str  # mês do pico anterior (fechamento)
    end: str  # mês do fundo (fechamento)
    description: str


# Episódios de estresse usados para mostrar como cada ativo se comportou. Datas em fechamento mensal.
CRISES = [
    Crisis("2008", "Crise financeira global", "2008-05", "2009-02", "Quebra do Lehman Brothers e recessão mundial."),
    Crisis("2015", "Recessão brasileira", "2014-08", "2016-01", "PIB caiu cerca de 7% em dois anos; impeachment."),
    Crisis("2018", "Greve dos caminhoneiros", "2018-02", "2018-06", "Paralisação do transporte e incerteza eleitoral."),
    Crisis("2020", "Pandemia de Covid-19", "2020-01", "2020-03", "Queda mais rápida da história da bolsa."),
    Crisis("2021", "Alta dos juros", "2021-06", "2022-06", "Selic subiu de 2% para mais de 13% ao ano."),
    Crisis("2024", "Estresse fiscal", "2024-08", "2024-12", "Dúvidas sobre as contas públicas; dólar acima de R$ 6."),
]

SELIC_TREND_LABELS = {"alta": "Selic subindo", "queda": "Selic caindo", "estavel": "Selic estável"}
GLOBAL_LABELS = {
    "favoravel": "bolsa americana em tendência de alta",
    "adverso": "bolsa americana abaixo da média de 10 meses",
}


def monthly_returns(levels: Series) -> Series:
    return [
        None if i == 0 or levels[i] is None or levels[i - 1] is None else levels[i] / levels[i - 1] - 1
        for i in range(len(levels))
    ]


def cumulative(rets: Series, start: int, end: int) -> float | None:
    """Retorno composto dos meses start+1..end, ou None se faltar algum mês."""
    total = 1.0
    for i in range(start + 1, end + 1):
        if rets[i] is None:
            return None
        total *= 1 + rets[i]
    return total - 1


def period_return(levels: Series, start: int, end: int) -> float | None:
    if start < 0 or end >= len(levels) or levels[start] is None or levels[end] is None:
        return None
    return levels[end] / levels[start] - 1


def annualize(total: float, months: int) -> float:
    return (1 + total) ** (12 / months) - 1 if total > -1 else -1.0


def risk_metrics(levels: Series, cdi: Series, end: int, window: int = 120) -> dict | None:
    """Retorno anual, volatilidade, pior queda e índice de Sharpe na janela que termina em `end`."""
    start = max(0, end - window)
    while start < end and levels[start] is None:
        start += 1
    months = end - start
    if months < 24 or levels[end] is None:
        return None
    rets = monthly_returns(levels)[start + 1 : end + 1]
    if any(r is None for r in rets):
        rets = [r for r in rets if r is not None]
    total = levels[end] / levels[start] - 1
    cagr = annualize(total, months)
    vol = pstdev(rets) * math.sqrt(12)
    peak, max_dd = levels[start], 0.0
    for v in levels[start : end + 1]:
        if v is None:
            continue
        peak = max(peak, v)
        max_dd = min(max_dd, v / peak - 1)
    cdi_total = cumulative(cdi, start, end)
    cdi_cagr = annualize(cdi_total, months) if cdi_total is not None else None
    rolling = [r for i in range(start + 12, end + 1) if (r := period_return(levels, i - 12, i)) is not None]
    return {
        "months": months,
        "total_return": round(total, 4),
        "cagr": round(cagr, 4),
        "volatility": round(vol, 4),
        "max_drawdown": round(max_dd, 4),
        "sharpe": round((cagr - cdi_cagr) / vol, 2) if cdi_cagr is not None and vol > 0 else None,
        "cdi_cagr": round(cdi_cagr, 4) if cdi_cagr is not None else None,
        "worst_12m": round(min(rolling), 4) if rolling else None,
        "best_12m": round(max(rolling), 4) if rolling else None,
    }


def annual_returns(history: History, levels: Series, years: int = 11) -> list[dict]:
    """Retorno de cada ano-calendário (o ano corrente vai até o último mês disponível)."""
    last = len(history.months) - 1
    last_year = int(history.months[last][:4])
    out = []
    for year in range(last_year - years + 1, last_year + 1):
        start = history.index_of(f"{year - 1}-12")
        end = min(last, history.index_of(f"{year}-12") or last)
        if start is None:
            continue
        ret = period_return(levels, start, end)
        if ret is not None:
            out.append({"year": year, "return": round(ret, 4), "partial": end != history.index_of(f"{year}-12")})
    return out


def crisis_behaviour(history: History, levels: Series) -> list[dict]:
    out = []
    for c in CRISES:
        start, end = history.index_of(c.start), history.index_of(c.end)
        ret = period_return(levels, start, end) if start is not None and end is not None else None
        recovery = None
        if ret is not None:
            recovery = next(
                (k - end for k in range(end + 1, len(levels)) if levels[k] is not None and levels[k] >= levels[start]),
                None,
            )
        out.append(
            {
                "key": c.key,
                "return": round(ret, 4) if ret is not None else None,
                # Meses após o fundo até voltar ao nível pré-crise. None: ainda não voltou (ou sem dados).
                "recovery_months": recovery if ret is not None and ret < 0 else (0 if ret is not None else None),
                "recovered": ret is not None and (ret >= 0 or recovery is not None),
            }
        )
    return out


def regime_at(history: History, i: int) -> tuple[str, str] | None:
    """Cenário no mês i: tendência da Selic (6 meses) e apetite a risco global (S&P 500 vs média de 10 meses)."""
    selic, sp = history.macro.get("selic"), history.macro.get("sp500")
    if not selic or not sp or i < 9 or i >= len(selic):
        return None
    if selic[i] is None or selic[i - 6] is None:
        return None
    window = [v for v in sp[i - 9 : i + 1] if v is not None]
    if sp[i] is None or len(window) < 8:
        return None
    delta = selic[i] - selic[i - 6]
    trend = "alta" if delta > 0.75 else "queda" if delta < -0.75 else "estavel"
    world = "favoravel" if sp[i] >= fmean(window) else "adverso"
    return trend, world


def regime_label(regime: tuple[str, str]) -> str:
    return f"{SELIC_TREND_LABELS[regime[0]]} e {GLOBAL_LABELS[regime[1]]}"


def regimes(history: History) -> list[tuple[str, str] | None]:
    return [regime_at(history, i) for i in range(len(history.months))]


def last_valid(series: Series | None, upto: int) -> tuple[int, float] | None:
    if not series:
        return None
    for i in range(min(upto, len(series) - 1), -1, -1):
        if series[i] is not None:
            return i, series[i]
    return None


def current_scenario(history: History, regime_list: list) -> dict:
    """Cenário atual com os números que o definem."""
    last = len(history.months) - 1
    # O último mês pode estar sem macro ainda: usa o mais recente com cenário definido.
    idx = next((i for i in range(last, max(-1, last - 4), -1) if regime_list[i] is not None), None)
    out: dict = {"month": history.months[idx] if idx is not None else None}
    if idx is not None:
        out.update(key="|".join(regime_list[idx]), label=regime_label(regime_list[idx]))
        out["similar_months"] = sum(1 for r in regime_list[:idx] if r == regime_list[idx])
    indicators = {}
    for key, label, unit in (
        ("selic", "Selic", "% a.a."),
        ("ipca_12m", "IPCA 12 meses", "%"),
        ("usd_brl", "Dólar", "R$"),
        ("sp500", "S&P 500", "pts"),
        ("us10y", "Juro de 10 anos dos EUA", "% a.a."),
    ):
        point = last_valid(history.macro.get(key), last)
        if point is None:
            continue
        i, value = point
        before = history.macro[key][i - 12] if i >= 12 else None
        indicators[key] = {
            "label": label,
            "unit": unit,
            "value": round(value, 4),
            "month": history.months[i],
            "change_12m": round(value - before, 4) if before is not None and unit != "pts" and unit != "R$" else None,
            "return_12m": round(value / before - 1, 4) if before and unit in ("pts", "R$") else None,
        }
    out["indicators"] = indicators
    return out


def regime_performance(history: History, levels: Series, regime_list: list, regime: tuple[str, str]) -> dict | None:
    """Retorno médio anualizado nos meses (até hoje) que começaram no mesmo cenário."""
    rets = monthly_returns(levels)
    sample = [rets[i] for i in range(1, len(rets)) if regime_list[i - 1] == regime and rets[i] is not None]
    if len(sample) < 6:
        return None
    return {"months": len(sample), "avg_annual": round((1 + fmean(sample)) ** 12 - 1, 4)}
