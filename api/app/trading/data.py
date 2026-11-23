"""Candles (abertura, máxima, mínima, fechamento e volume) de qualquer ativo da B3.

Fonte gratuita: o gráfico do Yahoo Finance (sufixo .SA), com cerca de 15 minutos de atraso. Os limites do Yahoo valem
aqui: 1 minuto só dos últimos 7 dias, 5 e 15 minutos dos últimos 60 dias, 60 minutos de até 2 anos. Serve para estudar
e testar; para operar day trade em tempo real é preciso um feed licenciado da B3 (ver docs/TRADING.md).
"""

import asyncio
import math
import random
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

SAO_PAULO = ZoneInfo("America/Sao_Paulo")


@dataclass
class Candle:
    t: int  # início da barra em segundos (UTC)
    o: float
    h: float
    l: float  # noqa: E741
    c: float
    v: float


@dataclass(frozen=True)
class Interval:
    key: str
    label: str
    yahoo: str
    range_: str
    intraday: bool
    seconds: int
    ttl: int  # quanto tempo o cache vale


INTERVALS: dict[str, Interval] = {
    "1m": Interval("1m", "1 minuto", "1m", "5d", True, 60, 45),
    "5m": Interval("5m", "5 minutos", "5m", "1mo", True, 300, 60),
    "15m": Interval("15m", "15 minutos", "15m", "1mo", True, 900, 120),
    "60m": Interval("60m", "60 minutos", "60m", "6mo", True, 3600, 300),
    "1d": Interval("1d", "Diário", "1d", "5y", False, 86400, 600),
    "1wk": Interval("1wk", "Semanal", "1wk", "10y", False, 7 * 86400, 3600),
}
# Períodos mais longos para o teste de estratégia (os limites do Yahoo).
BACKTEST_RANGE = {"5m": "60d", "15m": "60d", "60m": "2y", "1d": "10y", "1wk": "10y"}


class CandleSource:
    """Busca e guarda em cache os candles do Yahoo. Em modo demonstração (ou sem internet) gera candles sintéticos."""

    def __init__(self, base_url: str = "https://query1.finance.yahoo.com", demo: bool = False,
                 client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.demo = demo
        self.client = client or httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        self.cache: dict[tuple, tuple[float, dict]] = {}
        self.locks: dict[tuple, asyncio.Lock] = {}

    async def get(self, ticker: str, interval: str = "1d", range_: str | None = None) -> dict | None:
        """{"ticker", "name", "interval", "candles": [Candle], "price", "previous_close", "as_of", "source"}."""
        spec = INTERVALS[interval]
        ticker = ticker.upper().strip()
        range_ = range_ or spec.range_
        key = (ticker, interval, range_)
        hit = self.cache.get(key)
        if hit and time.time() - hit[0] < spec.ttl:
            return hit[1]
        lock = self.locks.setdefault(key, asyncio.Lock())
        async with lock:
            hit = self.cache.get(key)
            if hit and time.time() - hit[0] < spec.ttl:
                return hit[1]
            data = synthetic(ticker, spec) if self.demo else await self._fetch(ticker, spec, range_)
            if data is None:
                return hit[1] if hit else None
            if len(self.cache) > 600:
                self.cache.clear()
            self.cache[key] = (time.time(), data)
            return data

    async def _fetch(self, ticker: str, spec: Interval, range_: str) -> dict | None:
        symbol = ticker if ticker.startswith("^") or "=" in ticker else f"{ticker}.SA"
        try:
            resp = await self.client.get(
                f"{self.base_url}/v8/finance/chart/{symbol}",
                params={"range": range_, "interval": spec.yahoo, "includePrePost": "false"},
            )
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        results = (resp.json().get("chart") or {}).get("result") or []
        return parse_chart(ticker, spec, results[0]) if results else None


def parse_chart(ticker: str, spec: Interval, raw: dict) -> dict | None:
    meta = raw.get("meta") or {}
    q = ((raw.get("indicators") or {}).get("quote") or [{}])[0]
    candles: list[Candle] = []
    for i, ts in enumerate(raw.get("timestamp") or []):
        try:
            o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]  # noqa: E741
        except (KeyError, IndexError, TypeError):
            continue
        if None in (o, h, l, c) or c <= 0:
            continue
        v = (q.get("volume") or [0] * (i + 1))[i] or 0
        # O Yahoo marca a barra diária no começo do pregão em UTC: +12h deixa a data certa no Brasil.
        t = int(ts) if spec.intraday else int(ts) // 86400 * 86400 + 12 * 3600
        if candles and candles[-1].t == t:
            candles[-1] = Candle(t, candles[-1].o, max(candles[-1].h, h), min(candles[-1].l, l), c, candles[-1].v + v)
            continue
        candles.append(Candle(t, float(o), float(h), float(l), float(c), float(v)))
    if not candles:
        return None
    price = float(meta.get("regularMarketPrice") or candles[-1].c)
    prev = meta.get("chartPreviousClose") if not spec.intraday else meta.get("previousClose")
    as_of = meta.get("regularMarketTime")
    return {
        "ticker": ticker,
        "name": meta.get("longName") or meta.get("shortName") or ticker,
        "interval": spec.key,
        "candles": candles,
        "price": price,
        "previous_close": float(prev) if prev else None,
        "as_of": datetime.fromtimestamp(as_of, tz=timezone.utc).isoformat() if as_of else None,
        "source": "Yahoo Finance (cerca de 15 min de atraso)",
        "realtime": False,
    }


