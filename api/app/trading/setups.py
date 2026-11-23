"""Leitura técnica de um ativo: tendência, indicadores do último candle, setups clássicos do mercado brasileiro e
níveis de referência (pivôs, suporte e resistência, stop pelo ATR).

Os setups descrevem o que o gráfico mostra agora, com regras fixas e públicas. Não são recomendação: a decisão de
entrar, o tamanho da posição e o stop são de quem opera.
"""

from .data import Candle
from .indicators import (
    atr, bollinger, daily_from_intraday, day_key, ema, macd, pivots, r, rolling_max, rolling_min, rsi, sma, stochastic,
    vwap,
)

SETUPS = {
    "mm_cruzou_alta": ("Médias 9 e 21 cruzaram para cima", "alta"),
    "mm_cruzou_baixa": ("Médias 9 e 21 cruzaram para baixo", "baixa"),
    "setup_91_compra": ("Setup 9.1 de compra (MME9 virou para cima)", "alta"),
    "setup_91_venda": ("Setup 9.1 de venda (MME9 virou para baixo)", "baixa"),
    "ifr2_sobrevendido": ("IFR2 abaixo de 10 (sobrevenda curtíssima)", "alta"),
    "ifr2_sobrecomprado": ("IFR2 acima de 90 (sobrecompra curtíssima)", "baixa"),
    "ifr_sobrevendido": ("IFR14 abaixo de 30", "alta"),
    "ifr_sobrecomprado": ("IFR14 acima de 70", "baixa"),
    "rompeu_maxima20": ("Rompeu a máxima das últimas 20 barras", "alta"),
    "perdeu_minima20": ("Perdeu a mínima das últimas 20 barras", "baixa"),
    "macd_cruzou_alta": ("MACD cruzou a linha de sinal para cima", "alta"),
    "macd_cruzou_baixa": ("MACD cruzou a linha de sinal para baixo", "baixa"),
    "bollinger_fora_baixo": ("Fechou abaixo da Banda de Bollinger inferior", "alta"),
    "bollinger_fora_cima": ("Fechou acima da Banda de Bollinger superior", "baixa"),
    "volume_forte": ("Volume acima de 2 vezes a média de 20 barras", "neutro"),
    "gap_alta": ("Abriu com gap de alta acima de 2%", "alta"),
    "gap_baixa": ("Abriu com gap de baixa acima de 2%", "baixa"),
    "acima_vwap": ("Preço acima da VWAP do dia", "alta"),
    "abaixo_vwap": ("Preço abaixo da VWAP do dia", "baixa"),
    "inside_bar": ("Inside bar (candle dentro do anterior)", "neutro"),
}

DETAILS = {
    "mm_cruzou_alta": "A média exponencial de 9 períodos passou por cima da de 21: o curto prazo ganhou força.",
    "mm_cruzou_baixa": "A média exponencial de 9 períodos passou por baixo da de 21: o curto prazo perdeu força.",
    "setup_91_compra": "Setup de Larry Williams: a MME9 vinha caindo e virou para cima. A entrada clássica é acima da "
    "máxima deste candle, com stop abaixo da mínima.",
    "setup_91_venda": "A MME9 vinha subindo e virou para baixo. A venda clássica é abaixo da mínima deste candle, com "
    "stop acima da máxima.",
    "ifr2_sobrevendido": "IFR de 2 períodos muito baixo: queda curta e forte, que em tendência de alta costuma ter repique.",
    "ifr2_sobrecomprado": "IFR de 2 períodos muito alto: alta curta e forte, sujeita a realização.",
    "ifr_sobrevendido": "O IFR de 14 períodos está abaixo de 30: o preço caiu rápido demais em relação à média.",
    "ifr_sobrecomprado": "O IFR de 14 períodos está acima de 70: o preço subiu rápido demais em relação à média.",
    "rompeu_maxima20": "Fechou acima da maior máxima das 20 barras anteriores: rompimento de resistência.",
    "perdeu_minima20": "Fechou abaixo da menor mínima das 20 barras anteriores: perda de suporte.",
    "macd_cruzou_alta": "A linha do MACD cruzou a de sinal para cima: a força compradora aumentou.",
    "macd_cruzou_baixa": "A linha do MACD cruzou a de sinal para baixo: a força vendedora aumentou.",
    "bollinger_fora_baixo": "Fechou fora da banda inferior: queda esticada, que costuma voltar para dentro das bandas.",
    "bollinger_fora_cima": "Fechou fora da banda superior: alta esticada, que costuma voltar para dentro das bandas.",
    "volume_forte": "Volume muito acima do normal: há participação forte, o que dá mais peso ao movimento do candle.",
    "gap_alta": "A abertura ficou mais de 2% acima do fechamento anterior.",
    "gap_baixa": "A abertura ficou mais de 2% abaixo do fechamento anterior.",
    "acima_vwap": "No intradiário, o preço está acima do preço médio do dia ponderado pelo volume: compradores no controle.",
    "abaixo_vwap": "No intradiário, o preço está abaixo do preço médio do dia ponderado pelo volume: vendedores no controle.",
    "inside_bar": "Máxima e mínima ficaram dentro do candle anterior: compressão que costuma anteceder um movimento.",
}


