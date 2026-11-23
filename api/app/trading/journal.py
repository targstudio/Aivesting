"""Diário de trades: estatísticas do próprio trader e o imposto do mês (DARF) separado em day trade e swing trade.

As operações ficam salvas no navegador (e na conta, quando a pessoa entra). A API só calcula: não grava nada.
"""

from collections import defaultdict
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


class Trade(BaseModel):
    id: str = Field(max_length=60)
    data: date
    ticker: str = Field(min_length=4, max_length=8)
    lado: Literal["compra", "venda"] = "compra"
    modalidade: Literal["day_trade", "swing"] = "day_trade"
    quantidade: float = Field(gt=0, le=10_000_000)
    preco_entrada: float = Field(gt=0, le=1_000_000)
    preco_saida: float | None = Field(default=None, gt=0, le=1_000_000)
    data_saida: date | None = None
    custos: float = Field(default=0, ge=0, le=1_000_000)
    setup: str = Field(default="", max_length=60)
    nota: str = Field(default="", max_length=500)

    @field_validator("ticker")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper().strip()

    @property
    def closed(self) -> bool:
        return self.preco_saida is not None

    @property
    def result(self) -> float:
        sign = 1 if self.lado == "compra" else -1
        return sign * (self.preco_saida - self.preco_entrada) * self.quantidade - self.custos

    @property
    def sale_value(self) -> float:
        return (self.preco_saida if self.lado == "compra" else self.preco_entrada) * self.quantidade


class JournalRequest(BaseModel):
    trades: list[Trade] = Field(max_length=5000)


def group_stats(trades: list[Trade]) -> dict:
    results = [t.result for t in trades]
    wins = [x for x in results if x > 0]
    losses = [x for x in results if x <= 0]
    gross_loss = -sum(losses)
    return {
        "operacoes": len(results),
        "resultado": round(sum(results), 2),
        "taxa_acerto_pct": round(len(wins) / len(results) * 100, 1) if results else None,
        "ganho_medio": round(sum(wins) / len(wins), 2) if wins else None,
        "perda_media": round(sum(losses) / len(losses), 2) if losses else None,
        "payoff": round((sum(wins) / len(wins)) / (gross_loss / len(losses)), 2) if wins and losses and gross_loss else None,
        "fator_lucro": round(sum(wins) / gross_loss, 2) if gross_loss else None,
        "expectativa": round(sum(results) / len(results), 2) if results else None,
    }


def monthly_tax(trades: list[Trade]) -> list[dict]:
    """DARF por mês (código 6015): day trade 20% e swing 15%, cada um compensando o próprio prejuízo acumulado.
    Ações no swing são isentas quando as vendas do mês ficam até R$ 20 mil. FIIs (final 11) pagam 20% e não têm
    isenção. O IRRF ("dedo-duro") já retido na nota é descontado: 1% do lucro do day trade e 0,005% das vendas
    do swing."""
    months: dict[str, dict] = defaultdict(lambda: {"dt": 0.0, "sw_acoes": 0.0, "sw_fii": 0.0, "vendas_acoes": 0.0,
                                                    "vendas_sw": 0.0, "irrf_dt": 0.0})
    for t in trades:
        m = (t.data_saida or t.data).strftime("%Y-%m")
        b = months[m]
        if t.modalidade == "day_trade":
            b["dt"] += t.result
            b["irrf_dt"] += max(0.0, t.result) * 0.01
        elif t.ticker.endswith("11"):
            b["sw_fii"] += t.result
            b["vendas_sw"] += t.sale_value
        else:
            b["sw_acoes"] += t.result
            b["vendas_acoes"] += t.sale_value
            b["vendas_sw"] += t.sale_value
    carry = {"dt": 0.0, "sw_acoes": 0.0, "sw_fii": 0.0}
    out = []
    for m in sorted(months):
        b = months[m]
        exempt = 0 < b["vendas_acoes"] <= 20_000
        tax = 0.0
        for key, rate in (("dt", 0.20), ("sw_acoes", 0.15), ("sw_fii", 0.20)):
            res = b[key]
            if res < 0:
                carry[key] += -res
            elif res > 0 and not (key == "sw_acoes" and exempt):
                base = max(0.0, res - carry[key])
                carry[key] = max(0.0, carry[key] - res)
                tax += base * rate
        irrf = b["irrf_dt"] + b["vendas_sw"] * 0.00005
        due = max(0.0, tax - irrf)
        out.append({
            "mes": m,
            "day_trade": round(b["dt"], 2),
            "swing_acoes": round(b["sw_acoes"], 2),
            "swing_fiis": round(b["sw_fii"], 2),
            "vendas_acoes": round(b["vendas_acoes"], 2),
            "isento_swing_acoes": exempt and b["sw_acoes"] > 0,
            "imposto": round(tax, 2),
            "irrf_retido": round(irrf, 2),
            # Abaixo de R$ 10 o DARF não é pago: acumula para o mês seguinte.
            "darf": round(due, 2) if due >= 10 else 0.0,
            "prejuizo_acumulado": {k: round(v, 2) for k, v in carry.items()},
        })
    return out


