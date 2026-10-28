import asyncio

from fastapi.testclient import TestClient

from app.ai.assistant import Assistant
from app.config import Settings
from app.main import create_app
from app.providers.demo import DemoMacro, DemoProvider
from app.ranking.service import RankingService


def make_assistant():
    settings = Settings(_env_file=None, demo_mode=True)
    svc = RankingService(settings, DemoProvider())
    asyncio.run(svc.recompute(force=True))
    return Assistant("test-key", settings.anthropic_model, svc, DemoMacro())


def test_tools_return_app_data():
    a = make_assistant()
    ranking = asyncio.run(a.run_tool("get_ranking", {"asset_class": "fiis", "limit": 3}))
    assert ranking["indice_referencia"] == "IFIX" and len(ranking["ativos"]) == 3
    top = ranking["ativos"][0]["ticker"]
    asset = asyncio.run(a.run_tool("get_asset", {"ticker": top.lower()}))
    assert asset["rank"] == 1 and asset["top_factors"]
    assert "erro" in asyncio.run(a.run_tool("get_asset", {"ticker": "XXXX3"}))
    assert len(asyncio.run(a.run_tool("get_macro", {}))["indicadores"]) == 3


def test_chat_endpoint_validation():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    msg = {"messages": [{"role": "user", "content": "Quais FIIs lideram?"}]}
    assert c.post("/assistant/chat", json=msg).status_code == 503

    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True, anthropic_api_key="k"), start_scheduler=False))
    assert c.post("/assistant/chat", json={"messages": []}).status_code == 422
    bad = {"messages": [{"role": "assistant", "content": "oi"}]}
    assert c.post("/assistant/chat", json=bad).status_code == 422


def test_chat_endpoint_returns_reply(monkeypatch):
    async def fake_reply(self, history):
        assert history[-1]["content"] == "Quais FIIs lideram?"
        return {"reply": "Os FIIs no topo são...", "tools_used": ["get_ranking"]}

    monkeypatch.setattr(Assistant, "reply", fake_reply)
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True, anthropic_api_key="k"), start_scheduler=False))
    body = c.post("/assistant/chat", json={"messages": [{"role": "user", "content": "Quais FIIs lideram?"}]}).json()
    assert body["reply"].startswith("Os FIIs") and body["tools_used"] == ["get_ranking"]


def test_chat_rate_limit(monkeypatch):
    async def fake_reply(self, history):
        return {"reply": "ok", "tools_used": []}

    monkeypatch.setattr(Assistant, "reply", fake_reply)
    s = Settings(_env_file=None, demo_mode=True, anthropic_api_key="k", ai_requests_per_hour=2)
    c = TestClient(create_app(s, start_scheduler=False))
    msg = {"messages": [{"role": "user", "content": "oi"}]}
    assert [c.post("/assistant/chat", json=msg).status_code for _ in range(3)] == [200, 200, 429]


def test_recompute_requires_admin_token_when_set():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True, admin_token="seg"), start_scheduler=False))
    assert c.post("/ranking/recompute").status_code == 401
    assert c.post("/ranking/recompute", headers={"X-Admin-Token": "seg"}).status_code == 200
