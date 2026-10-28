from dataclasses import dataclass, field
from datetime import date
from typing import Protocol


@dataclass
class Bar:
    day: date
    close: float
    volume: float


@dataclass
class Quote:
    ticker: str
    name: str
    price: float
    change_percent: float
    currency: str = "BRL"
    # Momento da cotação segundo o provedor. Com brapi há atraso; com feed licenciado é tempo real.
    as_of: str | None = None
    history: list[Bar] = field(default_factory=list)
    fundamentals: dict[str, float | None] = field(default_factory=dict)


class MarketDataProvider(Protocol):
    """Fonte de cotações. Hoje: brapi (com atraso). Depois: feed em tempo real (ex.: Cedro)."""

    name: str
    realtime: bool

    async def quotes(self, tickers: list[str], history_days: int = 180) -> list[Quote]: ...
