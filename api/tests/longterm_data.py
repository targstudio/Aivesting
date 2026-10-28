"""Histórico mensal sintético e determinístico para testar o modelo de horizontes."""

import math
import random


def month_range(start_year: int, end: str) -> list[str]:
    end_year, end_month = map(int, end.split("-"))
    return [f"{y}-{m:02d}" for y in range(start_year, end_year + 1) for m in range(1, 13) if (y, m) <= (end_year, end_month)]


def synthetic_history(start_year: int = 2001, end: str = "2026-09") -> dict:
    months = month_range(start_year, end)
    rng = random.Random(42)

    def walk(drift: float, vol: float, start: int = 0, seed: int = 0) -> dict[str, float]:
        r = random.Random(seed)
        level, out = 100.0, {}
        for i, m in enumerate(months):
            if i < start:
                continue
            level *= 1 + drift + r.gauss(0, vol)
            out[m] = round(max(level, 0.01), 4)
        return out

    assets = {}
    for k in range(8):
        assets[f"ACAO{k}"] = {"name": f"Ação {k}", "class": "acoes", "monthly": walk(0.002 * k - 0.004, 0.08, seed=k)}
    for k in range(6):
        # FIIs começam mais tarde, como na B3.
        assets[f"FII{k}11"] = {
            "name": f"FII {k}", "class": "fiis", "monthly": walk(0.006 + 0.001 * k, 0.04, start=90 + 6 * k, seed=100 + k)
        }
    selic = {m: 10 + 4 * math.sin(i / 20) for i, m in enumerate(months)}
    return {
        "source": "sintético",
        "fetched_at": "2026-10-01T00:00:00+00:00",
        "assets": assets,
        "benchmarks": {"acoes": {"label": "Ibovespa", "monthly": walk(0.006, 0.06, seed=7)}, "fiis": {"label": "IFIX", "monthly": {}}},
        "macro": {
            "cdi": {m: round(selic[m] / 12, 4) for m in months},
            "selic": selic,
            "ipca_12m": {m: 5.0 for m in months},
            "usd_brl": walk(0.003, 0.03, seed=9),
            "sp500": walk(0.006, 0.04, seed=11),
        },
    }
