import asyncio
from datetime import datetime, timezone

import httpx

from .base import Bar, Quote
from .brapi import logo_url_for


class YahooProvider:
    """Cotações do Yahoo Finance (ativos da B3 com sufixo .SA), com cerca de 15 minutos de atraso.

    Gratuito e sem chave, mas não é uma API oficial e os termos do Yahoo não permitem uso comercial:
    serve para testes e validação. Para lançar ao público, use a brapi paga ou um feed licenciado.
    """

    name = "yahoo"
    realtime = False

    def __init__(self, base_url: str = "https://query1.finance.yahoo.com", client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        # O Yahoo recusa requisições sem User-Agent de navegador.
        self.client = client or httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0"})

    async def _fetch(self, ticker: str, range_: str) -> Quote | None:
        resp = await self.client.get(
            f"{self.base_url}/v8/finance/chart/{ticker}.SA", params={"range": range_, "interval": "1d"}
        )
        if resp.status_code != 200:
            return None
        results = (resp.json().get("chart") or {}).get("result") or []
        return parse_chart(ticker, results[0]) if results else None

    async def quotes(self, tickers: list[str], history_days: int = 180) -> list[Quote]:
        range_ = "1y" if history_days > 180 else "6mo"
        results = await asyncio.gather(*(self._fetch(t, range_) for t in tickers), return_exceptions=True)
        return [r for r in results if isinstance(r, Quote)]


def parse_chart(ticker: str, raw: dict) -> Quote:
    meta = raw.get("meta") or {}
    quote = ((raw.get("indicators") or {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    history = [
        Bar(
            day=datetime.fromtimestamp(ts, tz=timezone.utc).date(),
            close=float(close),
            volume=float(volumes[i] or 0) if i < len(volumes) else 0.0,
        )
        for i, (ts, close) in enumerate(zip(raw.get("timestamp") or [], closes))
        if close is not None
    ]
    price = float(meta.get("regularMarketPrice") or (history[-1].close if history else 0))
    previous = meta.get("previousClose") or (history[-2].close if len(history) > 1 else None)
    as_of = meta.get("regularMarketTime")
    return Quote(
        ticker=ticker,
        name=meta.get("longName") or meta.get("shortName") or ticker,
        price=price,
        change_percent=round((price / previous - 1) * 100, 2) if previous else 0.0,
        currency=meta.get("currency") or "BRL",
        as_of=datetime.fromtimestamp(as_of, tz=timezone.utc).isoformat() if as_of else None,
        logo_url=logo_url_for(ticker),
        history=history,
    )
