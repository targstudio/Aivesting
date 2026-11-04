"""Maiores altas (e quedas) de qualquer ativo da B3: quanto subiu em cada prazo, o melhor dia, o melhor mês, os
melhores 12 meses e a maior subida do fundo ao topo nos últimos 10 anos.

Fonte: Yahoo Finance (preço ajustado por proventos e desdobramentos), gratuito e só para testes, como as cotações.
Calculado sob demanda quando alguém abre o ativo, com cache.
"""

import asyncio
import math
import random
import time
from datetime import date, timedelta

CACHE_SECONDS = 6 * 3600
DISCLAIMER = (
    "Altas passadas, com os dividendos reinvestidos, segundo o Yahoo Finance. O que subiu muito pode cair depois: "
    "não é previsão nem recomendação de investimento."
)

Point = tuple[date, float]


def _pct(a: float, b: float) -> float:
    return round(b / a - 1, 4)


def _at_or_before(series: list[Point], day: date) -> Point | None:
    found = None
    for p in series:
        if p[0] > day:
            break
        found = p
    return found


def period_changes(daily: list[Point], monthly: list[Point]) -> list[dict]:
    """Variação no último dia, semana, mês, 6 meses, 12 meses, 5 e 10 anos."""
    if not daily and not monthly:
        return []
    last_day, last = (daily or monthly)[-1]
    out = []
    for key, label, days in (
        ("1d", "No último dia", 1),
        ("1s", "Na semana", 7),
        ("1m", "No mês", 30),
        ("6m", "Em 6 meses", 182),
        ("12m", "Em 12 meses", 365),
        ("5a", "Em 5 anos", 5 * 365),
        ("10a", "Em 10 anos", 10 * 365 - 20),
    ):
        if key == "1d":
            start = daily[-2] if len(daily) > 1 else None
        else:
            # Sem histórico que cubra o prazo inteiro (ativo novo), o prazo fica de fora.
            target = last_day - timedelta(days=days)
            start = (_at_or_before(daily, target) if days <= 365 else None) or _at_or_before(monthly, target)
        if start and start[1] > 0:
            out.append({"key": key, "label": label, "change": _pct(start[1], last), "since": start[0].isoformat()})
    return out


def best_step(series: list[Point]) -> dict | None:
    """Maior variação entre dois pontos seguidos (melhor dia ou melhor mês)."""
    best = None
    for (d0, v0), (d1, v1) in zip(series, series[1:]):
        if v0 > 0 and (best is None or v1 / v0 > best[0]):
            best = (v1 / v0, d0, d1)
    return {"change": round(best[0] - 1, 4), "start": best[1].isoformat(), "end": best[2].isoformat()} if best else None


def worst_step(series: list[Point]) -> dict | None:
    worst = None
    for (d0, v0), (d1, v1) in zip(series, series[1:]):
        if v0 > 0 and (worst is None or v1 / v0 < worst[0]):
            worst = (v1 / v0, d0, d1)
    return {"change": round(worst[0] - 1, 4), "start": worst[1].isoformat(), "end": worst[2].isoformat()} if worst else None


def best_window(monthly: list[Point], months: int = 12) -> dict | None:
    """Os melhores `months` meses seguidos."""
    best = None
    for i in range(months, len(monthly)):
        (d0, v0), (d1, v1) = monthly[i - months], monthly[i]
        if v0 > 0 and (best is None or v1 / v0 > best[0]):
            best = (v1 / v0, d0, d1)
    return {"change": round(best[0] - 1, 4), "start": best[1].isoformat(), "end": best[2].isoformat()} if best else None


def max_rally(series: list[Point]) -> dict | None:
    """Maior subida do fundo ao topo: comprando no ponto mais baixo e vendendo no mais alto que veio depois."""
    if len(series) < 2:
        return None
    low = series[0]
    best = None
    for p in series[1:]:
        if low[1] > 0 and (best is None or p[1] / low[1] > best[0]):
            best = (p[1] / low[1], low[0], p[0])
        if p[1] < low[1]:
            low = p
    if best is None or best[0] <= 1:
        return None
    return {"change": round(best[0] - 1, 4), "start": best[1].isoformat(), "end": best[2].isoformat()}


