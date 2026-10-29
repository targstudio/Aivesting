"""Motor de ranking.

Versão baseline: combina fatores com pesos fixos, definidos a partir da literatura de fatores
(momentum, tendência, baixa volatilidade). Ainda NÃO é um modelo treinado nem calibrado; a
probabilidade exibida é uma estimativa conservadora até existir histórico para calibrar.
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import fmean, pstdev

from ..providers.base import Quote
from .factors import FACTOR_LABELS, compute_factors

MODEL_VERSION = "baseline-v0"
SPARK_DAYS = 30

WEIGHTS = {
    "momentum_3m": 0.30,
    "momentum_6m_ex1m": 0.25,
    "reversal_1w": -0.10,
    "trend_50d": 0.15,
    "volatility_3m": -0.15,
    "volume_surge": 0.05,
}

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


def _zscores(values: list[float]) -> list[float]:
    mu = fmean(values)
    sd = pstdev(values)
    if sd == 0:
        return [0.0 for _ in values]
    # Winsoriza em ±3 para um ativo extremo não dominar o ranking.
    return [max(-3.0, min(3.0, (v - mu) / sd)) for v in values]


def rank_assets(
    quotes: list[Quote], asset_class: str, benchmark: str, data_realtime: bool
) -> RankingSnapshot:
    rows = [(q, f) for q in quotes if (f := compute_factors(q)) is not None]
    computed_at = datetime.now(timezone.utc).isoformat()
    if not rows:
        return RankingSnapshot(asset_class, benchmark, MODEL_VERSION, computed_at, data_realtime, [])

    z_by_factor = {name: _zscores([f[name] for _, f in rows]) for name in WEIGHTS}

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
            for name, weight in WEIGHTS.items()
        ]
        raw = sum(c.contribution for c in contributions)
        scored.append((quote, raw, contributions))

    scored.sort(key=lambda s: s[1], reverse=True)
    n = len(scored)
    assets = []
    for position, (quote, raw, contributions) in enumerate(scored, start=1):
        contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
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
