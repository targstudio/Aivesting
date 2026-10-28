import asyncio
from datetime import datetime, timezone

import httpx

from .base import Bar, Quote


class BrapiProvider:
    """Cotações da brapi.dev. Os dados têm atraso; serve para o MVP até o feed em tempo real."""

    name = "brapi"
    realtime = False

    def __init__(self, base_url: str, token: str, client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.client = client or httpx.AsyncClient(timeout=20)

    async def _fetch(self, ticker: str, range_: str) -> Quote | None:
        params = {"range": range_, "interval": "1d", "fundamental": "true"}
        if self.token:
            params["token"] = self.token
        resp = await self.client.get(f"{self.base_url}/quote/{ticker}", params=params)
        if resp.status_code != 200:
            return None
        results = resp.json().get("results") or []
        return parse_quote(results[0]) if results else None

    async def quotes(self, tickers: list[str], history_days: int = 180) -> list[Quote]:
        range_ = "1y" if history_days > 180 else "6mo"
        # Uma requisição por ativo: o plano gratuito da brapi não aceita vários ativos por chamada.
        results = await asyncio.gather(
            *(self._fetch(t, range_) for t in tickers), return_exceptions=True
        )
        return [r for r in results if isinstance(r, Quote)]


def parse_quote(raw: dict) -> Quote:
    history = [
        Bar(
            day=datetime.fromtimestamp(h["date"], tz=timezone.utc).date(),
            close=float(h["close"]),
            volume=float(h.get("volume") or 0),
        )
        for h in raw.get("historicalDataPrice") or []
        if h.get("close") is not None
    ]
    history.sort(key=lambda b: b.day)
    return Quote(
        ticker=raw["symbol"],
        name=raw.get("longName") or raw.get("shortName") or raw["symbol"],
        price=float(raw.get("regularMarketPrice") or 0),
        change_percent=float(raw.get("regularMarketChangePercent") or 0),
        currency=raw.get("currency") or "BRL",
        as_of=raw.get("regularMarketTime"),
        history=history,
        fundamentals={
            "price_earnings": raw.get("priceEarnings"),
            "earnings_per_share": raw.get("earningsPerShare"),
            "market_cap": raw.get("marketCap"),
        },
    )
