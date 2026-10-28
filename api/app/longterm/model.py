"""Modelo de horizontes: probabilidade de um ativo superar o índice da classe e o CDI em 1, 3, 5 e 10 anos.

Como funciona:
1. Em cada fim de mês do histórico, calcula fatores com dados até aquele mês (sem olhar o futuro) e os
   normaliza entre os ativos da mesma classe.
2. Para cada horizonte, registra se o ativo superou o índice (e o CDI) nos H meses seguintes.
3. Ajusta uma regressão logística regularizada. Janelas sobrepostas pesam 1/H, para que 10 anos de dados
   valham como ~1 observação independente por ativo no horizonte de 10 anos, e não 120.
4. Valida fora da amostra (walk-forward): para prever o ano Y, treina só com janelas cujo resultado já
   era conhecido antes de Y. Se o modelo não acerta melhor que a frequência histórica, ele não é usado.
"""

import math
from dataclasses import dataclass
from statistics import fmean, pstdev

from .history import History
from .stats import monthly_returns

HORIZONS = {1: 12, 3: 36, 5: 60, 10: 120}

FEATURE_LABELS = {
    "momentum_12m": "Momentum de 12 meses (sem o último mês)",
    "volatility_3y": "Volatilidade de 3 anos",
    "drawdown_3y": "Distância do topo de 3 anos",
    "reversal_5y": "Retorno de 5 anos (reversão de longo prazo)",
    "scenario_fit": "Desempenho histórico em cenários parecidos com o atual",
}
FEATURES = list(FEATURE_LABELS)

L2 = 2.0
# Peso da média da classe ao estimar a afinidade de um ativo com o cenário (em meses).
SCENARIO_SHRINK = 24
MIN_ASSETS = 4
PROB_FLOOR, PROB_CAP = 0.05, 0.95


def _z(values: dict[str, float | None]) -> dict[str, float]:
    present = [v for v in values.values() if v is not None]
    if len(present) < 3:
        return {k: 0.0 for k in values}
    mu, sd = fmean(present), pstdev(present)
    return {k: 0.0 if v is None or sd == 0 else max(-3.0, min(3.0, (v - mu) / sd)) for k, v in values.items()}


class FeatureBuilder:
    """Fatores por ativo e mês, calculados só com informação disponível naquele mês."""

    def __init__(self, history: History, asset_class: str, regime_list: list):
        self.h = history
        self.tickers = history.tickers(asset_class)
        self.bench = history.benchmarks[asset_class].levels
        self.regimes = regime_list
        bench_rets = monthly_returns(self.bench)
        self.excess: dict[str, list[float | None]] = {}
        for t in self.tickers:
            rets = monthly_returns(history.prices[t])
            self.excess[t] = [
                None if r is None or b is None else r - b for r, b in zip(rets, bench_rets)
            ]

    def raw(self, ticker: str, i: int) -> dict[str, float | None] | None:
        p = self.h.prices[ticker]
        if i < 36 or p[i] is None or p[i - 1] is None or p[i - 12] is None:
            return None
        rets = [p[k] / p[k - 1] - 1 for k in range(i - 35, i + 1) if p[k] is not None and p[k - 1] is not None]
        if len(rets) < 24:
            return None
        window = [v for v in p[i - 35 : i + 1] if v is not None]
        return {
            "momentum_12m": p[i - 1] / p[i - 12] - 1,
            "volatility_3y": pstdev(rets) * math.sqrt(12),
            "drawdown_3y": p[i] / max(window) - 1,
            "reversal_5y": p[i - 12] / p[i - 60] - 1 if i >= 60 and p[i - 60] else None,
            "scenario_fit": self.scenario_fit(ticker, i),
        }

    def scenario_fit(self, ticker: str, i: int) -> float | None:
        """Excesso de retorno médio do ativo nos meses (até i) que começaram no mesmo cenário de i."""
        regime = self.regimes[i]
        if regime is None:
            return None
        ex = self.excess[ticker]
        sample = [ex[s] for s in range(1, i + 1) if self.regimes[s - 1] == regime and ex[s] is not None]
        if not sample:
            return 0.0
        return len(sample) / (len(sample) + SCENARIO_SHRINK) * fmean(sample) * 12

    def zscores(self, i: int) -> dict[str, dict[str, float]] | None:
        raws = {t: r for t in self.tickers if (r := self.raw(t, i)) is not None}
        if len(raws) < MIN_ASSETS:
            return None
        by_feature = {f: _z({t: r[f] for t, r in raws.items()}) for f in FEATURES}
        return {t: {f: by_feature[f][t] for f in FEATURES} for t in raws}


@dataclass
class Sample:
    month: int
    ticker: str
    x: list[float]
    beat_benchmark: int
    beat_cdi: int
    weight: float


def build_samples(history: History, fb: FeatureBuilder, months: int) -> list[Sample]:
    p_bench = fb.bench
    cdi = history.cdi
    out = []
    for i in range(36, len(history.months) - months):
        z = fb.zscores(i)
        if z is None or p_bench[i] is None or p_bench[i + months] is None:
            continue
        bench_ret = p_bench[i + months] / p_bench[i] - 1
        cdi_window = cdi[i + 1 : i + months + 1]
        cdi_ret = math.prod(1 + c for c in cdi_window) - 1 if all(c is not None for c in cdi_window) else None
        for ticker, feats in z.items():
            p = history.prices[ticker]
            if p[i + months] is None:
                continue
            ret = p[i + months] / p[i] - 1
            out.append(
                Sample(
                    month=i,
                    ticker=ticker,
                    x=[feats[f] for f in FEATURES],
                    beat_benchmark=int(ret > bench_ret),
                    beat_cdi=int(ret > cdi_ret) if cdi_ret is not None else -1,
                    weight=1 / months,
                )
            )
    return out


