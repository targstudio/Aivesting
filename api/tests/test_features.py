"""Mercado, alertas e leituras da IA em cada tela."""

import asyncio

from fastapi.testclient import TestClient

from app.ai.insights import Insights, system_prompt
from app.alerts import Alert, evaluate
from app.config import Settings
from app.main import create_app
from app.market import MarketService, items_from_quotes
from app.ranking.engine import RankedAsset

from .conftest import make_quote


def demo_client(**kw):
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True, **kw), start_scheduler=False))
    c.post("/ranking/recompute")
    return c


def asset(**kw):
    base = dict(ticker="PETR4", name="Petrobras", asset_class="acoes", price=30.0, change_percent=-3.2,
                rank=2, score=90.0, probability_outperform=0.58)
    return RankedAsset(**(base | kw))


def test_market_overview_has_indices_and_movers():
    body = demo_client().get("/mercado").json()
    labels = {i["label"] for i in body["indices"]}
    assert {"Ibovespa", "Dólar", "S&P 500", "Petróleo Brent"} <= labels
    assert all(len(i["spark"]) == 30 for i in body["indices"])
    assert all(a["change_percent"] > 0 for a in body["altas"])
    assert all(a["change_percent"] < 0 for a in body["baixas"])
    assert sum(body["amplitude"].values()) == 28  # 16 ações + 12 FIIs no modo demonstração
    assert "pregao_aberto" in body


def test_market_items_skip_missing_symbols():
    items = items_from_quotes([make_quote("^BVSP", 0.001)])
    assert [i.label for i in items] == ["Ibovespa"] and len(items[0].spark) == 30


def test_ranked_assets_carry_spark():
    body = demo_client().get("/ranking/acoes").json()
    assert len(body["assets"][0]["spark"]) == 30


def test_alert_rules():
    a = asset()
    assert evaluate(Alert(id="1", ticker="petr4", kind="preco_abaixo", value=31), a).triggered
    assert not evaluate(Alert(id="2", ticker="PETR4", kind="preco_acima", value=31), a).triggered
    assert evaluate(Alert(id="3", ticker="PETR4", kind="queda_dia", value=3), a).triggered
    assert not evaluate(Alert(id="4", ticker="PETR4", kind="alta_dia", value=1), a).triggered
    assert evaluate(Alert(id="5", ticker="PETR4", kind="entrou_top", value=3), a).triggered
    r = evaluate(Alert(id="6", ticker="PETR4", kind="prob_acima", value=60), a)
    assert not r.triggered and r.current == 58.0
    missing = evaluate(Alert(id="7", ticker="XXXX3", kind="preco_acima", value=1), None)
    assert not missing.available and not missing.triggered


def test_alerts_endpoint():
    c = demo_client()
    top = c.get("/ranking/acoes").json()["assets"][0]
    alerts = [
        {"id": "a", "ticker": top["ticker"], "kind": "entrou_top", "value": 1},
        {"id": "b", "ticker": "XXXX3", "kind": "preco_acima", "value": 10},
    ]
    res = c.post("/alertas/avaliar", json={"alerts": alerts}).json()["resultados"]
    assert res[0]["triggered"] and not res[1]["available"]
    assert c.post("/alertas/avaliar", json={"alerts": [{"id": "x", "ticker": "PETR4", "kind": "nada", "value": 1}]}).status_code == 422
    assert c.post("/alertas/explicar", json={"alert": alerts[0]}).status_code == 503


def test_assets_list():
    ativos = demo_client().get("/ativos").json()["ativos"]
    assert len(ativos) == 28 and {"ticker", "name", "asset_class", "price"} <= set(ativos[0])


def test_reading_requires_key_and_valid_context():
    c = demo_client()
    assert c.get("/ia/leitura", params={"contexto": "mercado"}).status_code == 503
    c = demo_client(anthropic_api_key="k")
    assert c.get("/ia/leitura", params={"contexto": "../etc"}).status_code == 404
    assert c.get("/ia/leitura", params={"contexto": "mercado", "nivel": "guru"}).status_code == 422


def test_reading_is_cached_and_skips_rate_limit(monkeypatch):
    calls = []

    async def fake_complete(self, task, level, data, instruction):
        calls.append((task, level, data))
        return f"leitura {task}"

    monkeypatch.setattr(Insights, "_complete", fake_complete)
    c = demo_client(anthropic_api_key="k", ai_requests_per_hour=1)
    first = c.get("/ia/leitura", params={"contexto": "ranking:fiis"}).json()
    again = c.get("/ia/leitura", params={"contexto": "ranking:fiis"}).json()
    assert first["text"] == "leitura ranking" and not first["cached"] and again["cached"]
    assert len(calls) == 1
    assert calls[0][2]["ranking"]["indice_referencia"] == "IFIX"
    # Outro contexto gasta cota: o limite (1/hora) já foi usado.
    assert c.get("/ia/leitura", params={"contexto": "mercado"}).status_code == 429


def test_payloads_for_each_screen():
    c = demo_client()
    ins: Insights = c.app.state.insights
    for ctx, task in [("inicio", "inicio"), ("mercado", "mercado"), ("macro", "macro"), ("ranking:acoes", "ranking")]:
        built = asyncio.run(ins.payload(ctx))
        assert built and built[0] == task
    inicio = asyncio.run(ins.payload("inicio"))[1]
    assert "spark" not in inicio["indices"][0] and set(inicio["rankings"]) == {"acoes", "fiis"}
    assert asyncio.run(ins.payload("ranking:cripto")) is None
    assert asyncio.run(ins.payload("horizontes:acoes:7")) is None


def test_alert_explanation_uses_asset_and_market(monkeypatch):
    seen = {}

    async def fake_complete(self, task, level, data, instruction):
        seen.update(task=task, level=level, data=data)
        return "explicação"

    monkeypatch.setattr(Insights, "_complete", fake_complete)
    c = demo_client(anthropic_api_key="k")
    top = c.get("/ranking/fiis").json()["assets"][0]["ticker"]
    body = c.post("/alertas/explicar", json={"alert": {"id": "z", "ticker": top, "kind": "entrou_top", "value": 3},
                                             "level": "avancado"}).json()
    assert body["explanation"] == "explicação" and body["result"]["triggered"]
    assert seen["task"] == "alertas" and seen["level"] == "avancado"
    assert seen["data"]["ativo"]["ticker"] == top and seen["data"]["indices"]


def test_prompts_never_recommend():
    for task in ("inicio", "mercado", "ranking", "macro", "horizontes", "alertas"):
        prompt = system_prompt(task, "iniciante")
        assert "não diga para comprar, vender ou manter" in prompt


def test_market_service_caches():
    class Source:
        n = 0

        async def symbols(self, symbols, range_="3mo"):
            Source.n += 1
            return [make_quote("^BVSP", 0.001)]

    svc = MarketService(Source())
    asyncio.run(svc.items())
    asyncio.run(svc.items())
    assert Source.n == 1


def test_asset_explanation_is_cached(monkeypatch):
    from app.ai.explain import Explainer

    calls = []

    async def fake_explain(self, asset, snapshot, macro, level_note=""):
        calls.append(level_note)
        return f"explicação de {asset.ticker}"

    monkeypatch.setattr(Explainer, "explain", fake_explain)
    c = demo_client(anthropic_api_key="k")
    top = c.get("/ranking/acoes").json()["assets"][0]["ticker"]
    for _ in range(2):
        assert c.post(f"/assets/{top}/explain?nivel=avancado").json()["explanation"] == f"explicação de {top}"
    assert len(calls) == 1 and "técnica" in calls[0]
