"""Teste de estratégia (backtest) com as regras da B3: custos, lote, day trade fechando no fim do pregão e imposto.

Regras de execução, escolhidas para não enganar quem testa:
- O sinal é lido no fechamento de um candle e a ordem é executada na ABERTURA do candle seguinte (sem olhar o futuro).
- Stop e alvo são conferidos pela máxima e mínima de cada candle. Se os dois cabem no mesmo candle, vale o stop
  (hipótese pessimista). Se o preço abre além do stop (gap), a saída é na abertura, como aconteceria de verdade.
- Day trade só existe em gráfico intradiário: a posição é zerada no último candle de cada pregão.
- Toda ordem paga corretagem fixa, emolumentos e liquidação da B3 (percentual) e escorregamento (slippage).
- Imposto: 20% sobre o lucro de day trade no mês e 15% no swing trade, com compensação de prejuízos da mesma
  modalidade. Ações têm isenção no swing quando as vendas do mês ficam até R$ 20 mil. É uma estimativa: confira com
  a sua nota de corretagem e um contador.
"""

import math
import re
from collections import defaultdict
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .data import INTERVALS, SAO_PAULO, Candle
from .indicators import atr, bollinger, day_key, ema, macd, rolling_max, rolling_min, rsi, sma, stochastic, vwap

Op = Literal["cruza_acima", "cruza_abaixo", "acima", "abaixo"]
SERIES_HELP = (
    "preco (fechamento), abertura, maxima, minima, volume, mmeN (média exponencial), mmaN (média simples), ifrN, "
    "macd, macd_sinal, macd_hist, bb_supN, bb_infN, bb_meioN, vwap, atrN, maxN e minN (máxima/mínima das N barras "
    "anteriores), vol_mediaN, estocastico, ou um número"
)
SERIES_RE = re.compile(
    r"^(preco|fechamento|abertura|maxima|minima|volume|vwap|macd|macd_sinal|macd_hist|estocastico|"
    r"mme\d{1,3}|mma\d{1,3}|ifr\d{1,2}|bb_sup\d{0,3}|bb_inf\d{0,3}|bb_meio\d{0,3}|atr\d{1,3}|max\d{1,3}|min\d{1,3}|"
    r"vol_media\d{1,3})$"
)


class Condition(BaseModel):
    esquerda: str = Field(max_length=20)
    operador: Op
    direita: str = Field(max_length=20)

    @field_validator("esquerda", "direita")
    @classmethod
    def valid_series(cls, v: str) -> str:
        v = v.strip().lower().replace(" ", "").replace(",", ".")
        if SERIES_RE.match(v):
            return v
        try:
            float(v)
            return v
        except ValueError:
            raise ValueError(f"'{v}' não é um indicador conhecido. Use: {SERIES_HELP}.") from None

    def text(self) -> str:
        ops = {"cruza_acima": "cruza acima de", "cruza_abaixo": "cruza abaixo de", "acima": ">", "abaixo": "<"}
        return f"{self.esquerda} {ops[self.operador]} {self.direita}"


class Strategy(BaseModel):
    nome: str = Field(default="Minha estratégia", max_length=80)
    ticker: str = Field(min_length=4, max_length=8)
    intervalo: Literal["5m", "15m", "60m", "1d", "1wk"] = "1d"
    lado: Literal["compra", "venda"] = "compra"
    modalidade: Literal["day_trade", "swing"] = "swing"
    entrada: list[Condition] = Field(min_length=1, max_length=5)
    saida: list[Condition] = Field(default_factory=list, max_length=5)
    stop_pct: float | None = Field(default=None, gt=0, le=50)
    alvo_pct: float | None = Field(default=None, gt=0, le=200)
    stop_atr: float | None = Field(default=None, gt=0, le=10)
    max_barras: int | None = Field(default=None, ge=1, le=500)
    capital: float = Field(default=10_000, ge=100, le=100_000_000)
    corretagem: float = Field(default=0.0, ge=0, le=100)
    taxa_b3_pct: float | None = Field(default=None, ge=0, le=1)
    slippage_pct: float = Field(default=0.02, ge=0, le=2)

    @field_validator("ticker")
    @classmethod
    def upper(cls, v: str) -> str:
        v = v.upper().strip()
        if not re.match(r"^[A-Z0-9]{4,6}$", v):
            raise ValueError("Ticker inválido.")
        return v


