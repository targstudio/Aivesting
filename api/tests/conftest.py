import math
from datetime import date, timedelta

import pytest

from app.providers.base import Bar, Quote


def make_quote(ticker: str, drift: float, vol: float = 0.01, days: int = 130) -> Quote:
    """Série sintética determinística: tendência `drift` ao dia com oscilação de amplitude `vol`."""
    start = date(2026, 1, 1)
    closes = [100 * (1 + drift) ** i * (1 + vol * math.sin(i)) for i in range(days)]
    history = [Bar(start + timedelta(days=i), c, 1_000_000) for i, c in enumerate(closes)]
    return Quote(ticker=ticker, name=ticker, price=closes[-1], change_percent=0.0, history=history)


@pytest.fixture
def quotes():
    return [
        make_quote("ALTA3", 0.004),
        make_quote("NEUT3", 0.0),
        make_quote("BAIX3", -0.004),
        make_quote("VOLA3", 0.0, vol=0.05),
    ]