def crossed_up(a, b, i) -> bool:
    return None not in (a[i], b[i], a[i - 1], b[i - 1]) and a[i - 1] <= b[i - 1] and a[i] > b[i]


def crossed_down(a, b, i) -> bool:
    return None not in (a[i], b[i], a[i - 1], b[i - 1]) and a[i - 1] >= b[i - 1] and a[i] < b[i]


def detect(candles: list[Candle], intraday: bool, i: int | None = None) -> list[str]:
    """Setups presentes na barra i (a última, por padrão)."""
    if len(candles) < 30:
        return []
    i = len(candles) - 1 if i is None else i
    closes = [c.c for c in candles[: i + 1]]
    cs = candles[: i + 1]
    e9, e21 = ema(closes, 9), ema(closes, 21)
    r2, r14 = rsi(closes, 2), rsi(closes, 14)
    m, s, _ = macd(closes)
    up, _, lo = bollinger(closes)
    hi20, lo20 = rolling_max([c.h for c in cs], 20), rolling_min([c.l for c in cs], 20)
    vavg = sma([c.v for c in cs], 20)
    out: list[str] = []
    if crossed_up(e9, e21, i):
        out.append("mm_cruzou_alta")
    if crossed_down(e9, e21, i):
        out.append("mm_cruzou_baixa")
    if None not in (e9[i], e9[i - 1], e9[i - 2]):
        if e9[i - 1] < e9[i - 2] and e9[i] > e9[i - 1]:
            out.append("setup_91_compra")
        if e9[i - 1] > e9[i - 2] and e9[i] < e9[i - 1]:
            out.append("setup_91_venda")
    if r2[i] is not None and r2[i] < 10:
        out.append("ifr2_sobrevendido")
    if r2[i] is not None and r2[i] > 90:
        out.append("ifr2_sobrecomprado")
    if r14[i] is not None and r14[i] < 30:
        out.append("ifr_sobrevendido")
    if r14[i] is not None and r14[i] > 70:
        out.append("ifr_sobrecomprado")
    if hi20[i] is not None and cs[i].c > hi20[i]:
        out.append("rompeu_maxima20")
    if lo20[i] is not None and cs[i].c < lo20[i]:
        out.append("perdeu_minima20")
    if crossed_up(m, s, i):
        out.append("macd_cruzou_alta")
    if crossed_down(m, s, i):
        out.append("macd_cruzou_baixa")
    if lo[i] is not None and cs[i].c < lo[i]:
        out.append("bollinger_fora_baixo")
    if up[i] is not None and cs[i].c > up[i]:
        out.append("bollinger_fora_cima")
    if vavg[i - 1] and cs[i].v > 2 * vavg[i - 1]:
        out.append("volume_forte")
    if cs[i].h <= cs[i - 1].h and cs[i].l >= cs[i - 1].l:
        out.append("inside_bar")
    if intraday:
        vw = vwap(cs)
        out.append("acima_vwap" if cs[i].c > vw[i] else "abaixo_vwap")
        # Gap na abertura do pregão atual (primeiro candle do dia contra o último do dia anterior).
        today = day_key(cs[i].t)
        first = next(j for j in range(i, -1, -1) if j == 0 or day_key(cs[j - 1].t) != today)
        if first > 0:
            gap = cs[first].o / cs[first - 1].c - 1
            if gap > 0.02:
                out.append("gap_alta")
            elif gap < -0.02:
                out.append("gap_baixa")
    else:
        gap = cs[i].o / cs[i - 1].c - 1
        if gap > 0.02:
            out.append("gap_alta")
        elif gap < -0.02:
            out.append("gap_baixa")
    return out


