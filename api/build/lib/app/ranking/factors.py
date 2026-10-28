"""Fatores de preço e fluxo calculados a partir do histórico diário de cada ativo."""

import math
from statistics import fmean, pstdev

from ..providers.base import Quote

FACTOR_LABELS = {
    "momentum_3m": "Momentum de 3 meses",
    "momentum_6m_ex1m": "Momentum de 6 meses (sem o último mês)",
    "reversal_1w": "Movimento da última semana",
    "trend_50d": "Preço em relação à média de 50 dias",
    "volatility_3m": "Volatilidade de 3 meses",
    "volume_surge": "Volume recente vs. média",
}

MIN_HISTORY = 70


def _ret(closes: list[float], start: int, end: int = 0) -> float | None:
    """Retorno entre closes[-1-start] e closes[-1-end]."""
    if len(closes) <= start:
        return None
    a, b = closes[-1 - start], closes[-1 - end]
    return b / a - 1 if a else None


def compute_factors(quote: Quote) -> dict[str, float] | None:
    closes = [b.close for b in quote.history]
    volumes = [b.volume for b in quote.history]
    if len(closes) < MIN_HISTORY:
        return None
    # Usa o preço atual do provedor como último ponto, para o recálculo intradiário refletir o pregão.
    if quote.price:
        closes = closes[:-1] + [quote.price] if closes else [quote.price]

    daily = [closes[i] / closes[i - 1] - 1 for i in range(len(closes) - 63, len(closes)) if closes[i - 1]]
    sma50 = fmean(closes[-50:])
    vol_recent = fmean(volumes[-5:]) if volumes[-5:] else 0
    vol_base = fmean(volumes[-63:]) if volumes[-63:] else 0

    factors = {
        "momentum_3m": _ret(closes, 63),
        "momentum_6m_ex1m": _ret(closes, min(len(closes) - 1, 126), 21),
        "reversal_1w": _ret(closes, 5),
        "trend_50d": closes[-1] / sma50 - 1 if sma50 else None,
        "volatility_3m": pstdev(daily) * math.sqrt(252) if len(daily) > 2 else None,
        "volume_surge": math.log(vol_recent / vol_base) if vol_recent > 0 and vol_base > 0 else 0.0,
    }
    if any(v is None for v in factors.values()):
        return None
    return factors  # type: ignore[return-value]
