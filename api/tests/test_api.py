from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.providers.brapi import parse_quote
from app.ranking.service import market_is_open

from .conftest import make_quote

SP = ZoneInfo("America/Sao_Paulo")


class FakeProvider:
    name = "fake"
    realtime = True

    def __init__(self, quotes):
        self._quotes = quotes

    async def quotes(self, tickers, history_days=180):
        return self._quotes


@pytest.fixture
def client(quotes):
    app = create_app(Settings(_env_file=None), start_scheduler=False)
    app.state.ranking.provider = FakeProvider(quotes)
    return TestClient(app)


def test_ranking_flow(client):
    assert client.get("/ranking/acoes").status_code == 503
    assert client.post("/ranking/recompute").status_code == 200
    body = client.get("/ranking/acoes").json()
    assert body["assets"][0]["ticker"] == "ALTA3"
    assert body["data_realtime"] is True
    assert "Não é recomendação" in body["disclaimer"]
    asset = client.get("/assets/alta3").json()
    assert asset["asset"]["rank"] == 1


def test_unknown_class_and_ticker(client):
    assert client.get("/ranking/cripto").status_code == 404
    client.post("/ranking/recompute")
    assert client.get("/assets/XXXX3").status_code == 404


def test_explain_requires_key(client):
    client.post("/ranking/recompute")
    assert client.post("/assets/ALTA3/explain").status_code == 503


@respx.mock
def test_macro_parses_bcb(client):
    respx.get(url__regex=r".*bcdata\.sgs\.\d+/dados/ultimos/2.*").mock(
        return_value=httpx.Response(200, json=[{"data": "01/09/2026", "valor": "10.0"}, {"data": "01/10/2026", "valor": "10.5"}])
    )
    indicators = client.get("/macro").json()["indicators"]
    assert {i["key"] for i in indicators} == {"selic", "ipca_12m", "usd_brl"}
    assert indicators[0]["value"] == 10.5 and indicators[0]["previous"] == 10.0


def test_market_hours():
    s = Settings(_env_file=None)
    assert market_is_open(s, datetime(2026, 10, 28, 11, 0, tzinfo=SP))  # quarta
    assert not market_is_open(s, datetime(2026, 10, 28, 19, 0, tzinfo=SP))
    assert not market_is_open(s, datetime(2026, 10, 31, 11, 0, tzinfo=SP))  # sábado


def test_parse_brapi_quote():
    q = parse_quote({
        "symbol": "PETR4", "longName": "Petrobras", "regularMarketPrice": 38.5,
        "regularMarketChangePercent": -1.2, "priceEarnings": 4.1,
        "historicalDataPrice": [{"date": 1767312000, "close": 37.0, "volume": 10}, {"date": 1767225600, "close": 36.0, "volume": 5}],
    })
    assert q.ticker == "PETR4" and q.price == 38.5
    assert [b.close for b in q.history] == [36.0, 37.0]
    assert q.fundamentals["price_earnings"] == 4.1
    assert q.logo_url == "https://icons.brapi.dev/icons/PETR4.svg"
    assert parse_quote({"symbol": "MXRF11", "logourl": "https://x/y.png"}).logo_url == "https://x/y.png"


def test_demo_mode_runs_offline():
    app = create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False)
    c = TestClient(app)
    c.post("/ranking/recompute")
    assert len(c.get("/ranking/fiis").json()["assets"]) == len(Settings(_env_file=None).fiis)
    assert len(c.get("/macro").json()["indicators"]) == 3
    assert all(a["logo_url"] for a in c.get("/ranking/acoes").json()["assets"])
