from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.trading.backtest import Condition, Strategy, preset_strategy, run
from app.trading.data import INTERVALS, Candle, synthetic
from app.trading.indicators import ema, rsi, vwap
from app.trading.journal import Trade, monthly_tax, summarize
from app.trading.ai import guess_strategy
from app.trading.routes import market_phase
from app.trading.setups import analyze, detect


def test_rsi_matches_wilder_reference():
    v = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28]
    assert round(rsi(v, 14)[14], 2) == 70.46


def test_ema_warmup_is_none():
    out = ema([1.0] * 5 + [2.0] * 5, 5)
    assert out[3] is None and out[4] == 1.0 and out[-1] > 1.8


def test_vwap_resets_each_day():
    day1, day2 = 1_763_900_000, 1_763_900_000 + 86400
    cs = [Candle(day1, 10, 10, 10, 10, 100), Candle(day1 + 300, 20, 20, 20, 20, 100), Candle(day2, 50, 50, 50, 50, 10)]
    assert vwap(cs) == [10, 15, 50]


def bars(closes, start=1_700_000_000, step=86400):
    return [Candle(start + i * step, c, c * 1.01, c * 0.99, c, 1000) for i, c in enumerate(closes)]


def test_entry_fills_on_next_open_and_stop_wins_ties():
    closes = [10.0] * 40 + [11.0] + [11.5] * 5 + [12.0] * 30
    cs = bars(closes)
    s = Strategy(ticker="TEST3", entrada=[Condition(esquerda="preco", operador="cruza_acima", direita="10.5")],
                 stop_pct=50, capital=10_000, slippage_pct=0, taxa_b3_pct=0)
    res = run(s, cs)
    trade = res["operacoes"][0]
    assert trade["entrada"] == cs[41].t  # sinal no candle 40, execução na abertura do 41
    assert trade["preco_entrada"] == 11.5
    assert trade["quantidade"] == 800  # lote de 100


def test_gap_through_stop_exits_at_open():
    closes = [10.0] * 40 + [11.0, 11.0, 8.0] + [8.0] * 30
    cs = bars(closes)
    s = Strategy(ticker="TEST3", entrada=[Condition(esquerda="preco", operador="cruza_acima", direita="10.5")],
                 stop_pct=5, slippage_pct=0, taxa_b3_pct=0)
    t = run(s, cs)["operacoes"][0]
    assert t["motivo"] == "stop" and t["preco_saida"] == 8.0


def test_day_trade_never_holds_overnight():
    s = preset_strategy("vwap_day", "PETR4")
    data = synthetic("PETR4", INTERVALS["5m"])
    res = run(s, data["candles"])
    from app.trading.indicators import day_key
    for t in res["operacoes"]:
        assert day_key(t["entrada"]) == day_key(t["saida"])


def test_day_trade_requires_intraday():
    s = preset_strategy("mme_9_21", "PETR4").model_copy(update={"modalidade": "day_trade"})
    with pytest.raises(ValueError):
        run(s, synthetic("PETR4", INTERVALS["1d"])["candles"])


def test_unknown_series_rejected():
    with pytest.raises(ValueError):
        Condition(esquerda="foo", operador="acima", direita="1")


def test_every_preset_runs():
    from app.trading.backtest import PRESETS
    for p in PRESETS:
        s = preset_strategy(p["id"], "VALE3")
        res = run(s, synthetic("VALE3", INTERVALS[s.intervalo])["candles"])
        assert res["metricas"]["operacoes"] >= 1


def test_analyze_has_levels_and_setups():
    a = analyze(synthetic("PETR4", INTERVALS["5m"]), intraday=True)
    assert {"pivo_PP", "vwap", "stop_compra_atr"} <= set(a["levels"])
    assert any(s["key"] in ("acima_vwap", "abaixo_vwap") for s in a["setups"])