def b3_fee(s: Strategy) -> float:
    """Emolumentos + liquidação da B3 por lado, em %: 0,023% no day trade e 0,030% no swing (pessoa física)."""
    if s.taxa_b3_pct is not None:
        return s.taxa_b3_pct
    return 0.023 if s.modalidade == "day_trade" else 0.03


class SeriesBook:
    """Calcula cada série uma vez, sob demanda."""

    def __init__(self, candles: list[Candle]):
        self.candles = candles
        self.cache: dict[str, list] = {}

    def get(self, name: str) -> list:
        if name in self.cache:
            return self.cache[name]
        cs = self.candles
        closes = [c.c for c in cs]
        n = int(re.sub(r"\D", "", name) or 0)
        try:
            value = float(name)
            out = [value] * len(cs)
        except ValueError:
            if name in ("preco", "fechamento"):
                out = closes
            elif name == "abertura":
                out = [c.o for c in cs]
            elif name == "maxima":
                out = [c.h for c in cs]
            elif name == "minima":
                out = [c.l for c in cs]
            elif name == "volume":
                out = [c.v for c in cs]
            elif name == "vwap":
                out = vwap(cs)
            elif name.startswith("macd"):
                line, sig, hist = macd(closes)
                out = {"macd": line, "macd_sinal": sig, "macd_hist": hist}[name]
            elif name == "estocastico":
                out = stochastic(cs)[0]
            elif name.startswith("mme"):
                out = ema(closes, n)
            elif name.startswith("mma"):
                out = sma(closes, n)
            elif name.startswith("ifr"):
                out = rsi(closes, n)
            elif name.startswith("bb_"):
                up, mid, lo = bollinger(closes, n or 20)
                out = {"sup": up, "meio": mid, "inf": lo}[name[3:].rstrip("0123456789")]
            elif name.startswith("atr"):
                out = atr(cs, n)
            elif name.startswith("max"):
                out = rolling_max([c.h for c in cs], n)
            elif name.startswith("min"):
                out = rolling_min([c.l for c in cs], n)
            elif name.startswith("vol_media"):
                out = sma([c.v for c in cs], n)
            else:
                raise ValueError(name)
        self.cache[name] = out
        return out

    def check(self, cond: Condition, i: int) -> bool:
        a, b = self.get(cond.esquerda), self.get(cond.direita)
        if i < 1 or None in (a[i], b[i], a[i - 1], b[i - 1]):
            return False
        if cond.operador == "acima":
            return a[i] > b[i]
        if cond.operador == "abaixo":
            return a[i] < b[i]
        if cond.operador == "cruza_acima":
            return a[i - 1] <= b[i - 1] and a[i] > b[i]
        return a[i - 1] >= b[i - 1] and a[i] < b[i]


def lot_size(money: float, price: float) -> int:
    """Lote padrão de 100; abaixo disso, mercado fracionário."""
    qty = math.floor(money / price)
    return qty // 100 * 100 if qty >= 100 else qty


