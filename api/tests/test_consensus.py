import asyncio

from fastapi.testclient import TestClient

from app.analysts import AnalystService
from app.config import Settings
from app.consensus import ConsensusService, build, liquid_universe, verdict
from app.main import create_app


def counts(b, h, s):
    return {"compra": b, "neutro": h, "venda": s, "total": b + h + s}


def test_verdict():
    assert verdict(counts(5, 2, 1)) == "compra"
    assert verdict(counts(1, 4, 1)) == "neutro"
    assert verdict(counts(1, 1, 3)) == "venda"
    assert verdict(counts(2, 2, 0)) == "neutro"


def test_build_shrinks_small_coverage_and_skips_few_analysts():
    firms = [{"firm": "JPMorgan", "side": "venda", "grade": "Underweight", "date": "2026-10-01", "source": "ADR X"}]
    results = {
        "POUC3": {"counts": counts(3, 0, 0), "upside": 0.2, "price": 10, "target_mean": 12},
        "MUIT3": {"counts": counts(14, 1, 0), "upside": 0.1, "price": 10, "target_mean": 11, "firms": firms},
        "DIVI3": {"counts": counts(2, 1, 0), "upside": None},  # 3 analistas: entra
        "NADA3": {"counts": counts(1, 1, 0)},  # só 2: fica de fora
        "ERRO3": None,
    }
    snap = build(results, {"MUIT3": "Muito Acompanhada"}, {"MUIT3": {"dy": 0.08, "p_vp": 1.1, "p_l": 7}})
    assert [a["ticker"] for a in snap["assets"]] == ["MUIT3", "POUC3", "DIVI3"]
    top = snap["assets"][0]
    assert top["rank"] == 1 and top["name"] == "Muito Acompanhada" and top["dy"] == 0.08
    assert top["verdict_label"] == "Compra"
    assert top["firms"][0] == {"firm": "JPMorgan", "side": "venda", "side_label": "Venda", "date": "2026-10-01", "source": "ADR X"}
    assert snap["checked"] == 5 and snap["covered"] == 3


def test_liquid_universe_one_ticker_per_company():
    class T:
        raw = {"acoes": [
            {"ticker": "PETR4", "liquidity": 9e8}, {"ticker": "PETR3", "liquidity": 3e8}, {"ticker": "VALE3", "liquidity": 8e8},
        ]}
    assert liquid_universe(T(), ["WEGE3"], size=5) == ["WEGE3", "PETR4", "VALE3"]


def test_service_views_demo(tmp_path):
    svc = ConsensusService(AnalystService(demo=True), universe=lambda: ["PETR4", "VALE3", "ITUB4", "MXRF11"],
                           path=tmp_path / "c.json")
    asyncio.run(svc.refresh())
    view = svc.view("compra")
    assert view["covered"] == 3  # FII sem cobertura
    assert view["assets"][0]["verdict"] in ("compra", "neutro", "venda")
    by_upside = [a["upside"] for a in svc.view("potencial")["assets"]]
    assert by_upside == sorted(by_upside, reverse=True)
    svc.save()
    again = ConsensusService(AnalystService(), path=tmp_path / "c.json")
    assert again.snapshot["covered"] == 3


def test_endpoint_demo():
    app = create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False)
    c = TestClient(app)
    body = c.get("/consenso").json()
    assert body["assets"] and body["coverage_note"]
    assert {"verdict", "verdict_label", "counts", "upside"} <= set(body["assets"][0])
    assert c.get("/consenso?ordem=xyz").status_code == 404