def _sigmoid(v: float) -> float:
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, v))))


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        if abs(m[col][col]) < 1e-12:
            continue
        for r in range(n):
            if r != col:
                factor = m[r][col] / m[col][col]
                m[r] = [x - factor * y for x, y in zip(m[r], m[col])]
    return [m[i][n] / m[i][i] if abs(m[i][i]) > 1e-12 else 0.0 for i in range(n)]


@dataclass
class Logistic:
    intercept: float
    coefs: list[float]

    def prob(self, x: list[float]) -> float:
        p = _sigmoid(self.intercept + sum(c * v for c, v in zip(self.coefs, x)))
        return min(PROB_CAP, max(PROB_FLOOR, p))


def fit_logistic(xs: list[list[float]], ys: list[int], ws: list[float], l2: float = L2, iters: int = 25) -> Logistic:
    """Regressão logística ponderada com penalidade L2 (o intercepto não é penalizado), por Newton."""
    k = len(xs[0]) + 1
    beta = [0.0] * k
    rows = [[1.0] + x for x in xs]
    for _ in range(iters):
        grad = [0.0] * k
        hess = [[0.0] * k for _ in range(k)]
        for row, y, w in zip(rows, ys, ws):
            p = _sigmoid(sum(b * v for b, v in zip(beta, row)))
            g, h = w * (p - y), w * p * (1 - p)
            for a in range(k):
                grad[a] += g * row[a]
                for b in range(a, k):
                    hess[a][b] += h * row[a] * row[b]
        for a in range(k):
            for b in range(a):
                hess[a][b] = hess[b][a]
        for a in range(1, k):
            grad[a] += l2 * beta[a]
            hess[a][a] += l2
        hess[0][0] += 1e-9
        step = _solve(hess, grad)
        beta = [b - s for b, s in zip(beta, step)]
        if max(abs(s) for s in step) < 1e-7:
            break
    return Logistic(beta[0], beta[1:])


def _auc(probs: list[float], ys: list[int]) -> float | None:
    pos = [p for p, y in zip(probs, ys) if y == 1]
    neg = [p for p, y in zip(probs, ys) if y == 0]
    if not pos or not neg:
        return None
    ranked = sorted(probs)
    # Mann-Whitney com ranks médios para empates.
    rank_of: dict[float, float] = {}
    i = 0
    while i < len(ranked):
        j = i
        while j + 1 < len(ranked) and ranked[j + 1] == ranked[i]:
            j += 1
        rank_of[ranked[i]] = (i + j) / 2 + 1
        i = j + 1
    rank_sum = sum(rank_of[p] for p in pos)
    return (rank_sum - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def walk_forward(samples: list[Sample], target: str, months: int, first_month_index: int) -> dict:
    """Valida fora da amostra, ano a ano, treinando só com resultados já conhecidos."""
    data = [s for s in samples if getattr(s, target) >= 0]
    if not data:
        return {"oos_samples": 0, "validated": False}
    years = sorted({(first_month_index + s.month) // 12 for s in data})
    probs, base_probs, ys = [], [], []
    for year in years:
        cutoff = year * 12 - first_month_index  # índice de janeiro do ano Y
        train = [s for s in data if s.month + months < cutoff]
        test = [s for s in data if (first_month_index + s.month) // 12 == year]
        train_weight = sum(s.weight for s in train)
        if train_weight < 10 or len({s.ticker for s in train}) < MIN_ASSETS:
            continue
        model = fit_logistic([s.x for s in train], [getattr(s, target) for s in train], [s.weight for s in train])
        base = sum(s.weight * getattr(s, target) for s in train) / train_weight
        for s in test:
            probs.append(model.prob(s.x))
            base_probs.append(base)
            ys.append(getattr(s, target))
    n = len(ys)
    if n == 0:
        return {"oos_samples": 0, "validated": False}
    brier = fmean((p - y) ** 2 for p, y in zip(probs, ys))
    brier_base = fmean((p - y) ** 2 for p, y in zip(base_probs, ys))
    skill = 1 - brier / brier_base if brier_base > 0 else 0.0
    # Acerto dos extremos: frequência real entre os 30% com maior e menor probabilidade prevista.
    order = sorted(range(n), key=lambda k: probs[k])
    cut = max(1, n * 3 // 10)
    effective = n / months
    return {
        "oos_samples": n,
        "oos_effective": round(effective, 1),
        "brier": round(brier, 4),
        "brier_base_rate": round(brier_base, 4),
        "skill": round(skill, 4),
        "auc": round(a, 3) if (a := _auc(probs, ys)) is not None else None,
        "hit_rate_top": round(fmean(ys[k] for k in order[-cut:]), 3),
        "hit_rate_bottom": round(fmean(ys[k] for k in order[:cut]), 3),
        # Só usa o modelo se ele bateu a frequência histórica fora da amostra por uma margem que cresce
        # quando a amostra efetiva é pequena (janelas sobrepostas geram acertos por acaso).
        "validated": effective >= 5 and skill > 2 / effective,
    }