def run(strategy: Strategy, candles: list[Candle]) -> dict:
    s = strategy
    spec = INTERVALS[s.intervalo]
    if s.modalidade == "day_trade" and not spec.intraday:
        raise ValueError("Day trade precisa de gráfico intradiário (5, 15 ou 60 minutos).")
    if len(candles) < 60:
        raise ValueError("Poucos candles para testar. Escolha um período ou intervalo maior.")
    book = SeriesBook(candles)
    for cond in s.entrada + s.saida:
        book.get(cond.esquerda), book.get(cond.direita)
    atr_series = atr(candles) if s.stop_atr else None
    fee = b3_fee(s) / 100
    slip = s.slippage_pct / 100
    sign = 1 if s.lado == "compra" else -1
    days = [day_key(c.t) for c in candles]
    last_of_day = [i == len(candles) - 1 or days[i + 1] != days[i] for i in range(len(candles))]

    equity = s.capital
    trades: list[dict] = []
    curve: list[tuple[int, float]] = []
    pos = None  # dict com entrada, quantidade, stop, alvo, índice
    pending_entry = pending_exit = False
    exit_reason = ""

    def close(i: int, price: float, reason: str):
        nonlocal equity, pos
        fill = price * (1 - sign * slip)
        qty = pos["qty"]
        gross = sign * (fill - pos["price"]) * qty
        costs = pos["costs"] + s.corretagem + fill * qty * fee
        net = gross - (costs)
        equity += net
        trades.append({
            "entrada": candles[pos["i"]].t, "saida": candles[i].t, "preco_entrada": round(pos["price"], 2),
            "preco_saida": round(fill, 2), "quantidade": qty, "resultado": round(net, 2),
            "resultado_pct": round(net / (pos["price"] * qty) * 100, 2), "custos": round(costs, 2),
            "barras": i - pos["i"] + 1, "motivo": reason, "venda_total": round((fill if sign > 0 else pos["price"]) * qty, 2),
        })
        pos = None

    for i, c in enumerate(candles):
        # 1) ordens marcadas no candle anterior executam na abertura deste
        if pending_exit and pos:
            close(i, c.o, exit_reason)
        pending_exit = False
        if pending_entry and pos is None:
            price = c.o * (1 + sign * slip)
            qty = lot_size(equity, price)
            if qty > 0:
                stop = alvo = None
                if s.stop_pct:
                    stop = price * (1 - sign * s.stop_pct / 100)
                if s.stop_atr and atr_series[i - 1]:
                    stop = price - sign * s.stop_atr * atr_series[i - 1]
                if s.alvo_pct:
                    alvo = price * (1 + sign * s.alvo_pct / 100)
                pos = {"i": i, "price": price, "qty": qty, "stop": stop, "alvo": alvo,
                       "costs": s.corretagem + price * qty * fee}
        pending_entry = False
        # 2) stop e alvo dentro do candle
        if pos:
            st, al = pos["stop"], pos["alvo"]
            hit_stop = st is not None and ((sign > 0 and c.l <= st) or (sign < 0 and c.h >= st))
            hit_alvo = al is not None and ((sign > 0 and c.h >= al) or (sign < 0 and c.l <= al))
            if hit_stop:
                gap = (sign > 0 and c.o < st) or (sign < 0 and c.o > st)
                close(i, c.o if gap else st, "stop")
            elif hit_alvo:
                gap = (sign > 0 and c.o > al) or (sign < 0 and c.o < al)
                close(i, c.o if gap else al, "alvo")
        # 3) fim do pregão no day trade, limite de barras e sinais de saída no fechamento
        if pos:
            if s.modalidade == "day_trade" and last_of_day[i]:
                close(i, c.c, "fim do pregão")
            elif s.max_barras and i - pos["i"] + 1 >= s.max_barras:
                close(i, c.c, "tempo")
            elif any(book.check(cond, i) for cond in s.saida) and i + 1 < len(candles):
                pending_exit, exit_reason = True, "sinal de saída"
        elif i + 1 < len(candles) and all(book.check(cond, i) for cond in s.entrada):
            # no day trade não se abre posição no último candle do dia (ela atravessaria a noite)
            if not (s.modalidade == "day_trade" and last_of_day[i]):
                pending_entry = True
        mark = equity
        if pos:
            mark += sign * (c.c - pos["price"]) * pos["qty"] - pos["costs"]
        curve.append((c.t, mark))
    if pos:
        close(len(candles) - 1, candles[-1].c, "fim do teste")
        curve[-1] = (candles[-1].t, equity)
    return summarize(s, candles, trades, curve)