def max_drawdown(series: list[Point]) -> dict | None:
    if len(series) < 2:
        return None
    peak = series[0]
    worst = None
    for p in series[1:]:
        if peak[1] > 0 and (worst is None or p[1] / peak[1] < worst[0]):
            worst = (p[1] / peak[1], peak[0], p[0])
        if p[1] > peak[1]:
            peak = p
    if worst is None or worst[0] >= 1:
        return None
    return {"change": round(worst[0] - 1, 4), "start": worst[1].isoformat(), "end": worst[2].isoformat()}


def summarize(ticker: str, daily: list[Point], monthly: list[Point]) -> dict | None:
    if len(daily) < 2 and len(monthly) < 2:
        return None
    last_day, last = (daily or monthly)[-1]
    year = [p for p in daily if p[0] > last_day - timedelta(days=365)]
    high = max(year, key=lambda p: p[1]) if year else None
    low = min(year, key=lambda p: p[1]) if year else None
    up_months = [1 for (_, a), (_, b) in zip(monthly, monthly[1:]) if b > a]
    return {
        "ticker": ticker,
        "as_of": last_day.isoformat(),
        "periods": period_changes(daily, monthly),
        # Últimos 12 meses, dia a dia.
        "best_day": best_step(year),
        "worst_day": worst_step(year),
        "high_12m": {"date": high[0].isoformat(), "below": _pct(high[1], last)} if high else None,
        "low_12m": {"date": low[0].isoformat(), "above": _pct(low[1], last)} if low else None,
        # Até 10 anos, mês a mês.
        "best_month": best_step(monthly),
        "best_12m": best_window(monthly, 12),
        "max_rally": max_rally(monthly),
        "max_drawdown": max_drawdown(monthly),
        "months": max(0, len(monthly) - 1),
        "up_month_share": round(len(up_months) / (len(monthly) - 1), 4) if len(monthly) > 1 else None,
    }


def demo_series(ticker: str, today: date | None = None) -> tuple[list[Point], list[Point]]:
    """Preços sintéticos para o modo demonstração."""
    today = today or date.today()
    rng = random.Random(f"highs:{ticker}")
    drift, vol = rng.uniform(0.0, 0.012), rng.uniform(0.04, 0.1)
    monthly, v = [], 10.0
    for k in range(120, -1, -1):
        v *= math.exp(rng.gauss(drift, vol))
        monthly.append((today - timedelta(days=30 * k), round(v, 4)))
    daily, d = [], v / 1.1
    for k in range(260, -1, -1):
        d *= math.exp(rng.gauss(drift / 21, vol / math.sqrt(21)))
        daily.append((today - timedelta(days=int(k * 1.4)), round(d, 4)))
    return daily, monthly


class HighsService:
    def __init__(self, source=None):
        # `source` é um YahooProvider; None usa dados sintéticos (modo demonstração).
        self.source = source
        self._cache: dict[str, tuple[float, dict | None]] = {}
        self._sem = asyncio.Semaphore(4)

    async def get(self, ticker: str) -> dict | None:
        ticker = ticker.upper()
        hit = self._cache.get(ticker)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
        if self.source is None:
            result = summarize(ticker, *demo_series(ticker))
        else:
            async with self._sem:
                try:
                    daily, monthly = await asyncio.wait_for(
                        asyncio.gather(self.source.adjusted(ticker, "1y", "1d"), self.source.adjusted(ticker, "10y", "1mo")),
                        15,
                    )
                except Exception:  # noqa: BLE001
                    daily = monthly = None
            result = summarize(ticker, daily or [], monthly or []) if (daily or monthly) else None
        if len(self._cache) > 2000:
            self._cache.clear()
        self._cache[ticker] = (time.time(), result)
        return result
