"""Grava cada ranking calculado no Supabase (tabelas ranking_runs e ranking_entries) para montar o histórico de acertos."""

import logging
from dataclasses import asdict

import httpx

from .ranking.engine import RankingSnapshot

log = logging.getLogger(__name__)


class SupabaseStore:
    def __init__(self, url: str, secret_key: str, client: httpx.AsyncClient | None = None):
        self.base = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }
        self.client = client or httpx.AsyncClient(timeout=20)

    async def save(self, snapshot: RankingSnapshot) -> None:
        if not snapshot.assets:
            return
        resp = await self.client.post(
            f"{self.base}/ranking_runs",
            headers={**self.headers, "Prefer": "return=representation"},
            json={
                "asset_class": snapshot.asset_class,
                "benchmark": snapshot.benchmark,
                "model_version": snapshot.model_version,
                "data_realtime": snapshot.data_realtime,
                "computed_at": snapshot.computed_at,
            },
        )
        resp.raise_for_status()
        run_id = resp.json()[0]["id"]
        entries = [
            {
                "run_id": run_id,
                "ticker": a.ticker,
                "rank": a.rank,
                "score": a.score,
                "probability_outperform": a.probability_outperform,
                "price": a.price,
                "top_factors": [asdict(c) for c in a.top_factors],
            }
            for a in snapshot.assets
        ]
        resp = await self.client.post(f"{self.base}/ranking_entries", headers=self.headers, json=entries)
        resp.raise_for_status()
