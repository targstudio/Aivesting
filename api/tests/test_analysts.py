import asyncio
from datetime import datetime, timezone

import httpx
from fastapi.testclient import TestClient

from app.analysts import AnalystService, build, grade_side
from app.config import Settings
from app.main import create_app

NOW = datetime(2026, 10, 29, tzinfo=timezone.utc)
TS = int(datetime(2026, 9, 1, tzinfo=timezone.utc).timestamp())
OLD = int(datetime(2023, 1, 1, tzinfo=timezone.utc).timestamp())

LOCAL = {
    "recommendationTrend": {"trend": [
        {"period": "0m", "strongBuy": 2, "buy": 5, "hold": 4, "sell": 1, "strongSell": 0},
        {"period": "-1m", "strongBuy": 1, "buy": 5, "hold": 4, "sell": 1, "strongSell": 0},
    ]},
    "financialData": {"currentPrice": {"raw": 30.0}, "targetMeanPrice": {"raw": 36.0}, "targetHighPrice": {"raw": 45.0},
                      "targetLowPrice": {"raw": 28.0}, "numberOfAnalystOpinions": {"raw": 12}},
    "upgradeDowngradeHistory": {"history": [
        {"epochGradeDate": TS, "firm": "BTG Pactual", "toGrade": "Buy", "fromGrade": "Neutral", "action": "up"},
        {"epochGradeDate": OLD, "firm": "Antiga", "toGrade": "Sell", "fromGrade": "", "action": "down"},
    ]},
}
ADR = {"upgradeDowngradeHistory": {"history": [
    {"epochGradeDate": TS - 86400, "firm": "Morgan Stanley", "toGrade": "Underweight", "fromGrade": "Equal-Weight"},
    {"epochGradeDate": TS - 2 * 86400, "firm": "Morgan Stanley", "toGrade": "Overweight", "fromGrade": ""},
    {"epochGradeDate": TS - 86400, "firm": "BTG Pactual", "toGrade": "Sell", "fromGrade": ""},
]}}


def test_grade_side():
    assert grade_side("Overweight") == "compra"
    assert grade_side("Market Perform") == "neutro"
    assert grade_side("Underperform") == "venda"
    assert grade_side("Not Rated") is None


def test_build_counts_targets_and_firms():
    r = build("PETR4", LOCAL, "PBR", ADR, NOW)
    assert r["counts"] == {"compra": 7, "neutro": 4, "venda": 1, "total": 12}
    assert r["upside"] == 0.2 and r["analysts"] == 12
    firms = {f["firm"]: f for f in r["firms"]}
    # Nota antiga demais fica de fora; vale a mais recente de cada casa; a da B3 tem prioridade sobre a da ADR.
    assert "Antiga" not in firms
    assert firms["Morgan Stanley"]["side"] == "venda" and firms["Morgan Stanley"]["source"] == "ADR PBR"
    assert firms["BTG Pactual"]["side"] == "compra" and firms["BTG Pactual"]["source"] == "B3"


def test_build_none_without_data():
    assert build("XPTO3", {}, None, None, NOW) is None


def test_service_uses_crumb_and_caches():
    calls = []

    def handler(request: httpx.Request):
        calls.append(str(request.url))
        if request.url.host == "fc.yahoo.com":
            return httpx.Response(404)
        if request.url.path.endswith("getcrumb"):
            return httpx.Response(200, text="abc123")
        sym = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json={"quoteSummary": {"result": [LOCAL if sym.endswith(".SA") else ADR]}})

    svc = AnalystService(client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    r = asyncio.run(svc.get("petr4"))
    assert r["adr"] == "PBR" and r["counts"]["total"] == 12
    asyncio.run(svc.get("PETR4"))
    summary_calls = [c for c in calls if "quoteSummary" in c]
    assert len(summary_calls) == 2 and all("crumb=abc123" in c for c in summary_calls)


def test_endpoint_demo():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    body = c.get("/assets/ITUB4/analistas").json()
    assert body["counts"]["total"] > 0 and body["disclaimer"]
    assert c.get("/assets/HGLG11/analistas").status_code == 404
