import json
import random

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.longterm.build import build
from app.longterm.history import from_dict
from app.longterm.model import FeatureBuilder, build_samples, fit_logistic, walk_forward
from app.longterm.stats import crisis_behaviour, regimes, risk_metrics
from app.main import create_app

from .longterm_data import month_range, synthetic_history


@pytest.fixture(scope="module")
def history():
    return from_dict(synthetic_history())


@pytest.fixture(scope="module")
def result(history):
    return build(history)


def test_missing_index_falls_back_to_equal_weight(history):
    assert history.benchmarks["acoes"].label == "Ibovespa" and not history.benchmarks["acoes"].proxy
    assert history.benchmarks["fiis"].proxy
    assert history.benchmarks["fiis"].label == "média dos FIIs do app"


def test_logistic_recovers_signal():
    rng = random.Random(1)
    xs = [[rng.gauss(0, 1), rng.gauss(0, 1)] for _ in range(3000)]
    ys = [int(rng.random() < 1 / (1 + 2.718 ** -(1.5 * x[0]))) for x in xs]
    model = fit_logistic(xs, ys, [1.0] * len(xs), l2=0.1)
    assert model.coefs[0] > 1.0 and abs(model.coefs[1]) < 0.3


def test_random_walks_are_not_validated(result):
    # Preços aleatórios: nenhum fator deveria prever o futuro, então o app usa só a frequência histórica.
    for info in result["classes"].values():
        for h in info["horizons"].values():
            assert not h["model_used"]
            probs = {a["prob_beat_benchmark"] for a in h["assets"]}
            assert len(probs) == 1
            sharpes = [a["sharpe_10y"] for a in h["assets"]]
            assert sharpes == sorted(sharpes, reverse=True)


def test_persistent_signal_is_validated():
    months = month_range(2001, "2026-09")
    assets = {}
    for k in range(10):
        rng, level, series = random.Random(k), 100.0, {}
        drift = (k - 4.5) * 0.002  # diferença de tendência persistente entre os ativos
        for m in months:
            level *= 1 + drift + rng.gauss(0, 0.02)
            series[m] = level
        assets[f"ATV{k}3"] = {"name": f"Ativo {k}", "class": "acoes", "monthly": series}
    data = {"assets": assets, "benchmarks": {}, "macro": {"cdi": {m: 0.8 for m in months}}}
    out = build(from_dict(data))
    one_year = out["classes"]["acoes"]["horizons"]["1"]
    assert one_year["model_used"]
    assert one_year["beat_benchmark"]["validation"]["auc"] > 0.7
    assert one_year["assets"][0]["ticker"] == "ATV93"


def test_walk_forward_trains_only_on_known_outcomes(history, monkeypatch):
    fb = FeatureBuilder(history, "acoes", regimes(history))
    samples = build_samples(history, fb, 36)
    seen = []
    import app.longterm.model as model

    real_fit = model.fit_logistic

    def spy(xs, ys, ws, **kw):
        seen.append(len(xs))
        return real_fit(xs, ys, ws, **kw)

    monkeypatch.setattr(model, "fit_logistic", spy)
    report = walk_forward(samples, "beat_benchmark", 36, history.first)
    assert report["oos_samples"] > 0
    # O primeiro treino só pode usar janelas encerradas antes do primeiro ano testado.
    assert seen and seen[0] < len(samples) / 2


def test_crisis_and_recovery():
    data = synthetic_history()
    h = from_dict(data)
    levels = [None] * len(h.months)
    for i in range(len(levels)):
        levels[i] = 100.0
    covid_start, covid_end = h.index_of("2020-01"), h.index_of("2020-03")
    levels[covid_end] = 70.0
    for i in range(covid_end + 1, covid_end + 5):
        levels[i] = 90.0
    covid = next(c for c in crisis_behaviour(h, levels) if c["key"] == "2020")
    assert covid["return"] == -0.3
    assert covid["recovery_months"] == 5 and covid["recovered"]
    assert levels[covid_start] == 100.0


def test_risk_metrics_against_cdi(history):
    m = risk_metrics(history.prices["ACAO7"], history.cdi, len(history.months) - 1)
    assert m["months"] == 120
    assert m["max_drawdown"] <= 0 and m["volatility"] > 0
    assert m["cdi_cagr"] > 0.05


def test_api_serves_horizons(result, tmp_path):
    path = tmp_path / "longterm.json"
    path.write_text(json.dumps(result))
    client = TestClient(create_app(Settings(_env_file=None, longterm_path=str(path)), start_scheduler=False))
    body = client.get("/horizontes/acoes/5").json()
    assert body["years"] == 5 and body["assets"][0]["rank"] == 1
    assert "não é recomendação" in body["disclaimer"].lower()
    assert client.get("/horizontes/acoes/7").status_code == 404
    overview = client.get("/horizontes").json()
    assert overview["scenario"]["label"] and "assets" not in overview
    hist = client.get("/assets/acao3/historico").json()
    assert hist["ticker"] == "ACAO3" and len(hist["crises"]) == 6 and set(hist["horizons"]) == {"1", "3", "5", "10"}


def test_api_without_calibration(tmp_path):
    client = TestClient(
        create_app(Settings(_env_file=None, longterm_path=str(tmp_path / "nada.json")), start_scheduler=False)
    )
    assert client.get("/horizontes/acoes/1").status_code == 503
