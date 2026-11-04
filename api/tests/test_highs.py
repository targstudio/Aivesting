import asyncio
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.config import Settings
from app.highs import HighsService, max_drawdown, max_rally, summarize
from app.main import create_app


def series(values, start=date(2016, 1, 1), step=30):
    return [(start + timedelta(days=step * i), v) for i, v in enumerate(values)]


def test_max_rally_from_trough_to_later_peak():
    s = series([10, 8, 4, 6, 12, 9, 3, 5])
    r = max_rally(s)
    assert r["change"] == 2.0  # de 4 a 12
    assert r["start"] == s[2][0].isoformat() and r["end"] == s[4][0].isoformat()
    assert max_drawdown(s)["change"] == -0.75  # de 12 a 3
    assert max_rally(series([5, 4, 3])) is None


def test_summarize_periods_and_best_moves():
    today = date(2026, 11, 3)
    daily = [(today - timedelta(days=400 - i), 10.0 + i * 0.01) for i in range(401)]
    daily[-100] = (daily[-100][0], daily[-101][1] * 1.2)  # um dia de +20%
    monthly = [(today - timedelta(days=30 * (130 - i)), 5.0 * 1.01**i) for i in range(131)]
    out = summarize("TEST3", daily, monthly)
    keys = [p["key"] for p in out["periods"]]
    assert keys == ["1d", "1s", "1m", "6m", "12m", "5a", "10a"]
    assert out["best_day"]["change"] == 0.2
    assert out["best_12m"]["change"] == round(1.01**12 - 1, 4)
    assert out["high_12m"]["below"] < 0
    assert out["up_month_share"] == 1.0


def test_new_asset_skips_long_periods():
    today = date(2026, 11, 3)
    daily = [(today - timedelta(days=100 - i), 10.0 + i) for i in range(101)]
    monthly = [(today - timedelta(days=30 * (3 - i)), 10.0 + 30 * i) for i in range(4)]
    keys = [p["key"] for p in summarize("NEWW3", daily, monthly)["periods"]]
    assert keys == ["1d", "1s", "1m"]


def test_endpoint_demo_mode():
    client = TestClient(create_app(Settings(demo_mode=True)))
    resp = client.get("/assets/PETR4/altas")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ticker"] == "PETR4" and body["max_rally"] and body["disclaimer"]
    assert client.get("/assets/xx/altas").status_code == 404
    movers = client.get("/b3/maiores-altas?tipo=fii&periodo=mes")
    assert movers.status_code == 200 and "altas" in movers.json()
    assert client.get("/b3/maiores-altas?tipo=xyz").status_code == 404


def test_service_caches():
    svc = HighsService()
    first = asyncio.run(svc.get("vale3"))
    assert first is asyncio.run(svc.get("VALE3"))
