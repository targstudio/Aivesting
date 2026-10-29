"""Simulador de metas e aportes: repete o plano da pessoa em todas as janelas do histórico desde 2000.

Não é previsão. Para cada mês de início possível, aplica o valor inicial e os aportes mensais numa carteira
fixa (rebalanceada todo mês) e guarda o valor final. O resultado mostra o pior, o típico e o melhor caso
do que já aconteceu, descontando a inflação para ficar em dinheiro de hoje.
"""

import math
from pathlib import Path

from pydantic import BaseModel, Field

from .longterm.build import DATA_DIR
from .longterm.history import History, load
from .longterm.stats import monthly_returns

# Carteiras modelo. Pesos por componente: cdi, ibov (Ibovespa), dolar. FIIs ficam de fora: o índice deles no app é a
# média dos FIIs de hoje (viés de sobrevivência) e só começa por volta de 2012.
STRATEGIES: dict[str, dict] = {
    "cdi": {"label": "Só renda fixa (CDI)", "weights": {"cdi": 1.0}},
    "conservadora": {"label": "Conservadora", "weights": {"cdi": 0.8, "ibov": 0.1, "dolar": 0.1}},
    "moderada": {"label": "Moderada", "weights": {"cdi": 0.6, "ibov": 0.3, "dolar": 0.1}},
    "arrojada": {"label": "Arrojada", "weights": {"cdi": 0.3, "ibov": 0.6, "dolar": 0.1}},
    "acoes": {"label": "Só ações (Ibovespa)", "weights": {"ibov": 1.0}},
}
COMPONENT_LABELS = {"cdi": "CDI", "ibov": "Ibovespa", "dolar": "Dólar"}
MIN_WINDOWS = 12

DISCLAIMER = (
    "Simulação com o que já aconteceu desde 2000, sem custos, impostos nem taxas. As janelas se sobrepõem e o "
    "futuro pode ser pior que o pior caso do passado. Não é recomendação de investimento."
)


class SimulationRequest(BaseModel):
    initial: float = Field(default=0, ge=0, le=1e9)
    monthly: float = Field(default=0, ge=0, le=1e8)
    years: int = Field(ge=1, le=20)
    goal: float | None = Field(default=None, ge=0, le=1e10)
    # Corrigir o aporte pela inflação todo ano mantém o esforço constante em dinheiro de hoje.
    adjust_contributions: bool = True


def _percentile(values: list[float], q: float) -> float:
    s = sorted(values)
    k = (len(s) - 1) * q
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


