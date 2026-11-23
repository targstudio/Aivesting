"""Indicadores técnicos em Python puro. Cada função devolve uma lista do mesmo tamanho da entrada, com None onde
ainda não há barras suficientes (o "aquecimento" do indicador)."""

import math
from datetime import datetime

from .data import SAO_PAULO, Candle

Series = list[float | None]


def sma(values: list[float], n: int) -> Series:
    out: Series = [None] * len(values)
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= n:
            total -= values[i - n]
        if i >= n - 1:
            out[i] = total / n
    return out


def ema(values: list[float], n: int) -> Series:
    out: Series = [None] * len(values)
    if len(values) < n:
        return out
    k = 2 / (n + 1)
    prev = sum(values[:n]) / n
    out[n - 1] = prev
    for i in range(n, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values: list[float], n: int = 14) -> Series:
    """IFR de Wilder."""
    out: Series = [None] * len(values)
    if len(values) <= n:
        return out
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    avg_g, avg_l = gains / n, losses / n
    out[n] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
    for i in range(n + 1, len(values)):
        d = values[i] - values[i - 1]
        avg_g = (avg_g * (n - 1) + max(d, 0)) / n
        avg_l = (avg_l * (n - 1) + max(-d, 0)) / n
        out[i] = 100.0 if avg_l == 0 else 100 - 100 / (1 + avg_g / avg_l)
    return out


def macd(values: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[Series, Series, Series]:
    f, s = ema(values, fast), ema(values, slow)
    line: Series = [a - b if a is not None and b is not None else None for a, b in zip(f, s)]
    start = next((i for i, v in enumerate(line) if v is not None), len(line))
    sig_part = ema([v for v in line[start:] if v is not None], signal)
    sig: Series = [None] * start + sig_part
    hist: Series = [a - b if a is not None and b is not None else None for a, b in zip(line, sig)]
    return line, sig, hist


def bollinger(values: list[float], n: int = 20, k: float = 2.0) -> tuple[Series, Series, Series]:
    mid = sma(values, n)
    up: Series = [None] * len(values)
    lo: Series = [None] * len(values)
    for i in range(n - 1, len(values)):
        window = values[i - n + 1 : i + 1]
        m = mid[i]
        sd = math.sqrt(sum((x - m) ** 2 for x in window) / n)
        up[i], lo[i] = m + k * sd, m - k * sd
    return up, mid, lo


def atr(candles: list[Candle], n: int = 14) -> Series:
    out: Series = [None] * len(candles)
    if len(candles) <= n:
        return out
    trs = [candles[0].h - candles[0].l]
    for i in range(1, len(candles)):
        c, p = candles[i], candles[i - 1].c
        trs.append(max(c.h - c.l, abs(c.h - p), abs(c.l - p)))
    prev = sum(trs[1 : n + 1]) / n
    out[n] = prev
    for i in range(n + 1, len(candles)):
        prev = (prev * (n - 1) + trs[i]) / n
        out[i] = prev
    return out


def stochastic(candles: list[Candle], n: int = 14, d: int = 3) -> tuple[Series, Series]:
    k: Series = [None] * len(candles)
    for i in range(n - 1, len(candles)):
        w = candles[i - n + 1 : i + 1]
        hi, lo = max(c.h for c in w), min(c.l for c in w)
        k[i] = 50.0 if hi == lo else (candles[i].c - lo) / (hi - lo) * 100
    start = n - 1
    dd = sma([v for v in k[start:] if v is not None], d) if len(candles) > start else []
    return k, [None] * start + dd


def day_key(t: int) -> str:
    return datetime.fromtimestamp(t, SAO_PAULO).strftime("%Y-%m-%d")


def vwap(candles: list[Candle]) -> Series:
    """Preço médio ponderado pelo volume, recomeçando a cada pregão (para gráficos intradiários)."""
    out: Series = []
    day, pv, vol = None, 0.0, 0.0
    for c in candles:
        k = day_key(c.t)
        if k != day:
            day, pv, vol = k, 0.0, 0.0
        typical = (c.h + c.l + c.c) / 3
        pv += typical * c.v
        vol += c.v
        out.append(pv / vol if vol else typical)
    return out


def rolling_max(values: list[float], n: int) -> Series:
    """Máxima das n barras ANTERIORES (sem a atual), para detectar rompimento sem olhar o futuro."""
    return [max(values[i - n : i]) if i >= n else None for i in range(len(values))]


def rolling_min(values: list[float], n: int) -> Series:
    return [min(values[i - n : i]) if i >= n else None for i in range(len(values))]


def pivots(prev: Candle) -> dict[str, float]:
    """Pontos de pivô clássicos a partir do pregão anterior: referência de suporte e resistência do day trader."""
    pp = (prev.h + prev.l + prev.c) / 3
    return {
        "R2": pp + (prev.h - prev.l), "R1": 2 * pp - prev.l, "PP": pp,
        "S1": 2 * pp - prev.h, "S2": pp - (prev.h - prev.l),
    }


def daily_from_intraday(candles: list[Candle]) -> list[Candle]:
    """Junta barras intradiárias em barras diárias (máxima, mínima e fechamento de cada pregão)."""
    out: list[Candle] = []
    day = None
    for c in candles:
        k = day_key(c.t)
        if k != day:
            out.append(Candle(c.t, c.o, c.h, c.l, c.c, c.v))
            day = k
        else:
            last = out[-1]
            out[-1] = Candle(last.t, last.o, max(last.h, c.h), min(last.l, c.l), c.c, last.v + c.v)
    return out


def r(v: float | None, nd: int = 2) -> float | None:
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(v, nd)
