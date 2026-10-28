import asyncio
import base64
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.ai.portfolio_ai import ImageError, PortfolioAI, clean_holdings, decode_image
from app.config import Settings
from app.longterm.service import LongTermService
from app.main import create_app
from app.portfolio import Holding, advisor_bucket, analyze, compare_with_plan

HOLDINGS = [
    Holding(ticker="ITUB4", name="ITAU PN", asset_class="acoes", quantity=100, avg_price=30, value=4000),
    Holding(ticker="BBAS3", name="BB ON", asset_class="acoes", quantity=50, avg_price=20, value=1000),
    Holding(ticker="HGLG11", name="FII HGLG", asset_class="fiis", quantity=10, avg_price=150, value=1600),
    Holding(name="CDB Banco X 110% CDI", asset_class="renda_fixa", indexer="pos", value=3000),
    Holding(ticker="IVVB11", name="ISHARES S&P 500", asset_class="etf", quantity=1, value=400),
]


def test_holding_normalizes_ticker_and_buckets():
    assert Holding(ticker=" petr4.sa ").ticker == "PETR4"
    assert Holding(ticker="").ticker is None
    assert advisor_bucket(Holding(ticker="IVVB11", asset_class="etf")) == "internacional"
    assert advisor_bucket(Holding(ticker="BOVA11", asset_class="etf")) == "acoes"
    assert advisor_bucket(Holding(asset_class="renda_fixa", indexer="ipca")) == "rf_ipca"
    assert advisor_bucket(Holding(asset_class="caixa")) == "reserva"


def test_analyze_groups_concentration_and_alerts():
    a = analyze(HOLDINGS)
    assert a["total"] == 10_000
    assert [p["ticker"] for p in a["positions"]][0] == "ITUB4" and a["positions"][0]["weight"] == 0.4
    assert {g["key"]: g["pct"] for g in a["by_class"]} == {"acoes": 0.5, "renda_fixa": 0.3, "fiis": 0.16, "etf": 0.04}
    assert a["by_sector"][0] == {"key": "Financeiro (bancos, bolsa e seguros)", "label": "Financeiro (bancos, bolsa e seguros)", "value": 5000, "count": 2, "pct": 0.5}
    assert a["concentration"]["largest"]["ticker"] == "ITUB4" and a["concentration"]["top3_pct"] == 0.86
    texts = " ".join(x["text"] for x in a["alerts"])
    assert "ITUB4 é 40,0%" in texts and "Financeiro (bancos, bolsa e seguros) soma 50,0%" in texts
    # A renda fixa não entra no alerta de teto por ativo.
    assert "CDB" not in texts
    itub = a["positions"][0]
    assert itub["cost"] == 3000 and itub["result"] == 1000 and itub["result_pct"] == pytest.approx(0.3333, abs=1e-4)
    assert a["result"]["cost"] == 3000 + 1000 + 1500 and a["result"]["covered_pct"] == 0.66


def test_analyze_uses_live_price_and_skips_empty():
    holdings = [Holding(ticker="PETR4", asset_class="acoes", quantity=10, price=30, value=300), Holding(ticker="X")]
    a = analyze(holdings, ranked={"PETR4": {"price": 40, "rank": 1, "total": 5, "probability_outperform": 0.6}})
    assert a["total"] == 400 and len(a["positions"]) == 1
    assert a["positions"][0]["price_source"] == "app" and a["positions"][0]["ranking"]["rank"] == 1
    assert analyze([])["total"] == 0


def test_history_risk_with_longterm_data():
    lt = LongTermService().data
    a = analyze(HOLDINGS, longterm=lt)
    risk = a["risk"]
    # IVVB11 não tem histórico no app: 96% da carteira coberta (ações, FII e renda fixa pelo CDI).
    assert risk["coverage"] == 0.96 and len(risk["years"]) == 10
    assert risk["annual"] and risk["cagr"] is not None and risk["cdi_cagr"] is not None
    assert all(c["coverage"] <= 0.66 for c in risk["crises"])


def test_compare_with_plan():
    a = analyze(HOLDINGS)
    plan = {"allocation": [{"key": "rf_pos", "pct": 50}, {"key": "acoes", "pct": 30}, {"key": "internacional", "pct": 20}]}
    rows = {r["key"]: r for r in compare_with_plan(a, plan)}
    assert rows["acoes"]["diff_value"] == -2000 and rows["rf_pos"]["diff_value"] == 2000
    assert rows["fiis"]["target_pct"] == 0 and rows["internacional"]["diff_value"] == 1600


PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG fake").decode()


def test_decode_image():
    assert decode_image(PNG)[0] == "image/png"
    assert decode_image(PNG.replace("png", "jpg"))[0] == "image/jpeg"
    for bad in ("nada", "data:text/plain;base64,aGk=", "data:image/png;base64,***"):
        with pytest.raises(ImageError):
            decode_image(bad)


def test_clean_holdings():
    out = clean_holdings([
        {"ticker": "wege3", "name": "WEG", "asset_class": "acoes", "indexer": "pos", "quantity": 10, "price": 5.5,
         "avg_price": None, "value": None, "maturity": None},
        {"ticker": None, "name": "X", "asset_class": "invalida"},
    ])
    assert out == [{"ticker": "WEGE3", "name": "WEG", "asset_class": "acoes", "indexer": None, "quantity": 10,
                    "avg_price": None, "price": 5.5, "value": 55.0, "maturity": None}]


class FakeMessages:
    def __init__(self, payload: dict):
        self.payload = payload
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(self.payload))])


def test_extract_sends_images_and_schema():
    ai = PortfolioAI("sk-test", "claude-opus-5-5")
    fake = FakeMessages({"broker": "Corretora", "section_totals": [{"label": "Ações", "value": 100}], "warnings": [],
                         "holdings": [{"ticker": "ABEV3", "name": "AMBEV", "asset_class": "acoes", "indexer": None,
                                       "quantity": 10, "avg_price": 9, "price": 10, "value": 100, "maturity": None}]})
    ai.client = SimpleNamespace(beta=SimpleNamespace(messages=fake))
    result = asyncio.run(ai.extract([decode_image(PNG)]))
    assert result["holdings"][0]["ticker"] == "ABEV3"
    call = fake.calls[0]
    assert call["messages"][0]["content"][0]["type"] == "image"
    assert call["output_config"]["format"]["type"] == "json_schema"


def test_endpoints():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    c.post("/ranking/recompute")
    body = {"holdings": [h.model_dump() for h in HOLDINGS]}
    a = c.post("/carteira/analise", json=body).json()
    assert a["total"] > 0 and a["disclaimer"] and "plan" not in a
    advisor = {"answers": dict(objetivo=1, prazo=3, reacao_queda=1, experiencia=1, oscilacao=1), "amount": 1,
               "has_reserve": True}
    a = c.post("/carteira/analise", json={**body, "advisor": advisor}).json()
    assert a["plan"]["profile"] and a["plan"]["comparison"]
    # Sem chave da IA e sem banco: respostas claras.
    assert c.post("/carteira/ler", json={"images": [PNG]}).status_code == 503
    assert c.get("/carteira/00000000-0000-0000-0000-000000000000").status_code == 503
    assert c.post("/carteira/ler", json={"images": []}).status_code == 422
    assert c.get("/health").json()["portfolio_storage"] is False
