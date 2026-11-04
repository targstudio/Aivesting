"""Fatores do ranking: preço e fluxo (do histórico diário) e, quando há balanço, dividendos e quanto o preço está
barato perto do patrimônio e do lucro (P/VP e P/L do Fundamentus, ver app/trader.py).

O histórico diário do Yahoo não é ajustado por proventos: no dia em que a ação passa a ser negociada sem o dividendo, o
preço cai mais ou menos o valor pago. Por isso o rendimento dos últimos meses soma o dividend yield proporcional ao
período, e o que a pessoa recebeu entra na conta como retorno, não como queda."""

import math
from statistics import fmean, pstdev

from ..providers.base import Quote

FACTOR_LABELS = {
    "momentum_3m": "Quanto rendeu nos últimos 3 meses (com dividendos)",
    "momentum_6m_ex1m": "Quanto rendeu nos últimos 6 meses (com dividendos)",
    "reversal_1w": "Como foi a última semana",
    "trend_50d": "Preço acima ou abaixo do normal dos últimos 2 meses",
    "volatility_3m": "Quanto o preço sobe e desce (últimos 3 meses)",
    "volume_surge": "Procura recente (quantos estão comprando e vendendo)",
    "dividend_yield": "Dividendos pagos nos últimos 12 meses",
    "book_value": "Preço perto do patrimônio (P/VP baixo)",
    "earnings_yield": "Preço perto do lucro (P/L baixo)",
}

# Fatores que só existem com o balanço. Sem ele, ficam neutros (não ajudam nem atrapalham).
FUNDAMENTAL_FACTORS = ("dividend_yield", "book_value", "earnings_yield")
# Dividend yield acima disso quase sempre é pagamento extraordinário, que não se repete: conta como o teto.
DY_CAP = {"acoes": 0.15, "fiis": 0.16}

MIN_HISTORY = 70


def _ret(closes: list[float], start: int, end: int = 0) -> float | None:
    """Retorno entre closes[-1-start] e closes[-1-end]."""
    if len(closes) <= start:
        return None
    a, b = closes[-1 - start], closes[-1 - end]
    return b / a - 1 if a else None


def fundamental_factors(fund: dict | None, asset_class: str = "acoes") -> dict[str, float | None]:
    """Dividendos, P/VP e P/L em forma de "quanto maior, melhor" (None quando não há dado).

    - book_value = VP/P (inverso do P/VP): 1 quer dizer preço igual ao patrimônio.
    - earnings_yield = L/P (inverso do P/L): o lucro de um ano como % do preço. Prejuízo conta como zero.
    """
    fund = fund or {}
    dy, pvp, pl = fund.get("dy"), fund.get("p_vp"), fund.get("p_l")
    out: dict[str, float | None] = {
        "dividend_yield": None if dy is None else max(0.0, min(dy, DY_CAP.get(asset_class, 0.15))),
        "book_value": 1 / pvp if pvp and pvp > 0 else None,
        "earnings_yield": None,
    }
    if asset_class == "acoes" and pl is not None:
        out["earnings_yield"] = min(1 / pl, 0.35) if pl > 0 else 0.0
    return out


def compute_factors(quote: Quote, fund: dict | None = None, asset_class: str = "acoes") -> dict[str, float | None] | None:
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
    extra = fundamental_factors(fund, asset_class)
    dy = extra["dividend_yield"] or 0.0
    # Retorno total: preço + o dividendo proporcional aos dias de cada janela (252 pregões no ano).
    factors["momentum_3m"] += dy * 63 / 252
    factors["momentum_6m_ex1m"] += dy * 105 / 252
    factors["return_6m"] = _ret(closes, min(len(closes) - 1, 126))
    return {**factors, **extra}
