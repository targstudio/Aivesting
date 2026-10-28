"""Panorama do mercado: índices, moedas e commodities do Brasil e do mundo, e as maiores altas e baixas do app."""

import logging
import random
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from .ranking.service import RankingService

log = logging.getLogger(__name__)

# Símbolos do Yahoo Finance. O Yahoo não tem o IFIX; os FIIs aparecem nas altas e baixas do app.
INDICES = [
    ("^BVSP", "Ibovespa", "Brasil", "pts"),
    ("BRL=X", "Dólar", "Moedas", "R$"),
    ("EURBRL=X", "Euro", "Moedas", "R$"),
    ("^GSPC", "S&P 500", "EUA", "pts"),
    ("^IXIC", "Nasdaq", "EUA", "pts"),
    ("^TNX", "Juro de 10 anos dos EUA", "EUA", "%"),
    ("^STOXX50E", "Euro Stoxx 50", "Europa", "pts"),
    ("000001.SS", "Xangai", "China", "pts"),
    ("BZ=F", "Petróleo Brent", "Commodities", "US$"),
    ("GC=F", "Ouro", "Commodities", "US$"),
    ("BTC-USD", "Bitcoin", "Cripto", "US$"),
]

SPARK_DAYS = 30


@dataclass
class MarketItem:
    symbol: str
    label: str
    group: str
    unit: str
    value: float
    change_percent: float
    spark: list[float] = field(default_factory=list)


def items_from_quotes(quotes) -> list[MarketItem]:
    by_symbol = {q.ticker: q for q in quotes}
    out = []
    for symbol, label, group, unit in INDICES:
        q = by_symbol.get(symbol)
        if q is None or not q.price:
            continue
        out.append(
            MarketItem(
                symbol, label, group, unit, round(q.price, 4), q.change_percent,
                [round(b.close, 4) for b in q.history[-SPARK_DAYS:]],
            )
        )
    return out


def demo_items() -> list[MarketItem]:
    base = {"^BVSP": 131000, "BRL=X": 5.42, "EURBRL=X": 6.31, "^GSPC": 6400, "^IXIC": 21300, "^TNX": 4.2,
            "^STOXX50E": 5400, "000001.SS": 3600, "BZ=F": 68, "GC=F": 3900, "BTC-USD": 112000}
    out = []
    for symbol, label, group, unit in INDICES:
        rng = random.Random(symbol)
        price, spark = base[symbol], []
        for _ in range(SPARK_DAYS):
            price *= 1 + rng.gauss(0.0005, 0.01)
            spark.append(round(price, 4))
        change = round((spark[-1] / spark[-2] - 1) * 100, 2)
        out.append(MarketItem(symbol, label, group, unit, spark[-1], change, spark))
    return out


def movers(ranking: RankingService, n: int = 5) -> dict:
    assets = [a for s in ranking.snapshots.values() for a in s.assets]
    slim = lambda a: {  # noqa: E731
        "ticker": a.ticker, "name": a.name, "asset_class": a.asset_class, "price": a.price,
        "change_percent": a.change_percent, "rank": a.rank, "logo_url": a.logo_url, "spark": a.spark,
    }
    ordered = sorted(assets, key=lambda a: a.change_percent, reverse=True)
    up = [slim(a) for a in ordered if a.change_percent > 0][:n]
    down = [slim(a) for a in reversed(ordered) if a.change_percent < 0][:n]
    breadth = {
        "altas": sum(a.change_percent > 0 for a in assets),
        "baixas": sum(a.change_percent < 0 for a in assets),
        "estaveis": sum(a.change_percent == 0 for a in assets),
    }
    return {"altas": up, "baixas": down, "amplitude": breadth}


class MarketService:
    """Busca o panorama com cache curto: a página e a IA leem daqui sem bater na fonte a cada acesso."""

    def __init__(self, source=None, ttl_seconds: int = 300):
        # `source` tem o método `symbols` (YahooProvider). None = dados de demonstração.
        self.source = source
        self.ttl = ttl_seconds
        self._items: list[MarketItem] = []
        self._at = 0.0
        self.updated_at: str | None = None

    async def items(self) -> list[MarketItem]:
        if self._items and time.monotonic() - self._at < self.ttl:
            return self._items
        if self.source is None:
            items = demo_items()
        else:
            try:
                items = items_from_quotes(await self.source.symbols([s for s, *_ in INDICES]))
            except Exception:
                log.exception("falha ao buscar o panorama do mercado")
                items = []
        if items or not self._items:
            self._items, self._at = items, time.monotonic()
            self.updated_at = datetime.now(timezone.utc).isoformat()
        return self._items

    async def overview(self, ranking: RankingService) -> dict:
        items = await self.items()
        return {
            "indices": [asdict(i) for i in items],
            "atualizado_em": self.updated_at,
            **movers(ranking),
        }
