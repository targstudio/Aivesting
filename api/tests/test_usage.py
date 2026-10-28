import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.ai.insights import Insights
from app.ai.usage import UsageTracker, cost_of
from app.config import Settings
from app.main import create_app


def fake_response(inp=1000, out=500, read=0, write=0, model="claude-opus-5-5"):
    usage = SimpleNamespace(input_tokens=inp, output_tokens=out, cache_read_input_tokens=read,
                            cache_creation_input_tokens=write)
    return SimpleNamespace(usage=usage, model=model)


def test_cost_uses_model_prices():
    # 1M de entrada + 1M de saída no Opus 5.5 = US$ 4 + US$ 20.
    assert cost_of("claude-opus-5-5", 1_000_000, 1_000_000, 0, 0) == 24.0
    assert cost_of("modelo-desconhecido", 1_000_000, 0, 0, 0) == 4.0


def test_summary_windows_and_features():
    t = UsageTracker()

    async def run():
        t.record("chat", fake_response())
        t.record("chat", fake_response())
        t.record("leitura_mercado", fake_response(inp=2000, out=0, read=10_000))
        t.hit()

    asyncio.run(run())
    s = t.summary(usd_brl=5.0)
    assert s["today"]["calls"] == 3 and s["last_30_days"]["calls"] == 3
    chat = next(f for f in s["by_feature_30_days"] if f["feature"] == "chat")
    assert chat["calls"] == 2 and chat["cost_usd"] == round(2 * (1000 * 4 + 500 * 20) / 1e6, 4)
    assert s["today"]["cost_brl"] == round(s["today"]["cost_usd"] * 5, 2)
    assert s["cache_hits_since_start"] == 1 and len(s["daily"]) == 14 and s["daily"][-1]["calls"] == 3
    assert not s["persisted"]


def test_old_events_leave_windows():
    t = UsageTracker()
    asyncio.run(asyncio.sleep(0))
    from app.ai.usage import UsageEvent

    t.events.append(UsageEvent("2020-01-01T12:00:00+00:00", "chat", "claude-opus-5-5", 1, 1, 0, 0, 0.1))
    s = t.summary(now=datetime(2026, 10, 28, 15, tzinfo=timezone.utc))
    assert s["last_30_days"]["calls"] == 0 and s["today"]["calls"] == 0


def test_endpoint_counts_readings_and_cache(monkeypatch):
    async def fake_create(**kwargs):
        text = SimpleNamespace(type="text", text="leitura")
        return SimpleNamespace(content=[text], stop_reason="end_turn", **vars(fake_response()))

    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True, anthropic_api_key="k"), start_scheduler=False))
    c.post("/ranking/recompute")
    ins: Insights = c.app.state.insights
    monkeypatch.setattr(ins.client.beta.messages, "create", lambda **kw: fake_create(**kw))
    for _ in range(2):
        assert c.get("/ia/leitura", params={"contexto": "ranking:acoes"}).status_code == 200
    body = c.get("/ia/consumo").json()
    assert body["today"]["calls"] == 1 and body["cache_hits_since_start"] == 1
    assert body["by_feature_30_days"][0]["feature"] == "leitura_ranking"
    assert body["usd_brl"] == 5.42 and body["today"]["cost_brl"] is not None


def test_cost_since_a_moment():
    from datetime import datetime, timedelta, timezone

    from app.ai.usage import UsageEvent, UsageTracker

    t = UsageTracker()
    now = datetime.now(timezone.utc)
    for hours, cost in ((5, 1.0), (1, 0.25)):
        t.events.append(UsageEvent((now - timedelta(hours=hours)).isoformat(), "chat", "claude-opus-5-5", 0, 0, 0, 0, cost))
    t.started_at = (now - timedelta(hours=6)).isoformat()
    s = t.summary(since=now - timedelta(hours=2))["since_request"]
    assert s["cost_usd"] == 0.25 and s["complete"]
    # Antes de a API ligar e sem banco: o valor pode estar incompleto.
    assert t.summary(since=now - timedelta(days=1))["since_request"]["complete"] is False
    assert t.summary()["since_request"] is None