def test_detect_breakout():
    closes = [10.0 + 0.01 * (i % 3) for i in range(40)] + [12.0]
    assert "rompeu_maxima20" in detect(bars(closes), intraday=False)


def trade(i, res, modalidade="day_trade", ticker="PETR4", month=1, setup="A"):
    return Trade(id=str(i), data=date(2026, month, 5), ticker=ticker, modalidade=modalidade, quantidade=100,
                 preco_entrada=10, preco_saida=10 + res / 100, setup=setup)


def test_day_trade_tax_with_loss_carry_and_irrf():
    months = monthly_tax([trade(1, -300, month=1), trade(2, 1000, month=2)])
    assert months[0]["imposto"] == 0
    assert months[1]["imposto"] == pytest.approx(140)  # 20% de (1000 - 300)
    assert months[1]["irrf_retido"] == pytest.approx(10)  # 1% do lucro
    assert months[1]["darf"] == pytest.approx(130)


def test_swing_small_sales_exempt():
    months = monthly_tax([trade(1, 500, modalidade="swing")])
    assert months[0]["isento_swing_acoes"] and months[0]["imposto"] == 0


def test_swing_fii_not_exempt():
    months = monthly_tax([trade(1, 500, modalidade="swing", ticker="MXRF11")])
    assert months[0]["imposto"] == pytest.approx(100)


def test_journal_summary():
    trades = [trade(i, 200 if i % 3 else -150, setup="A" if i % 2 else "B") for i in range(12)]
    s = summarize(trades)
    assert s["geral"]["operacoes"] == 12
    assert set(s["por_setup"]) == {"A", "B"}
    assert s["observacoes"]


def test_guess_strategy_reads_text():
    s, _ = guess_strategy("day trade em VALE3 na vwap com stop de 1% e alvo de 2%", "PETR4")
    assert s.ticker == "VALE3" and s.modalidade == "day_trade" and s.intervalo == "5m"
    assert s.stop_pct == 1 and s.alvo_pct == 2


def test_market_phase():
    from datetime import datetime
    from app.trading.data import SAO_PAULO
    assert market_phase(datetime(2026, 11, 23, 11, 0, tzinfo=SAO_PAULO))["aberto"]
    assert market_phase(datetime(2026, 11, 22, 11, 0, tzinfo=SAO_PAULO))["fase"] == "fechado"
    assert market_phase(datetime(2026, 11, 23, 16, 57, tzinfo=SAO_PAULO))["fase"] == "call_fechamento"


@pytest.fixture
def client():
    app = create_app(Settings(demo_mode=True, anthropic_api_key=""), start_scheduler=False)
    with TestClient(app) as c:
        yield c


def test_routes(client):
    r = client.get("/trading/candles/PETR4?intervalo=15m")
    assert r.status_code == 200
    body = r.json()
    assert len(body["candles"]) == len(body["series"]["mme9"]) and "vwap" in body["series"]
    assert client.get("/trading/candles/XX?intervalo=1d").status_code == 404
    assert client.get("/trading/radar?visao=day_trade").status_code == 200
    assert client.get("/trading/estrategias").json()["prontas"]
    r = client.post("/trading/backtest/pronta", json={"preset": "setup_91", "ticker": "ITUB4"})
    assert r.status_code == 200 and "metricas" in r.json()
    r = client.post("/trading/backtest/texto", json={"texto": "IFR2 abaixo de 10 em BBAS3", "ticker": "PETR4"})
    assert r.status_code == 200 and r.json()["estrategia"]["ticker"] == "BBAS3"
    r = client.post("/trading/diario/resumo", json={"trades": [
        {"id": "1", "data": "2026-11-03", "ticker": "PETR4", "quantidade": 100, "preco_entrada": 30, "preco_saida": 31}
    ]})
    assert r.status_code == 200 and r.json()["geral"]["resultado"] == 100
    assert client.get("/trading/pregao").status_code == 200