def synthetic(ticker: str, spec: Interval, bars: int | None = None) -> dict:
    """Candles determinísticos para demonstração e testes, só nos horários do pregão quando intradiários."""
    rng = random.Random(f"{ticker}:{spec.key}")
    bars = bars or (600 if spec.intraday else 520 if spec.key == "1wk" else 1250)
    vol = rng.uniform(0.012, 0.022) * math.sqrt(min(spec.seconds, 5 * 86400) / 86400 if spec.key == "1wk" else spec.seconds / 86400 if spec.intraday else 1) if spec.intraday or spec.key == "1wk" else rng.uniform(0.012, 0.022)
    drift = rng.uniform(-0.0002, 0.0006) * (5 if spec.key == "1wk" else spec.seconds / 86400 if spec.intraday else 1)
    price = rng.uniform(10, 60)
    today = datetime.now(SAO_PAULO).replace(hour=12, minute=0, second=0, microsecond=0)
    times: list[datetime] = []
    day = today
    while len(times) < bars:
        if spec.key == "1wk":
            times.append(day)
            day -= timedelta(days=7)
            continue
        if day.weekday() < 5:
            if spec.intraday:
                step = timedelta(seconds=spec.seconds)
                slot, session = day.replace(hour=10, minute=0), []
                while slot <= day.replace(hour=16, minute=55):
                    session.append(slot)
                    slot += step
                times.extend(reversed(session))
            else:
                times.append(day)
        day -= timedelta(days=1)
    times = times[:bars]
    times.reverse()
    candles = []
    for i, dt in enumerate(times):
        o = price
        c = o * (1 + rng.gauss(drift, vol) + 0.15 * vol * math.sin(i / 17))
        h = max(o, c) * (1 + abs(rng.gauss(0, vol / 2)))
        l = min(o, c) * (1 - abs(rng.gauss(0, vol / 2)))  # noqa: E741
        candles.append(Candle(int(dt.timestamp()), round(o, 2), round(h, 2), round(l, 2), round(c, 2),
                              float(int(rng.uniform(2e5, 2e6) * (spec.seconds / 86400 if spec.intraday else 1) * 50))))
        price = c
    return {
        "ticker": ticker, "name": f"{ticker} (dados de demonstração)", "interval": spec.key, "candles": candles,
        "price": candles[-1].c, "previous_close": candles[-2].c, "as_of": datetime.now(timezone.utc).isoformat(),
        "source": "Dados de demonstração", "realtime": False,
    }


def candles_json(candles: list[Candle]) -> list[dict]:
    return [asdict(c) for c in candles]
