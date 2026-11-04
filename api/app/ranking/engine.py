"""Motor de ranking.

Combina fatores com pesos fixos, definidos a partir da literatura de fatores: preço (momentum medido com os
dividendos, tendência, baixa volatilidade) e, desde a v1, valor e renda (dividend yield, P/VP e P/L). Ainda NÃO é
um modelo treinado nem calibrado; a probabilidade exibida é uma estimativa conservadora. No teste de 10 anos do app
(app/longterm) nenhum fator previu sozinho quem sobe, então o ranking é um resumo dos números, não uma previsão.
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import fmean, pstdev

from ..providers.base import Quote
from .factors import FACTOR_LABELS, FUNDAMENTAL_FACTORS, compute_factors

MODEL_VERSION = "baseline-v1-dividendos"
SPARK_DAYS = 30

# Pesos por classe. Em FIIs o rendimento mensal é quase todo o retorno, então dividendos e P/VP pesam mais.
# Os fatores de balanço (dividend_yield, book_value, earnings_yield) ficam neutros quando faltam dados.
WEIGHTS_BY_CLASS = {
    "acoes": {
        "momentum_3m": 0.20,
        "momentum_6m_ex1m": 0.16,
        "reversal_1w": -0.07,
        "trend_50d": 0.10,
        "volatility_3m": -0.12,
        "volume_surge": 0.03,
        "dividend_yield": 0.14,
        "book_value": 0.09,
        "earnings_yield": 0.09,
    },
    "fiis": {
        "momentum_3m": 0.17,
        "momentum_6m_ex1m": 0.13,
        "reversal_1w": -0.06,
        "trend_50d": 0.08,
        "volatility_3m": -0.12,
        "volume_surge": 0.02,
        "dividend_yield": 0.25,
        "book_value": 0.17,
    },
}
WEIGHTS = WEIGHTS_BY_CLASS["acoes"]

# Teto da probabilidade: no curto prazo nenhum modelo tem poder preditivo alto,
# então a estimativa fica entre 35% e 65% até ser calibrada com histórico real.
PROB_SPREAD = 0.15


@dataclass
class Contribution:
    factor: str
    label: str
    value: float
    zscore: float
    contribution: float


@dataclass
class RankedAsset:
    ticker: str
    name: str
    asset_class: str
    price: float
    change_percent: float
    rank: int
    score: float  # 0 a 100, percentil dentro da classe
    probability_outperform: float
    top_factors: list[Contribution] = field(default_factory=list)
    logo_url: str | None = None
    # Últimos fechamentos (até 30 pregões), para o minigráfico nas listas.
    spark: list[float] = field(default_factory=list)
    # Momento da última cotação segundo o provedor (ISO, UTC). Com o Yahoo, uns 15 minutos de atraso.
    as_of: str | None = None
    # Renda e preço vs. balanço (Fundamentus). None quando não há dado.
    dividend_yield: float | None = None
    p_vp: float | None = None
    p_l: float | None = None
    # Quanto rendeu em ~6 meses: só o preço, e o preço mais os dividendos do período (aproximado pelo DY de 12 meses).
    return_6m: float | None = None
    total_return_6m: float | None = None


@dataclass
class RankingSnapshot:
    asset_class: str
    benchmark: str
    model_version: str
    computed_at: str
    data_realtime: bool
    assets: list[RankedAsset]
    # Cotação mais recente entre os ativos: é a "data dos preços" mostrada no app (computed_at é só o recálculo).
    prices_as_of: str | None = None


def _zscores(values: list[float | None]) -> list[float]:
    """Z-score de cada valor entre os que têm dado; quem não tem fica em 0 (neutro)."""
    present = [v for v in values if v is not None]
    if len(present) < 2:
        return [0.0 for _ in values]
    mu = fmean(present)
    sd = pstdev(present)
    if sd == 0:
        return [0.0 for _ in values]
    # Winsoriza em ±3 para um ativo extremo não dominar o ranking.
    return [0.0 if v is None else max(-3.0, min(3.0, (v - mu) / sd)) for v in values]


def rank_assets(
    quotes: list[Quote],
    asset_class: str,
    benchmark: str,
    data_realtime: bool,
    fundamentals: dict[str, dict] | None = None,
) -> RankingSnapshot:
    """`fundamentals`: ticker -> {"dy", "p_vp", "p_l"} (frações, como no Fundamentus). Sem ele, só preço conta."""
    fundamentals = fundamentals or {}
    weights = WEIGHTS_BY_CLASS.get(asset_class, WEIGHTS)
    rows = [
        (q, f) for q in quotes
        if (f := compute_factors(q, fundamentals.get(q.ticker.upper()), asset_class)) is not None
    ]
    computed_at = datetime.now(timezone.utc).isoformat()
    if not rows:
        return RankingSnapshot(asset_class, benchmark, MODEL_VERSION, computed_at, data_realtime, [])

    z_by_factor = {name: _zscores([f.get(name) for _, f in rows]) for name in weights}

    scored = []
    for i, (quote, factors) in enumerate(rows):
        contributions = [
            Contribution(
                factor=name,
                label=FACTOR_LABELS[name],
                value=factors[name],
                zscore=z_by_factor[name][i],
                contribution=weight * z_by_factor[name][i],
            )
            for name, weight in weights.items()
            # Fator de balanço sem dado não aparece na explicação.
            if not (name in FUNDAMENTAL_FACTORS and factors.get(name) is None)
        ]
        raw = sum(c.contribution for c in contributions)
        scored.append((quote, raw, contributions, factors))

    scored.sort(key=lambda s: s[1], reverse=True)
    n = len(scored)
    assets = []
    for position, (quote, raw, contributions, factors) in enumerate(scored, start=1):
        contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
        fund = fundamentals.get(quote.ticker.upper()) or {}
        dy, ret6 = fund.get("dy"), factors.get("return_6m")
        assets.append(
            RankedAsset(
                ticker=quote.ticker,
                name=quote.name,
                asset_class=asset_class,
                price=quote.price,
                change_percent=quote.change_percent,
                rank=position,
                score=round(100 * (n - position) / (n - 1), 1) if n > 1 else 50.0,
                probability_outperform=round(0.5 + PROB_SPREAD * math.tanh(raw), 3),
                top_factors=contributions[:3],
                logo_url=quote.logo_url,
                spark=[round(b.close, 2) for b in quote.history[-SPARK_DAYS:]],
                as_of=quote.as_of,
                dividend_yield=dy,
                p_vp=fund.get("p_vp"),
                p_l=fund.get("p_l"),
                return_6m=None if ret6 is None else round(ret6, 4),
                total_return_6m=None if ret6 is None else round(ret6 + (dy or 0) / 2, 4),
            )
        )
    prices_as_of = latest_as_of(a.as_of for a in assets)
    return RankingSnapshot(asset_class, benchmark, MODEL_VERSION, computed_at, data_realtime, assets, prices_as_of)


def latest_as_of(values) -> str | None:
    """O horário mais recente de uma lista de ISO (com fuso), ignorando os vazios."""
    parsed = []
    for v in values:
        try:
            dt = datetime.fromisoformat(v) if v else None
        except (TypeError, ValueError):
            continue
        if dt:
            parsed.append(dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))
    return max(parsed).isoformat() if parsed else None
