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


class PortfolioStore:
    """Carteiras importadas (tabela portfolios). Sem login, cada carteira tem um id aleatório que só o navegador da
    pessoa conhece; a tabela não tem política de leitura pública e só o backend (service role) acessa."""

    def __init__(self, url: str, secret_key: str, client: httpx.AsyncClient | None = None):
        self.base = f"{url.rstrip('/')}/rest/v1/portfolios"
        self.headers = {
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }
        self.client = client or httpx.AsyncClient(timeout=20)

    async def get(self, portfolio_id: str) -> dict | None:
        resp = await self.client.get(
            self.base, headers=self.headers, params={"id": f"eq.{portfolio_id}", "select": "holdings,updated_at"}
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None

    async def save(self, portfolio_id: str, holdings: list[dict], updated_at: str) -> None:
        resp = await self.client.post(
            self.base,
            headers={**self.headers, "Prefer": "resolution=merge-duplicates"},
            json={"id": portfolio_id, "holdings": holdings, "updated_at": updated_at},
        )
        resp.raise_for_status()

    async def delete(self, portfolio_id: str) -> None:
        resp = await self.client.delete(self.base, headers=self.headers, params={"id": f"eq.{portfolio_id}"})
        resp.raise_for_status()
