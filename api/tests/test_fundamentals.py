import asyncio

import httpx
from fastapi.testclient import TestClient

from app.config import Settings
from app.fundamentals import FundamentalsService, parse_fundamentals
from app.main import create_app

RAW = {
    "symbol": "ITUB4",
    "regularMarketPrice": 40.0,
    "priceEarnings": 9.5,
    "earningsPerShare": 4.2,
    "marketCap": 3.9e11,
    "defaultKeyStatistics": {"bookValue": 20.0, "enterpriseToEbitda": None},
    "financialData": {"returnOnEquity": 0.22, "profitMargins": 0.18, "debtToEquity": None},
}


def test_parse_computes_missing_price_to_book():
    f = parse_fundamentals(RAW)
    assert f["price_earnings"] == 9.5
    assert f["price_to_book"] == 2.0  # 40 / 20
    assert f["roe"] == 0.22 and f["debt_to_equity"] is None


def test_service_uses_brapi_modules_and_caches():
    calls = []

    def handler(request: httpx.Request):
        calls.append(request.url)
        return httpx.Response(200, json={"results": [RAW]})

    svc = FundamentalsService("https://brapi.dev/api", "tok", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert asyncio.run(svc.get("itub4"))["price_to_book"] == 2.0
    asyncio.run(svc.get("ITUB4"))
    assert len(calls) == 1
    assert "defaultKeyStatistics" in str(calls[0])


def test_without_token_uses_free_screener():
    app = create_app(Settings(_env_file=None, brapi_token="", data_provider="yahoo"), start_scheduler=False)
    app.state.trader.raw = None
    c = TestClient(app)
    # Sem brapi paga, os números vêm da varredura gratuita do curto prazo; sem ela carregada, não há card.
    assert c.get("/assets/ITUB4/fundamentos").status_code == 404
    assert c.get("/health").json()["fundamentals"] is True
    app.state.trader.raw = {"acoes": [{"ticker": "ITUB4", "p_vp": 1.9, "p_l": 9.0, "debt_equity": 0.5}], "fiis": []}
    body = c.get("/assets/ITUB4/fundamentos").json()
    assert body["price_to_book"] == 1.9 and body["debt_to_equity"] == 50.0