def taxes(s: Strategy, trades: list[dict]) -> dict:
    rate = 0.20 if s.modalidade == "day_trade" or s.ticker.endswith("11") else 0.15
    exempt_ok = s.modalidade == "swing" and not s.ticker.endswith("11")
    by_month: dict[str, dict] = defaultdict(lambda: {"resultado": 0.0, "vendas": 0.0})
    for t in trades:
        m = datetime.fromtimestamp(t["saida"], SAO_PAULO).strftime("%Y-%m")
        by_month[m]["resultado"] += t["resultado"]
        by_month[m]["vendas"] += t["venda_total"]
    carry = total = 0.0
    months = []
    for m in sorted(by_month):
        res, sales = by_month[m]["resultado"], by_month[m]["vendas"]
        exempt = exempt_ok and sales <= 20_000 and res > 0
        tax = 0.0
        if res < 0:
            carry += -res
        elif not exempt:
            base = max(0.0, res - carry)
            carry = max(0.0, carry - res)
            tax = base * rate
        total += tax
        months.append({"mes": m, "resultado": round(res, 2), "vendas": round(sales, 2), "isento": exempt,
                       "imposto": round(tax, 2)})
    return {"aliquota": rate, "total": round(total, 2), "prejuizo_a_compensar": round(carry, 2), "meses": months[-24:]}


def max_drawdown(values: list[float]) -> float:
    peak, worst = values[0], 0.0
    for v in values:
        peak = max(peak, v)
        worst = min(worst, v / peak - 1 if peak > 0 else 0)
    return worst * 100


