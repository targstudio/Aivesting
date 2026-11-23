"""Rotas HTTP do módulo de trading (montadas em main.create_app)."""

from datetime import datetime, time as dtime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..ai.portfolio_ai import MAX_IMAGES, ImageError, decode_image
from ..portfolio import TICKER_RE
from .ai import TradingAI, guess_strategy
from .data import BACKTEST_RANGE
from .backtest import PRESETS, SERIES_HELP, Strategy, preset_strategy, run
from .data import INTERVALS, SAO_PAULO, candles_json
from .indicators import bollinger, ema, macd, r, rsi, sma, vwap
from .journal import JournalRequest, summarize
from .service import VIEWS, TradingService
from .setups import SETUPS, analyze

DISCLAIMER = (
    "Dados com cerca de 15 minutos de atraso (Yahoo Finance, uso só para testes). Indicadores, setups e testes de "
    "estratégia são informativos e não são recomendação de compra ou venda. Resultado passado não garante resultado "
    "futuro. Day trade tem risco alto: use stop e arrisque pouco por operação."
)


class TextStrategyRequest(BaseModel):
    texto: str = Field(min_length=5, max_length=1500)
    ticker: str = Field(default="PETR4", max_length=8)


class PresetRequest(BaseModel):
    preset: str = Field(max_length=40)
    ticker: str = Field(max_length=8)
    intervalo: Literal["5m", "15m", "60m", "1d", "1wk"] | None = None


class NotesRequest(BaseModel):
    images: list[str] = Field(min_length=1, max_length=MAX_IMAGES)


def market_phase(now: datetime | None = None) -> dict:
    """Fase do pregão de ações da B3 (horário de Brasília)."""
    now = (now or datetime.now(SAO_PAULO)).astimezone(SAO_PAULO)
    t = now.time()
    phases = [
        (dtime(9, 45), dtime(10, 0), "pre_abertura", "Pré-abertura (leilão)"),
        (dtime(10, 0), dtime(16, 55), "aberto", "Pregão aberto"),
        (dtime(16, 55), dtime(17, 0), "call_fechamento", "Call de fechamento"),
    ]
    if now.weekday() < 5:
        for start, end, key, label in phases:
            if start <= t < end:
                return {"fase": key, "label": label, "agora": now.isoformat(), "aberto": key == "aberto"}
    return {"fase": "fechado", "label": "Pregão fechado", "agora": now.isoformat(), "aberto": False}


def chart_series(data: dict) -> dict:
    cs = data["candles"]
    closes = [c.c for c in cs]
    up, mid, lo = bollinger(closes)
    m, s, h = macd(closes)
    rr = lambda xs, nd=2: [r(x, nd) for x in xs]  # noqa: E731
    out = {
        "mme9": rr(ema(closes, 9)), "mme21": rr(ema(closes, 21)), "mma50": rr(sma(closes, 50)),
        "mma200": rr(sma(closes, 200)), "bb_sup": rr(up), "bb_meio": rr(mid), "bb_inf": rr(lo),
        "ifr14": rr(rsi(closes, 14), 1), "macd": rr(m, 3), "macd_sinal": rr(s, 3), "macd_hist": rr(h, 3),
    }
    if INTERVALS[data["interval"]].intraday:
        out["vwap"] = rr(vwap(cs))
    return out