def trend(closes: list[float]) -> dict:
    """Tendência pelo alinhamento das médias: preço, MME21, MMA50 e MMA200 (quando há barras)."""
    last = closes[-1]
    e21, m50, m200 = ema(closes, 21)[-1], sma(closes, 50)[-1], sma(closes, 200)[-1]
    score = 0
    for ref in (e21, m50, m200):
        if ref is not None:
            score += 1 if last > ref else -1
    if e21 is not None and m50 is not None:
        score += 1 if e21 > m50 else -1
    label = "Alta" if score >= 3 else "Baixa" if score <= -3 else "Lateral"
    return {"label": label, "score": score, "mme21": r(e21), "mma50": r(m50), "mma200": r(m200)}


def analyze(data: dict, intraday: bool) -> dict:
    """Resumo técnico do último candle, para a tela, o radar e a IA."""
    candles: list[Candle] = data["candles"]
    closes = [c.c for c in candles]
    last = candles[-1]
    r14, r2 = rsi(closes, 14), rsi(closes, 2)
    m, s, h = macd(closes)
    up, mid, lo = bollinger(closes)
    a = atr(candles)
    k, d = stochastic(candles)
    vavg = sma([c.v for c in candles], 20)
    daily = daily_from_intraday(candles) if intraday else candles
    prev_day = daily[-2] if len(daily) > 1 else None
    found = detect(candles, intraday)
    atr_now = a[-1]
    hi20, lo20 = max(c.h for c in candles[-20:]), min(c.l for c in candles[-20:])
    levels = {
        "resistencia_20": r(hi20), "suporte_20": r(lo20),
        "stop_compra_atr": r(last.c - 1.5 * atr_now) if atr_now else None,
        "stop_venda_atr": r(last.c + 1.5 * atr_now) if atr_now else None,
        **({f"pivo_{k_}": r(v) for k_, v in pivots(prev_day).items()} if prev_day else {}),
    }
    if intraday:
        levels["vwap"] = r(vwap(candles)[-1])
    change = (last.c / prev_day.c - 1) * 100 if prev_day else None
    return {
        "ticker": data["ticker"],
        "name": data.get("name"),
        "interval": data["interval"],
        "price": r(last.c),
        "change_percent": r(change),
        "as_of": data.get("as_of"),
        "source": data.get("source"),
        "trend": trend(closes),
        "indicators": {
            "ifr14": r(r14[-1], 1), "ifr2": r(r2[-1], 1),
            "macd": r(m[-1], 3), "macd_sinal": r(s[-1], 3), "macd_hist": r(h[-1], 3),
            "bb_sup": r(up[-1]), "bb_meio": r(mid[-1]), "bb_inf": r(lo[-1]),
            "atr14": r(atr_now), "atr_pct": r(atr_now / last.c * 100) if atr_now else None,
            "estocastico_k": r(k[-1], 1), "estocastico_d": r(d[-1], 1),
            "volume": last.v, "volume_relativo": r(last.v / vavg[-2], 2) if len(vavg) > 1 and vavg[-2] else None,
        },
        "setups": [
            {"key": key, "label": SETUPS[key][0], "direction": SETUPS[key][1], "detail": DETAILS[key]} for key in found
        ],
        "levels": levels,
    }
