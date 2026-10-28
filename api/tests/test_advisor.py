from fastapi.testclient import TestClient

from app.advisor import PlanRequest, ProfileAnswers, build_plan, classify
from app.ai.insights import Insights
from app.config import Settings
from app.main import create_app

CONSERVATIVE = dict(objetivo=0, prazo=1, reacao_queda=0, experiencia=0, oscilacao=0)
AGGRESSIVE = dict(objetivo=2, prazo=3, reacao_queda=2, experiencia=2, oscilacao=2)
MACRO = {"selic": 15.0, "ipca_12m": 4.8}


def test_classify_and_locks():
    assert classify(ProfileAnswers(**CONSERVATIVE))[0] == "conservador"
    assert classify(ProfileAnswers(**AGGRESSIVE))[0] == "arrojado"
    assert classify(ProfileAnswers(**{**AGGRESSIVE, "prazo": 0}))[0] == "conservador"
    assert classify(ProfileAnswers(**{**AGGRESSIVE, "reacao_queda": 0}))[0] == "moderado"


def test_plan_sums_and_reserve_first():
    req = PlanRequest(answers=ProfileAnswers(**AGGRESSIVE), amount=100_000, monthly_expenses=5_000,
                      monthly_contribution=1_000)
    plan = build_plan(req, MACRO)
    assert plan["profile"] == "arrojado"
    assert plan["allocation"][0]["key"] == "reserva" and plan["allocation"][0]["value"] == 30_000
    assert round(sum(i["value"] for i in plan["allocation"]), 2) == 100_000
    assert round(sum(i["pct"] for i in plan["allocation"])) == 100
    assert sum(c["value"] for c in plan["monthly_contribution"]) == 1_000
    # Juro real de 10,2% puxa 5 pontos de ações para IPCA+.
    assert plan["macro"]["juro_real"] == 10.2 and any("Juro real alto" in n for n in plan["notes"])


def test_conservative_without_tilt_and_with_reserve():
    req = PlanRequest(answers=ProfileAnswers(**CONSERVATIVE), amount=10_000, has_reserve=True)
    plan = build_plan(req, MACRO)
    keys = [i["key"] for i in plan["allocation"]]
    assert "reserva" not in keys and plan["variable_income_pct"] == 15
    assert not plan["notes"]


def test_endpoints_and_switch():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    c.post("/ranking/recompute")
    assert len(c.get("/assessor/perguntas").json()["perguntas"]) == 5
    body = {"answers": AGGRESSIVE, "amount": 50_000, "has_reserve": True}
    plan = c.post("/assessor/plano", json=body).json()
    acoes = next(i for i in plan["allocation"] if i["key"] == "acoes")
    assert plan["term"] == "longo" and set(acoes["picks"]) == {"curto", "medio", "longo"}
    assert acoes["suggested"] and all(s["value"] <= 5_000 for s in acoes["suggested"]) and plan["disclaimer"]
    assert abs(sum(s["value"] for s in acoes["suggested"]) + acoes["suggested_rest"] - acoes["value"]) < 0.05
    short = c.post("/assessor/plano", json={**body, "months": 6}).json()
    assert short["term"] == "curto" and short["profile"] == "conservador"
    assert c.post("/assessor/plano", json={**body, "amount": -1}).status_code == 422
    assert c.post("/assessor/explicar", json=body).status_code == 503

    off = TestClient(create_app(Settings(_env_file=None, demo_mode=True, advisor_mode="off"), start_scheduler=False))
    assert off.post("/assessor/plano", json=body).status_code == 403
    assert off.get("/health").json()["advisor"] is False


def test_advisor_explain_uses_plan(monkeypatch):
    seen = {}

    async def fake(self, system, instruction):
        seen["system"] = system
        return "seu plano"

    monkeypatch.setattr(Insights, "complete_with", fake)
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True, anthropic_api_key="k"), start_scheduler=False))
    body = {"answers": CONSERVATIVE, "amount": 20_000}
    assert c.post("/assessor/explicar", json=body).json()["explanation"] == "seu plano"
    assert '"profile": "conservador"' in seen["system"] and "Reserva de emergência vem antes" in seen["system"]


def test_split_picks_respects_cap():
    from app.advisor import split_picks

    picks = [{"ticker": t} for t in ("A", "B", "C", "D", "E")]
    # R$ 30 mil em ações de R$ 100 mil: 3 ativos de R$ 10 mil (teto de 10%).
    assert [p["value"] for p in split_picks(picks, 30_000, 100_000)] == [10_000] * 3
    # R$ 80 mil em ações: 5 ativos no teto, R$ 30 mil sobram para o ETF da classe.
    out = split_picks(picks, 80_000, 100_000)
    assert len(out) == 5 and all(p["value"] == 10_000 for p in out)
    # Valor pequeno: divide entre 3.
    assert len(split_picks(picks, 3_000, 100_000)) == 3
    assert split_picks([], 1000, 1000) == []
