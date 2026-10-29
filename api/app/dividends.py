"""Proventos (dividendos, JCP e rendimentos de FIIs): dividend yield, histórico e calendário da carteira.

Fonte: Yahoo Finance (eventos de dividendos do gráfico), gratuito e só para testes, como as cotações.
As datas são as datas com (quem tinha o ativo nesse dia recebe); o pagamento costuma vir dias ou semanas depois.
"""

import asyncio
import random
import time
from datetime import date, timedelta

from pydantic import BaseModel, Field

from .portfolio import Holding

CACHE_SECONDS = 12 * 3600
DISCLAIMER = (
    "Proventos passados, pela data com, segundo o Yahoo Finance. A estimativa dos próximos meses repete o último ano e "
    "pode não se confirmar. Não é recomendação de investimento."
)


class DividendsRequest(BaseModel):
    holdings: list[Holding] = Field(max_length=300)


def _months_back(today: date, n: int) -> list[str]:
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


def _shift_year(month: str) -> str:
    y, m = month.split("-")
    return f"{int(y) + 1:04d}-{m}"


def summarize(ticker: str, payments: list[tuple[date, float]], price: float | None, today: date | None = None) -> dict:
    today = today or date.today()
    cutoff = today - timedelta(days=365)
    last_12m = [(d, v) for d, v in payments if d > cutoff]
    total_12m = sum(v for _, v in last_12m)
    months_paid = len({d.strftime("%Y-%m") for d, _ in last_12m})
    frequency = (
        "mensal" if months_paid >= 10 else "trimestral" if months_paid >= 3 else "semestral ou anual" if months_paid else None
    )
    return {
        "ticker": ticker,
        "price": price,
        "total_12m": round(total_12m, 4),
        "dy_12m": round(total_12m / price, 4) if price and total_12m else (0.0 if price else None),
        "months_paid_12m": months_paid,
        "frequency": frequency,
        "payments": [{"date": d.isoformat(), "amount": round(v, 6)} for d, v in payments[-36:]],
    }


def demo_payments(ticker: str, today: date | None = None) -> tuple[list[tuple[date, float]], float]:
    """Proventos sintéticos para o modo demonstração: FIIs mensais, ações trimestrais ou semestrais."""
    today = today or date.today()
    rng = random.Random(f"div:{ticker}")
    price = rng.uniform(8, 120)
    fii = ticker.endswith("11")
    step = 1 if fii else rng.choice([3, 6])
    dy = rng.uniform(0.08, 0.13) if fii else rng.uniform(0.02, 0.1)
    per = price * dy * step / 12
    out = []
    for k in range(0, 24, step):
        d = (today.replace(day=1) - timedelta(days=30 * k)).replace(day=min(28, rng.randint(1, 28)))
        if d < today:
            out.append((d, round(per * rng.uniform(0.85, 1.15), 4)))
    return sorted(out), round(price, 2)


class DividendService:
    def __init__(self, source=None):
        # `source` é um YahooProvider; None usa dados sintéticos (modo demonstração).
        self.source = source
        self._cache: dict[str, tuple[float, dict | None]] = {}
        self._lock = asyncio.Semaphore(6)

    async def get(self, ticker: str) -> dict | None:
        ticker = ticker.upper()
        hit = self._cache.get(ticker)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
        if self.source is None:
            payments, price = demo_payments(ticker)
            result = summarize(ticker, payments, price)
        else:
            async with self._lock:
                try:
                    raw = await asyncio.wait_for(self.source.dividends(ticker), 12)
                except Exception:  # noqa: BLE001
                    raw = None
            result = summarize(ticker, *raw) if raw else None
        if len(self._cache) > 2000:
            self._cache.clear()
        self._cache[ticker] = (time.time(), result)
        return result

    async def many(self, tickers: list[str]) -> dict[str, dict | None]:
        unique = list(dict.fromkeys(t.upper() for t in tickers))
        results = await asyncio.gather(*(self.get(t) for t in unique))
        return dict(zip(unique, results))

    async def portfolio(self, holdings: list[Holding], today: date | None = None) -> dict:
        """Renda dos últimos 12 meses por mês (pela data com) e a estimativa dos próximos 12, repetindo o último ano."""
        today = today or date.today()
        months = _months_back(today, 12)
        eligible = [h for h in holdings if h.ticker and h.quantity and h.asset_class in ("acoes", "fiis")]
        data = await self.many([h.ticker for h in eligible])
        received = {m: 0.0 for m in months}
        rows = []
        for h in eligible:
            info = data.get(h.ticker.upper())
            if not info:
                rows.append({"ticker": h.ticker, "quantity": h.quantity, "available": False})
                continue
            by_month: dict[str, float] = {}
            for p in info["payments"]:
                m = p["date"][:7]
                if m in received:
                    value = p["amount"] * h.quantity
                    received[m] += value
                    by_month[m] = by_month.get(m, 0.0) + value
            income = sum(by_month.values())
            rows.append({
                "ticker": h.ticker,
                "asset_class": h.asset_class,
                "quantity": h.quantity,
                "available": True,
                "income_12m": round(income, 2),
                "dy_12m": info["dy_12m"],
                "frequency": info["frequency"],
                "months": sorted(by_month),
            })
        total = sum(received.values())
        rows.sort(key=lambda r: r.get("income_12m", -1), reverse=True)
        return {
            "income_12m": round(total, 2),
            "monthly_avg": round(total / 12, 2),
            "received": [{"month": m, "value": round(v, 2)} for m, v in received.items()],
            "forecast": [{"month": _shift_year(m), "value": round(v, 2)} for m, v in received.items()],
            "assets": rows,
            "ignored": len(holdings) - len(eligible),
            "disclaimer": DISCLAIMER,
        }