def summarize(s: Strategy, candles: list[Candle], trades: list[dict], curve: list[tuple[int, float]]) -> dict:
    wins = [t["resultado"] for t in trades if t["resultado"] > 0]
    losses = [t["resultado"] for t in trades if t["resultado"] <= 0]
    net = sum(t["resultado"] for t in trades)
    tax = taxes(s, trades)
    gross_win, gross_loss = sum(wins), -sum(losses)
    buy_hold = (candles[-1].c / candles[1].o - 1) * 100 * (1 if s.lado == "compra" else -1)
    in_market = sum(t["barras"] for t in trades)
    step = max(1, len(curve) // 400)
    sampled = curve[::step] + ([curve[-1]] if (len(curve) - 1) % step else [])
    warnings = []
    if len(trades) < 30:
        warnings.append(f"Só {len(trades)} operações no período: amostra pequena, o resultado pode ser sorte ou azar.")
    if INTERVALS[s.intervalo].intraday:
        warnings.append("Dados intradiários gratuitos cobrem só os últimos 60 dias (60 minutos: 2 anos). Teste também "
                        "em outros períodos antes de confiar na regra.")
    if s.lado == "venda" and s.modalidade == "swing":
        warnings.append("Venda a descoberto no swing exige aluguel de ações, que não está nos custos.")
    if not (s.stop_pct or s.stop_atr):
        warnings.append("A estratégia não tem stop: uma única operação pode levar uma perda grande.")
    return {
        "estrategia": s.model_dump(),
        "regras": {"entrada": [c.text() for c in s.entrada], "saida": [c.text() for c in s.saida]},
        "periodo": {"inicio": candles[0].t, "fim": candles[-1].t, "candles": len(candles)},
        "metricas": {
            "capital_inicial": s.capital,
            "capital_final": round(s.capital + net, 2),
            "resultado_liquido": round(net, 2),
            "retorno_pct": round(net / s.capital * 100, 2),
            "retorno_apos_ir_pct": round((net - tax["total"]) / s.capital * 100, 2),
            "comprar_e_segurar_pct": round(buy_hold, 2),
            "operacoes": len(trades),
            "taxa_acerto_pct": round(len(wins) / len(trades) * 100, 1) if trades else None,
            "ganho_medio": round(gross_win / len(wins), 2) if wins else None,
            "perda_media": round(-gross_loss / len(losses), 2) if losses else None,
            "payoff": round((gross_win / len(wins)) / (gross_loss / len(losses)), 2) if wins and losses and gross_loss else None,
            "fator_lucro": round(gross_win / gross_loss, 2) if gross_loss else None,
            "expectativa_por_operacao": round(net / len(trades), 2) if trades else None,
            "maior_queda_pct": round(max_drawdown([v for _, v in curve]), 2),
            "tempo_posicionado_pct": round(in_market / len(candles) * 100, 1),
            "custos_totais": round(sum(t["custos"] for t in trades), 2),
            "imposto_estimado": tax["total"],
        },
        "imposto": tax,
        "curva": [{"t": t, "v": round(v, 2)} for t, v in sampled],
        "operacoes": trades[-200:],
        "avisos": warnings,
    }


PRESETS = [
    {"id": "mme_9_21", "nome": "Cruzamento de médias 9 e 21", "descricao": "Compra quando a MME9 cruza a MME21 para cima "
     "e sai no cruzamento contrário. Stop de 3%.",
     "estrategia": {"intervalo": "1d", "modalidade": "swing", "entrada": [["mme9", "cruza_acima", "mme21"]],
                    "saida": [["mme9", "cruza_abaixo", "mme21"]], "stop_pct": 3}},
    {"id": "setup_91", "nome": "Setup 9.1 (Larry Williams)", "descricao": "Compra quando a MME9 vira para cima com o "
     "preço acima dela; sai quando o preço fecha abaixo da MME9. Stop de 1,5 ATR.",
     "estrategia": {"intervalo": "1d", "modalidade": "swing",
                    "entrada": [["preco", "cruza_acima", "mme9"], ["mme9", "acima", "mma50"]],
                    "saida": [["preco", "cruza_abaixo", "mme9"]], "stop_atr": 1.5}},
    {"id": "ifr2", "nome": "IFR2 em tendência de alta", "descricao": "Compra quando o IFR de 2 períodos fica abaixo de "
     "10 com o preço acima da MMA200; sai quando o IFR2 passa de 70 ou em 5 candles.",
     "estrategia": {"intervalo": "1d", "modalidade": "swing",
                    "entrada": [["ifr2", "abaixo", "10"], ["preco", "acima", "mma200"]],
                    "saida": [["ifr2", "acima", "70"]], "max_barras": 5}},
    {"id": "rompimento_20", "nome": "Rompimento de 20 candles", "descricao": "Compra quando o preço fecha acima da "
     "máxima dos 20 candles anteriores; sai quando perde a mínima dos 10 anteriores. Stop de 2 ATR.",
     "estrategia": {"intervalo": "1d", "modalidade": "swing", "entrada": [["preco", "acima", "max20"]],
                    "saida": [["preco", "abaixo", "min10"]], "stop_atr": 2}},
    {"id": "vwap_day", "nome": "Day trade na VWAP (5 min)", "descricao": "Compra quando o preço cruza a VWAP para cima "
     "com a MME9 acima da MME21; sai ao perder a VWAP. Stop de 0,8%, alvo de 1,5%, zera no fim do pregão.",
     "estrategia": {"intervalo": "5m", "modalidade": "day_trade",
                    "entrada": [["preco", "cruza_acima", "vwap"], ["mme9", "acima", "mme21"]],
                    "saida": [["preco", "cruza_abaixo", "vwap"]], "stop_pct": 0.8, "alvo_pct": 1.5}},
    {"id": "bollinger_reversao", "nome": "Reversão na Banda de Bollinger", "descricao": "Compra quando o preço volta "
     "para dentro da banda inferior; sai na média de 20. Stop de 4%.",
     "estrategia": {"intervalo": "1d", "modalidade": "swing", "entrada": [["preco", "cruza_acima", "bb_inf20"]],
                    "saida": [["preco", "acima", "bb_meio20"]], "stop_pct": 4}},
]


def preset_strategy(preset_id: str, ticker: str) -> Strategy:
    p = next(x for x in PRESETS if x["id"] == preset_id)
    e = dict(p["estrategia"])
    e["entrada"] = [{"esquerda": a, "operador": o, "direita": b} for a, o, b in e["entrada"]]
    e["saida"] = [{"esquerda": a, "operador": o, "direita": b} for a, o, b in e["saida"]]
    return Strategy(nome=p["nome"], ticker=ticker, **e)
