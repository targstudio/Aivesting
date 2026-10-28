import asyncio
import json

import httpx
import respx

from app.ranking.engine import rank_assets
from app.storage import SupabaseStore

from .conftest import make_quote


@respx.mock
def test_save_writes_run_and_entries():
    runs = respx.post("https://x.supabase.co/rest/v1/ranking_runs").mock(
        return_value=httpx.Response(201, json=[{"id": 7}])
    )
    entries = respx.post("https://x.supabase.co/rest/v1/ranking_entries").mock(return_value=httpx.Response(201))
    snap = rank_assets([make_quote("ALTA3", 0.004), make_quote("BAIX3", -0.004)], "acoes", "Ibovespa", False)

    asyncio.run(SupabaseStore("https://x.supabase.co", "sb_secret_test").save(snap))

    assert json.loads(runs.calls[0].request.content)["asset_class"] == "acoes"
    assert runs.calls[0].request.headers["apikey"] == "sb_secret_test"
    rows = json.loads(entries.calls[0].request.content)
    assert [r["ticker"] for r in rows] == ["ALTA3", "BAIX3"] and rows[0]["run_id"] == 7
