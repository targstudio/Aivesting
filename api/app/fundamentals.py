"""Fundamentos (P/L, P/VP, ROE, margens, dívida) pela brapi.

Os módulos de balanço da brapi (`defaultKeyStatistics`, `financialData`) exigem um plano pago: sem BRAPI_TOKEN a
função fica desligada e a tela do ativo esconde o card. Vacância de FIIs não vem dessa fonte.
"""

import asyncio
import random
import time

import httpx

CACHE_SECONDS = 24 * 3600
DISCLAIMER = "Indicadores do último balanço divulgado, segundo a brapi. Não é recomendação de investimento."


def _f(v) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def parse_fundamentals(raw: dict) -> dict:
    stats = raw.get("defaultKeyStatistics") or {}
    fin = raw.get("financialData") or {}
    price = _f(raw.get("regularMarketPrice")) or _f(fin.get("currentPrice"))
    eps = _f(raw.get("earningsPerShare")) or _f(stats.get("trailingEps"))
    pe = _f(raw.get("priceEarnings")) or (price / eps if price and eps and eps > 0 else None)
    bvps = _f(stats.get("bookValue"))
    pb = _f(stats.get("priceToBook")) or (price / bvps if price and bvps and bvps > 0 else None)
    return {
        "ticker": raw.get("symbol"),
        "price": price,
        "price_earnings": round(pe, 2) if pe is not None else None,
        "price_to_book": round(pb, 2) if pb is not None else None,
        "earnings_per_share": eps,
        "roe": _f(fin.get("returnOnEquity")),
        "net_margin": _f(fin.get("profitMargins")),
        "ebitda_margin": _f(fin.get("ebitdaMargins")),
        "debt_to_equity": _f(fin.get("debtToEquity")),
        "revenue_growth": _f(fin.get("revenueGrowth")),
        "market_cap": _f(raw.get("marketCap")),
        "ev_ebitda": _f(stats.get("enterpriseToEbitda")),
    }


def demo_fundamentals(ticker: str) -> dict:
    rng = random.Random(f"fund:{ticker}")
    fii = ticker.endswith("11")
    price = rng.uniform(8, 120)
    return {
        "ticker": ticker,
        "price": round(price, 2),
        "price_earnings": None if fii else round(rng.uniform(4, 25), 2),
        "price_to_book": round(rng.uniform(0.7, 1.2) if fii else rng.uniform(0.6, 4), 2),
        "earnings_per_share": None if fii else round(price / rng.uniform(5, 20), 2),
        "roe": None if fii else round(rng.uniform(0.05, 0.3), 4),
        "net_margin": None if fii else round(rng.uniform(0.03, 0.3), 4),
        "ebitda_margin": None if fii else round(rng.uniform(0.1, 0.5), 4),
        "debt_to_equity": None if fii else round(rng.uniform(20, 200), 1),
        "revenue_growth": None if fii else round(rng.uniform(-0.1, 0.25), 4),
        "market_cap": round(rng.uniform(5e9, 4e11)),
        "ev_ebitda": None if fii else round(rng.uniform(3, 15), 2),
    }


class FundamentalsService:
    def __init__(self, base_url: str, token: str, demo: bool = False, client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.demo = demo
        self.client = client or httpx.AsyncClient(timeout=20)
        self._cache: dict[str, tuple[float, dict | None]] = {}
        self._lock = asyncio.Semaphore(4)

    @property
    def enabled(self) -> bool:
        return self.demo or bool(self.token)

    async def get(self, ticker: str) -> dict | None:
        ticker = ticker.upper()
        if self.demo:
            return demo_fundamentals(ticker)
        if not self.token:
            return None
        hit = self._cache.get(ticker)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
        result = None
        async with self._lock:
            try:
                resp = await self.client.get(
                    f"{self.base_url}/quote/{ticker}",
                    params={"modules": "defaultKeyStatistics,financialData", "fundamental": "true", "token": self.token},
                )
                rows = resp.json().get("results") or [] if resp.status_code == 200 else []
                result = parse_fundamentals(rows[0]) if rows else None
            except Exception:  # noqa: BLE001
                result = None
        if len(self._cache) > 2000:
            self._cache.clear()
        self._cache[ticker] = (time.time(), result)
        return result