def build_router(source, radar: TradingService, settings, usage, ai_rate_limit, require_ai) -> APIRouter:
    router = APIRouter(prefix="/trading", tags=["trading"])

    def check_ticker(ticker: str) -> str:
        t = ticker.upper().strip()
        if not (TICKER_RE.match(t) or t in ("^BVSP",)):
            raise HTTPException(404, "Ticker inválido.")
        return t

    @router.get("/pregao")
    async def phase():
        return market_phase()

    @router.get("/candles/{ticker}")
    async def candles(ticker: str, intervalo: str = "1d"):
        if intervalo not in INTERVALS:
            raise HTTPException(404, "Intervalo desconhecido.")
        data = await source.get(check_ticker(ticker), intervalo)
        if not data:
            raise HTTPException(404, f"Sem candles para {ticker.upper()} em {INTERVALS[intervalo].label}.")
        return {
            "ticker": data["ticker"], "name": data["name"], "interval": intervalo,
            "interval_label": INTERVALS[intervalo].label, "intraday": INTERVALS[intervalo].intraday,
            "price": data["price"], "previous_close": data["previous_close"], "as_of": data["as_of"],
            "source": data["source"], "realtime": data["realtime"],
            "candles": candles_json(data["candles"]),
            "series": chart_series(data),
            "analysis": analyze(data, INTERVALS[intervalo].intraday),
            "pregao": market_phase(),
            "disclaimer": DISCLAIMER,
        }

    @router.get("/radar")
    async def radar_view(visao: str = "setups", setup: str | None = None):
        if visao not in VIEWS or (setup and setup not in SETUPS):
            raise HTTPException(404, "Visão desconhecida.")
        if radar.snapshot is None:
            await radar.refresh()
        result = radar.view(visao, setup)
        if result is None:
            raise HTTPException(503, "O radar ainda está sendo montado. Tente de novo em um minuto.")
        return {**result, "pregao": market_phase()}

    @router.get("/estrategias")
    async def presets():
        return {"prontas": PRESETS, "series": SERIES_HELP, "intervalos": {k: v.label for k, v in INTERVALS.items()},
                "disclaimer": DISCLAIMER}

    async def backtest(strategy: Strategy) -> dict:
        data = await source.get(strategy.ticker, strategy.intervalo, BACKTEST_RANGE[strategy.intervalo])
        if not data:
            raise HTTPException(404, f"Sem candles para {strategy.ticker}.")
        try:
            result = run(strategy, data["candles"])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return {**result, "fonte": data["source"], "disclaimer": DISCLAIMER}

    @router.post("/backtest")
    async def backtest_rules(body: Strategy):
        return await backtest(body)

    @router.post("/backtest/pronta")
    async def backtest_preset(body: PresetRequest):
        if not any(p["id"] == body.preset for p in PRESETS):
            raise HTTPException(404, "Estratégia pronta desconhecida.")
        strategy = preset_strategy(body.preset, check_ticker(body.ticker))
        if body.intervalo:
            if strategy.modalidade == "day_trade" and not INTERVALS[body.intervalo].intraday:
                raise HTTPException(422, "Day trade precisa de gráfico de 5, 15 ou 60 minutos.")
            strategy = strategy.model_copy(update={"intervalo": body.intervalo})
        return await backtest(strategy)

    @router.post("/backtest/texto")
    async def backtest_text(body: TextStrategyRequest, request: Request):
        """A estratégia escrita em português vira regras (pela IA, ou por leitura automática sem IA) e é testada."""
        ticker = check_ticker(body.ticker)
        explanation, by_ai = "", False
        if settings.anthropic_api_key:
            ai_rate_limit(request)
            try:
                strategy, explanation = await TradingAI(settings.anthropic_api_key, settings.anthropic_model,
                                                        usage).strategy(body.texto, ticker)
                by_ai = True
            except ValueError as exc:
                strategy, explanation = guess_strategy(body.texto, ticker)
                explanation = f"{explanation} ({str(exc)[:160]})"
        else:
            strategy, explanation = guess_strategy(body.texto, ticker)
        return {**(await backtest(strategy)), "explicacao": explanation, "lido_pela_ia": by_ai}

    @router.post("/diario/resumo")
    async def journal(body: JournalRequest):
        return summarize(body.trades)

    @router.post("/diario/ler")
    async def read_notes(body: NotesRequest, request: Request):
        """Lê prints de notas de corretagem com a IA e devolve as operações para conferir. Não guarda as imagens."""
        require_ai()
        try:
            images = [decode_image(i) for i in body.images]
        except ImageError as exc:
            raise HTTPException(422, str(exc)) from None
        ai_rate_limit(request)
        try:
            return await TradingAI(settings.anthropic_api_key, settings.anthropic_model, usage).read_notes(images)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    return router