def summarize(trades: list[Trade]) -> dict:
    closed = sorted((t for t in trades if t.closed), key=lambda t: (t.data_saida or t.data, t.data))
    open_ = [t for t in trades if not t.closed]
    curve, total, peak, dd = [], 0.0, 0.0, 0.0
    streak = worst_streak = 0
    for t in closed:
        total += t.result
        peak = max(peak, total)
        dd = min(dd, total - peak)
        curve.append({"data": (t.data_saida or t.data).isoformat(), "acumulado": round(total, 2)})
        streak = streak + 1 if t.result <= 0 else 0
        worst_streak = max(worst_streak, streak)
    by = lambda key: {  # noqa: E731
        k: group_stats(v) for k, v in sorted(_group(closed, key).items(), key=lambda kv: -len(kv[1]))
    }
    best = max(closed, key=lambda t: t.result, default=None)
    worst = min(closed, key=lambda t: t.result, default=None)
    tips = insights(closed)
    return {
        "geral": group_stats(closed),
        "abertas": len(open_),
        "maior_queda": round(dd, 2),
        "maior_sequencia_perdas": worst_streak,
        "melhor": best and {"ticker": best.ticker, "data": best.data.isoformat(), "resultado": round(best.result, 2)},
        "pior": worst and {"ticker": worst.ticker, "data": worst.data.isoformat(), "resultado": round(worst.result, 2)},
        "por_setup": by(lambda t: t.setup.strip() or "Sem setup"),
        "por_ativo": by(lambda t: t.ticker),
        "por_modalidade": by(lambda t: "Day trade" if t.modalidade == "day_trade" else "Swing trade"),
        "por_dia_semana": by(lambda t: WEEKDAYS[t.data.weekday()]),
        "curva": curve[-500:],
        "imposto": monthly_tax(closed),
        "observacoes": tips,
    }


def _group(trades: list[Trade], key) -> dict[str, list[Trade]]:
    out: dict[str, list[Trade]] = defaultdict(list)
    for t in trades:
        out[key(t)].append(t)
    return out


def insights(closed: list[Trade]) -> list[str]:
    """Padrões objetivos do próprio histórico, sem IA: o que mais ajuda ou atrapalha o resultado."""
    tips: list[str] = []
    if len(closed) < 10:
        return ["Registre pelo menos 10 operações fechadas para o diário mostrar padrões confiáveis."]
    g = group_stats(closed)
    if g["payoff"] is not None and g["taxa_acerto_pct"] is not None:
        breakeven = 100 / (1 + g["payoff"])
        verdict = "acima" if g["taxa_acerto_pct"] > breakeven else "abaixo"
        tips.append(f"Com payoff de {g['payoff']:.2f}, você precisa acertar mais de {breakeven:.0f}% das operações para "
                    f"ter lucro. Você acerta {g['taxa_acerto_pct']:.0f}%: está {verdict} do ponto de equilíbrio.")
    setups = {k: group_stats(v) for k, v in _group(closed, lambda t: t.setup.strip() or "Sem setup").items()}
    ranked = [(k, v) for k, v in setups.items() if v["operacoes"] >= 5]
    if len(ranked) >= 2:
        ranked.sort(key=lambda kv: kv[1]["expectativa"] or 0)
        worst, best = ranked[0], ranked[-1]
        if (worst[1]["expectativa"] or 0) < 0:
            tips.append(f"O setup \"{worst[0]}\" perde em média R$ {abs(worst[1]['expectativa']):.2f} por operação "
                        f"({worst[1]['operacoes']} operações).")
        if (best[1]["expectativa"] or 0) > 0:
            tips.append(f"O setup \"{best[0]}\" é o que mais rende: R$ {best[1]['expectativa']:.2f} por operação em média.")
    losses = sorted((t.result for t in closed if t.result < 0))
    if len(losses) >= 5:
        worst_3 = sum(losses[:3])
        total_loss = sum(losses)
        if worst_3 / total_loss > 0.4:
            tips.append(f"As 3 piores operações somam {worst_3 / total_loss * 100:.0f}% de todas as perdas: respeitar o "
                        "stop nessas teria mudado o resultado.")
    return tips
