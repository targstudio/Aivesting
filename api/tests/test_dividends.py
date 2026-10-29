import asyncio
from datetime import date

from fastapi.testclient import TestClient

from app.config import Settings
from app.dividends import DividendService, summarize
from app.main import create_app
from app.portfolio import Holding
from app.providers.yahoo import parse_dividends

TODAY = date(2026, 10, 15)


def test_parse_yahoo_events():
    raw = {
        "meta": {"regularMarketPrice": 10.0},
        "events": {"dividends": {"1": {"amount": 0.1, "date": 1754006400}, "2": {"amount": 0.12, "date": 1751328000}}},
    }
    payments, price = parse_dividends(raw)
    assert price == 10.0
    assert [v for _, v in payments] == [0.12, 0.1]  # ordenado por data


def test_summary_yield_and_frequency():
    payments = [(date(2025, m, 10), 0.1) for m in range(1, 13)] + [(date(2026, m, 10), 0.1) for m in range(1, 11)]
    s = summarize("MXRF11", payments, 10.0, TODAY)
    assert s["months_paid_12m"] == 12
    assert s["frequency"] == "mensal"
    assert abs(s["dy_12m"] - 0.12) < 1e-9


class FakeYahoo:
    async def dividends(self, ticker):
        if ticker == "ERRO3":
            raise RuntimeError("fora do ar")
        return [(date(2026, 3, 10), 1.0), (date(2026, 9, 10), 0.5), (date(2024, 1, 10), 9.0)], 20.0


def test_portfolio_income_by_month():
    svc = DividendService(FakeYahoo())
    holdings = [
        Holding(asset_class="acoes", ticker="ABCD3", quantity=100),
        Holding(asset_class="acoes", ticker="ERRO3", quantity=10),
        Holding(asset_class="renda_fixa", name="CDB", value=1000),
    ]
    r = asyncio.run(svc.portfolio(holdings, TODAY))
    assert r["income_12m"] == 150.0  # o provento de 2024 fica fora dos 12 meses
    months = {m["month"]: m["value"] for m in r["received"]}
    assert months["2026-03"] == 100.0 and months["2026-09"] == 50.0
    assert {m["month"] for m in r["forecast"]} >= {"2027-03", "2027-09"}
    assert next(a for a in r["assets"] if a["ticker"] == "ERRO3")["available"] is False
    assert r["ignored"] == 1


def test_endpoints_in_demo_mode():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    r = c.get("/assets/MXRF11/proventos")
    assert r.status_code == 200 and r.json()["frequency"] == "mensal"
    assert set(c.get("/proventos?tickers=MXRF11,PETR4").json()) == {"MXRF11", "PETR4"}
    r = c.post("/carteira/proventos", json={"holdings": [{"asset_class": "fiis", "ticker": "MXRF11", "quantity": 100}]})
    assert r.status_code == 200 and r.json()["income_12m"] > 0