class Simulator:
    def __init__(self, path: str | Path = ""):
        self.path = Path(path) if path else DATA_DIR / "history.json"
        self._history: History | None = None
        self._mtime: float | None = None
        self._returns: dict[str, list[float | None]] = {}
        self._inflation: list[float | None] = []

    def _load(self) -> bool:
        try:
            mtime = self.path.stat().st_mtime
        except OSError:
            return False
        if mtime != self._mtime:
            h = load(self.path)
            self._history, self._mtime = h, mtime
            usd = h.macro.get("usd_brl") or [None] * len(h.months)
            self._returns = {
                "cdi": h.cdi,
                "ibov": monthly_returns(h.benchmarks["acoes"].levels) if "acoes" in h.benchmarks else [None] * len(h.months),
                "dolar": monthly_returns(usd),
            }
            # IPCA mensal aproximado a partir do acumulado em 12 meses (a série mensal não está no histórico).
            ipca12 = h.macro.get("ipca_12m") or [None] * len(h.months)
            self._inflation = [None if v is None else (1 + v / 100) ** (1 / 12) - 1 for v in ipca12]
        return True

    @property
    def available(self) -> bool:
        return self._load()

    def _portfolio_returns(self, weights: dict[str, float]) -> list[float | None]:
        n = len(self._history.months)
        out: list[float | None] = []
        for i in range(n):
            parts = [self._returns[k][i] for k in weights]
            out.append(None if any(p is None for p in parts) else sum(w * p for (k, w), p in zip(weights.items(), parts)))
        return out

    def _windows(self, rets: list[float | None], req: SimulationRequest) -> list[dict]:
        """Para cada janela de `years` anos do histórico: valor final em dinheiro de hoje do valor inicial
        (`base`) e de cada R$ 1 de aporte mensal (`per_real`). O valor final é linear no aporte."""
        months = req.years * 12
        results = []
        for start in range(1, len(rets) - months + 1):
            end = start + months
            if any(rets[i] is None or self._inflation[i] is None for i in range(start, end)):
                continue
            base, unit, price_level, contribution = req.initial, 0.0, 1.0, 1.0
            for k, i in enumerate(range(start, end)):
                if k and k % 12 == 0 and req.adjust_contributions:
                    contribution = price_level
                unit += contribution
                base *= 1 + rets[i]
                unit *= 1 + rets[i]
                price_level *= 1 + self._inflation[i]
            results.append({"start": self._history.months[start], "base": base / price_level, "per_real": unit / price_level})
        return results

    def _summary(self, windows: list[dict], req: SimulationRequest) -> dict:
        reals = [w["base"] + req.monthly * w["per_real"] for w in windows]
        worst = min(range(len(reals)), key=reals.__getitem__)
        best = max(range(len(reals)), key=reals.__getitem__)
        goal = req.goal
        needed = None
        if goal:
            # Aporte que faria cada janela chegar na meta; o percentil 80 alcança a meta em 8 de cada 10 janelas.
            per_window = [max(0.0, (goal - w["base"]) / w["per_real"]) if w["per_real"] > 0 else (0.0 if w["base"] >= goal else float("inf")) for w in windows]
            needed = sorted(per_window)[math.ceil(0.8 * len(per_window)) - 1]
            needed = round(needed, 2) if needed != float("inf") else None
        return {
            "windows": len(windows),
            "worst": round(reals[worst], 2),
            "worst_start": windows[worst]["start"],
            "p10": round(_percentile(reals, 0.1), 2),
            "median": round(_percentile(reals, 0.5), 2),
            "p90": round(_percentile(reals, 0.9), 2),
            "best": round(reals[best], 2),
            "best_start": windows[best]["start"],
            "invested": round(req.initial + req.monthly * req.years * 12, 2),
            "goal_hit_rate": round(sum(r >= goal for r in reals) / len(reals), 3) if goal else None,
            "needed_monthly_80": needed,
        }

    def simulate(self, req: SimulationRequest) -> dict | None:
        if not self._load():
            return None
        # Todas as carteiras usam as mesmas janelas para a comparação ser justa. Prazos longos não cabem no
        # histórico do dólar (desde 2006): essas carteiras saem e as demais comparam entre si.
        runs = {key: self._windows(self._portfolio_returns(s["weights"]), req) for key, s in STRATEGIES.items()}
        eligible = [ws for ws in runs.values() if len(ws) >= MIN_WINDOWS] or [[]]
        common = set.intersection(*({w["start"] for w in ws} for ws in eligible))
        strategies = []
        for key, s in STRATEGIES.items():
            windows = [w for w in runs[key] if w["start"] in common]
            base = {"key": key, "label": s["label"], "weights": s["weights"]}
            if len(windows) < MIN_WINDOWS:
                strategies.append({**base, "enough_history": False})
            else:
                strategies.append({**base, "enough_history": True, **self._summary(windows, req)})
        starts = sorted(common)
        return {
            "years": req.years,
            "initial": req.initial,
            "monthly": req.monthly,
            "goal": req.goal,
            "strategies": strategies,
            "components": COMPONENT_LABELS,
            "first_start": starts[0] if starts else None,
            "last_start": starts[-1] if starts else None,
            "data_through": self._history.months[-1],
            "disclaimer": DISCLAIMER,
        }
