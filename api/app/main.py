import asyncio
import logging
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Literal

import anthropic
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .advisor import QUESTIONS, PlanRequest, build_plan
from .ai.advisor_ai import EXPLAIN_TASK, advisor_system
from .ai.assistant import Assistant
from .ai.explain import Explainer
from .ai.swot import SwotAnalyst, build_payload as swot_payload, world_markets
from .ai.portfolio_ai import MAX_IMAGES, ImageError, PortfolioAI, decode_image, slim_analysis
from .ai.insights import LEVELS, REFRESH_MIN_SECONDS, Insights, valid_context
from .ai.usage import UsageTracker
from .alerts import Alert, evaluate
from .config import Settings, get_settings
from .longterm.model import HORIZONS
from .longterm.service import LongTermService
from .market import MarketService
from .providers.bcb import BcbClient
from .providers.brapi import BrapiProvider
from .providers.demo import DemoMacro, DemoProvider
from .providers.yahoo import YahooProvider
from .ranking.service import CLASSES, RankingService, market_is_open
from .portfolio import TICKER_RE, PortfolioRequest, analyze, compare_with_plan
from .storage import PortfolioStore, SupabaseStore

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


Level = Literal["iniciante", "intermediario", "avancado"]


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    # Tela em que a pessoa abriu a IA (ex.: "/ativo/PETR4") e nível de linguagem escolhido nas configurações.
    page: str | None = Field(default=None, max_length=200)
    level: Level = "iniciante"


class AdvisorChatRequest(ChatRequest):
    plan: dict | None = None
    # Análise da carteira importada (tela Minha carteira), para o assessor considerar o que a pessoa já tem.
    portfolio: dict | None = None


class PortfolioReadRequest(BaseModel):
    # Prints como data URL ("data:image/png;base64,..."). Não são gravados: vão só para a IA.
    images: list[str] = Field(min_length=1, max_length=MAX_IMAGES)


class PortfolioAnalysisRequest(PortfolioRequest):
    # Respostas do assessor (opcional): o plano é montado com o total da carteira para comparar.
    advisor: PlanRequest | None = None
    level: Level = "iniciante"


class PortfolioSaveRequest(PortfolioRequest):
    updated_at: datetime | None = None


PORTFOLIO_DISCLAIMER = (
    "Análise automática das posições que você informou, com dados do app e histórico desde 2000. Confira os valores "
    "na sua corretora. Rentabilidade passada não garante rentabilidade futura."
)


class AlertsRequest(BaseModel):
    alerts: list[Alert] = Field(max_length=100)


class AlertExplainRequest(BaseModel):
    alert: Alert
    level: Level = "iniciante"


ADVISOR_DISCLAIMER = (
    "Sugestões geradas automaticamente a partir do seu perfil e de dados de mercado. Todo investimento tem riscos; "
    "rentabilidade passada não garante rentabilidade futura. Avalie custos e impostos antes de investir."
)

LONGTERM_DISCLAIMER = (
    "Probabilidades estimadas por modelo estatístico com dados desde 2000 e validadas fora da amostra. "
    "Não é recomendação de investimento nem considera o seu perfil. Rentabilidade passada não garante "
    "rentabilidade futura."
)

DISCLAIMER = (
    "Conteúdo informativo gerado por modelo estatístico. Não é recomendação de investimento. "
    "Rentabilidade passada não garante rentabilidade futura."
)


log = logging.getLogger(__name__)


def describe_error(exc: Exception) -> tuple[int, str]:
    """Traduz erros da Anthropic (e qualquer outro) numa mensagem que a pessoa entende."""
    if isinstance(exc, anthropic.APIStatusError):
        text = str(exc).lower()
        if exc.status_code == 400 and "credit" in text:
            return 402, "Os créditos da IA acabaram. Recarregue em console.anthropic.com → Billing e tente de novo."
        if exc.status_code in (401, 403):
            return 502, "A chave da Anthropic foi recusada. Confira a ANTHROPIC_API_KEY no Render."
        if exc.status_code == 429:
            return 429, "A IA recebeu muitas perguntas agora. Espere alguns segundos e tente de novo."
        if exc.status_code >= 500:
            return 503, "A IA da Anthropic está instável agora. Tente de novo em alguns segundos."
        # Mostra o motivo que a Anthropic deu (ex.: pedido inválido), para o erro poder ser diagnosticado pela tela.
        reason = ""
        if isinstance(exc.body, dict):
            reason = str((exc.body.get("error") or {}).get("message") or "")[:200]
        return 502, "A IA não conseguiu responder a esta pergunta." + (f" Motivo: {reason}" if reason else " Tente reformular.")
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return 503, "Não consegui falar com a IA da Anthropic agora. Tente de novo em alguns segundos."
    return 500, "Erro inesperado na API. Tente de novo; se continuar, avise o suporte."


def create_app(settings: Settings | None = None, start_scheduler: bool = True) -> FastAPI:
    settings = settings or get_settings()
    if settings.demo_mode:
        provider, bcb = DemoProvider(), DemoMacro()
    else:
        provider = (
            YahooProvider()
            if settings.data_provider == "yahoo"
            else BrapiProvider(settings.brapi_base_url, settings.brapi_token)
        )
        bcb = BcbClient(settings.bcb_base_url)
    store = (
        SupabaseStore(settings.supabase_url, settings.supabase_secret_key)
        if settings.supabase_url and settings.supabase_secret_key
        else None
    )
    portfolios = (
        PortfolioStore(settings.supabase_url, settings.supabase_secret_key)
        if settings.supabase_url and settings.supabase_secret_key
        else None
    )
    ranking = RankingService(settings, provider, store)
    longterm = LongTermService(settings.longterm_path)
    # O panorama (índices, moedas, commodities) vem do Yahoo, gratuito, mesmo quando as ações vêm da brapi.
    market = MarketService(
        None if settings.demo_mode else provider if isinstance(provider, YahooProvider) else YahooProvider()
    )
    usage = UsageTracker(settings.supabase_url, settings.supabase_secret_key)
    insights = Insights(settings.anthropic_api_key, settings.anthropic_model, ranking, bcb, longterm, market, usage)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if start_scheduler:
            await ranking.recompute(force=True)
            ranking.start()
        yield
        ranking.stop()

    app = FastAPI(title="AI.vesting API", version="0.1.0", lifespan=lifespan)

    # Registrado antes do CORS para ficar por dentro dele: um erro inesperado volta como JSON com os cabeçalhos de
    # CORS, e o navegador mostra a mensagem em vez de um "falha de rede" genérico.
    @app.middleware("http")
    async def friendly_errors(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:  # noqa: BLE001
            status, detail = describe_error(exc)
            log.exception("erro em %s %s", request.method, request.url.path)
            return JSONResponse({"detail": detail}, status_code=status)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip().rstrip("/") for o in settings.web_origin.split(",") if o.strip()],
        allow_methods=["*"], allow_headers=["*"]
    )
    app.state.ranking = ranking
    app.state.bcb = bcb
    app.state.provider = provider
    app.state.longterm = longterm
    app.state.market = market
    app.state.insights = insights

    def get_ranking() -> RankingService:
        return app.state.ranking

    ai_calls: dict[str, deque] = defaultdict(deque)
    explain_cache: dict[tuple, tuple[str, float, str]] = {}  # (texto, time.time(), ISO de quando foi gerada)
    swot_cache: dict[tuple, tuple[dict, float, str]] = {}  # (quadro SWOT, time.time(), ISO de quando foi gerado)

    def ai_rate_limit(request: Request) -> None:
        """Janela deslizante de 1 hora por IP. Em memória: vale por instância da API."""
        key = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
        now = time.monotonic()
        calls = ai_calls[key]
        while calls and now - calls[0] > 3600:
            calls.popleft()
        if len(calls) >= settings.ai_requests_per_hour:
            raise HTTPException(429, "Limite de perguntas à IA atingido. Tente de novo mais tarde.")
        calls.append(now)

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "provider": provider.name,
            "realtime": provider.realtime,
            "database": store is not None,
            "ai": bool(settings.anthropic_api_key),
            "ai_requests_per_hour": settings.ai_requests_per_hour,
            "ranking_interval_minutes": settings.ranking_interval_minutes,
            "market_open": market_is_open(settings),
            "longterm": app.state.longterm.data is not None,
            "advisor": settings.advisor_mode == "public",
            "portfolio_storage": portfolios is not None,
        }

    # ---- Modo assessor ----

    def require_advisor() -> None:
        if settings.advisor_mode != "public":
            raise HTTPException(403, "O modo assessor está desligado.")

    def advisor_picks(svc: RankingService) -> dict[str, dict[str, list[dict]]]:
        """Primeiros ativos do app em cada prazo: curto pelo ranking de 5 min, médio (3 anos) e longo (10 anos)
        pelo ranking de horizontes calibrado com o histórico."""
        out: dict[str, dict[str, list[dict]]] = {}
        for cls in ("acoes", "fiis"):
            terms: dict[str, list[dict]] = {}
            if (snap := svc.snapshots.get(cls)) and snap.assets:
                terms["curto"] = [
                    {"ticker": a.ticker, "name": a.name, "logo_url": a.logo_url,
                     "probability": a.probability_outperform, "note": f"{a.rank}º no ranking de curto prazo"}
                    for a in snap.assets[:5]
                ]
            for term, years in (("medio", 3), ("longo", 10)):
                horizon = app.state.longterm.horizon(cls, years) if app.state.longterm.data else None
                if horizon and horizon["assets"]:
                    terms[term] = [
                        {"ticker": a["ticker"], "name": a["name"], "logo_url": a.get("logo_url"),
                         "probability": a.get("prob_beat_benchmark"),
                         "note": f"{a['rank']}º no horizonte de {years} anos"}
                        for a in horizon["assets"][:5]
                    ]
            out[cls] = terms
        return out

    @app.get("/assessor/perguntas")
    async def advisor_questions():
        require_advisor()
        return {"perguntas": QUESTIONS}

    @app.post("/assessor/plano")
    async def advisor_plan(body: PlanRequest, svc: RankingService = Depends(get_ranking)):
        require_advisor()
        macro = {i.key: i.value for i in await app.state.bcb.indicators()}
        plan = build_plan(body, macro, advisor_picks(svc))
        return {**plan, "disclaimer": ADVISOR_DISCLAIMER}

    @app.post("/assessor/explicar")
    async def advisor_explain(body: PlanRequest, request: Request, nivel: Level = "iniciante",
                              svc: RankingService = Depends(get_ranking)):
        require_advisor()
        require_ai()
        ai_rate_limit(request)
        macro = {i.key: i.value for i in await app.state.bcb.indicators()}
        plan = build_plan(body, macro, advisor_picks(svc))
        text = await app.state.insights.complete_with(advisor_system(plan, LEVELS[nivel]), EXPLAIN_TASK)
        return {"explanation": text, "disclaimer": ADVISOR_DISCLAIMER}

    @app.post("/assessor/chat")
    async def advisor_chat(body: AdvisorChatRequest, request: Request, svc: RankingService = Depends(get_ranking)):
        require_advisor()
        require_ai()
        if body.messages[-1].role != "user":
            raise HTTPException(422, "A última mensagem precisa ser do usuário.")
        ai_rate_limit(request)
        assistant = Assistant(
            settings.anthropic_api_key, settings.anthropic_model, svc, app.state.bcb, app.state.longterm,
            app.state.market, usage, "assessor_chat",
        )
        result = await assistant.reply(
            [m.model_dump(include={"role", "content"}) for m in body.messages],
            page=body.page,
            level=body.level,
            system=advisor_system(body.plan, LEVELS[body.level], body.portfolio and slim_analysis(body.portfolio)),
        )
        return {**result, "disclaimer": ADVISOR_DISCLAIMER}

    # ---- Minha carteira ----

    price_cache: dict[str, tuple[float, float]] = {}

    async def live_prices(tickers: set[str]) -> dict[str, float]:
        """Cotação de ativos da carteira que não estão no ranking (cache de 5 minutos). Falha vira preço do print."""
        if settings.demo_mode:
            return {}
        now = time.monotonic()
        missing = [t for t in tickers if TICKER_RE.match(t) and now - price_cache.get(t, (-1e9, 0))[0] > 300]
        if missing:
            try:
                quotes = await asyncio.wait_for(app.state.provider.quotes(missing[:40], history_days=30), 12)
                for q in quotes:
                    if q.price:
                        price_cache[q.ticker] = (now, q.price)
            except Exception:  # noqa: BLE001
                log.warning("sem cotação para %d ativos da carteira", len(missing))
        return {t: price_cache[t][1] for t in tickers if t in price_cache}

    async def portfolio_analysis(body: PortfolioRequest, svc: RankingService) -> dict:
        ranked = {
            a.ticker: {**asdict(a), "total": len(s.assets)} for s in svc.snapshots.values() for a in s.assets
        }
        outside = {h.ticker for h in body.holdings if h.ticker and h.ticker not in ranked}
        lt = app.state.longterm.data
        return analyze(body.holdings, ranked, await live_prices(outside), lt)

    @app.post("/carteira/ler")
    async def portfolio_read(body: PortfolioReadRequest, request: Request):
        """Lê prints da carteira com a IA e devolve as posições para a pessoa conferir. As imagens não são guardadas."""
        require_ai()
        try:
            images = [decode_image(i) for i in body.images]
        except ImageError as exc:
            raise HTTPException(422, str(exc)) from None
        ai_rate_limit(request)
        try:
            result = await PortfolioAI(settings.anthropic_api_key, settings.anthropic_model, usage).extract(images)
        except ValueError as exc:
            raise HTTPException(422, str(exc) or "A IA não devolveu uma carteira válida. Tente de novo.") from None
        total = round(sum(h["value"] or 0 for h in result["holdings"]), 2)
        seen = round(sum(t["value"] for t in result.get("section_totals", [])), 2)
        return {**result, "total": total, "totals_match": abs(total - seen) <= max(1.0, seen * 0.005) if seen else None}

    @app.post("/carteira/analise")
    async def portfolio_analyze(body: PortfolioAnalysisRequest, svc: RankingService = Depends(get_ranking)):
        analysis = await portfolio_analysis(body, svc)
        if body.advisor and settings.advisor_mode == "public" and analysis["total"]:
            macro = {i.key: i.value for i in await app.state.bcb.indicators()}
            req = body.advisor.model_copy(update={"amount": analysis["total"]})
            plan = build_plan(req, macro, advisor_picks(svc))
            analysis["plan"] = {"profile": plan["profile"], "term_label": plan["term_label"],
                                "comparison": compare_with_plan(analysis, plan)}
        return {**analysis, "disclaimer": PORTFOLIO_DISCLAIMER}

    @app.post("/carteira/explicar")
    async def portfolio_explain(body: PortfolioAnalysisRequest, request: Request,
                                svc: RankingService = Depends(get_ranking)):
        require_ai()
        ai_rate_limit(request)
        analysis = (await portfolio_analyze(body, svc))
        if not analysis["total"]:
            raise HTTPException(422, "A carteira está vazia.")
        if "plan" in analysis:
            analysis["comparacao_plano"] = analysis.pop("plan")
        text = await PortfolioAI(settings.anthropic_api_key, settings.anthropic_model, usage).explain(
            analysis, settings.advisor_mode == "public", LEVELS[body.level]
        )
        return {"explanation": text, "disclaimer": PORTFOLIO_DISCLAIMER}

    def require_portfolios() -> PortfolioStore:
        if portfolios is None:
            raise HTTPException(503, "Banco de dados não configurado: a carteira fica só neste navegador.")
        return portfolios

    def portfolio_id(raw: str) -> str:
        try:
            return str(uuid.UUID(raw))
        except ValueError:
            raise HTTPException(404, "Carteira não encontrada.") from None

    @app.get("/carteira/{pid}")
    async def portfolio_get(pid: str):
        row = await require_portfolios().get(portfolio_id(pid))
        if row is None:
            raise HTTPException(404, "Carteira não encontrada.")
        return row

    @app.put("/carteira/{pid}")
    async def portfolio_save(pid: str, body: PortfolioSaveRequest):
        updated = (body.updated_at or datetime.now().astimezone()).isoformat()
        await require_portfolios().save(
            portfolio_id(pid), [h.model_dump() for h in body.holdings], updated
        )
        return {"ok": True, "updated_at": updated}

    @app.delete("/carteira/{pid}")
    async def portfolio_delete(pid: str):
        await require_portfolios().delete(portfolio_id(pid))
        return {"ok": True}

    def require_ai() -> None:
        if not settings.anthropic_api_key:
            raise HTTPException(503, "ANTHROPIC_API_KEY não configurada.")

    @app.get("/ia/consumo")
    async def ai_usage(desde: datetime | None = None):
        """Chamadas, tokens e custo estimado da IA (hoje, 7 e 30 dias, por função e por dia). Com `desde`, soma também o
        custo a partir desse momento (o app usa para descontar do saldo de créditos informado pela pessoa)."""
        await usage.load()
        usd = next((i.value for i in await app.state.bcb.indicators() if i.key == "usd_brl"), None)
        return {
            **usage.summary(usd, since=desde),
            "model": settings.anthropic_model,
            "ai": bool(settings.anthropic_api_key),
        }

    @app.get("/mercado")
    async def market_overview(svc: RankingService = Depends(get_ranking)):
        return {
            **await app.state.market.overview(svc),
            "pregao_aberto": market_is_open(settings),
            "disclaimer": DISCLAIMER,
        }

    @app.get("/ativos")
    async def list_assets(svc: RankingService = Depends(get_ranking)):
        """Lista enxuta dos ativos do app, para buscas e para criar alertas."""
        return {
            "ativos": [
                {"ticker": a.ticker, "name": a.name, "asset_class": a.asset_class, "price": a.price,
                 "change_percent": a.change_percent, "rank": a.rank,
                 "probability_outperform": a.probability_outperform, "logo_url": a.logo_url}
                for s in svc.snapshots.values()
                for a in s.assets
            ]
        }

    @app.get("/ia/leitura")
    async def ai_reading(request: Request, contexto: str, nivel: Level = "iniciante", atualizar: bool = False):
        """Leitura da IA para uma tela: inicio, mercado, macro, ranking:acoes, horizontes:fiis:5...

        Devolve a última leitura guardada (sem gastar tokens); só gera outra na primeira vez ou com `atualizar=true`."""
        if not valid_context(contexto):
            raise HTTPException(404, "Contexto desconhecido.")
        require_ai()
        cached = app.state.insights.cached(contexto, nivel, max_age=REFRESH_MIN_SECONDS if atualizar else None)
        if cached:
            return {**cached, "disclaimer": DISCLAIMER}
        ai_rate_limit(request)
        result = await app.state.insights.insight(contexto, nivel)
        if result is None:
            raise HTTPException(404, "Sem dados para essa leitura agora.")
        return {**result, "disclaimer": DISCLAIMER}

    @app.post("/alertas/avaliar")
    async def evaluate_alerts(body: AlertsRequest, svc: RankingService = Depends(get_ranking)):
        assets = {a.ticker: a for s in svc.snapshots.values() for a in s.assets}
        computed = [s.computed_at for s in svc.snapshots.values()]
        return {
            "resultados": [evaluate(a, assets.get(a.ticker.upper())).model_dump() for a in body.alerts],
            "calculado_em": max(computed) if computed else None,
        }

    @app.post("/alertas/explicar")
    async def explain_alert(body: AlertExplainRequest, request: Request, svc: RankingService = Depends(get_ranking)):
        require_ai()
        ai_rate_limit(request)
        assets = {a.ticker: a for s in svc.snapshots.values() for a in s.assets}
        result = evaluate(body.alert, assets.get(body.alert.ticker.upper()))
        text = await app.state.insights.explain_alert(body.alert, result, body.level)
        return {"id": body.alert.id, "explanation": text, "result": result.model_dump(), "disclaimer": DISCLAIMER}

    @app.get("/macro")
    async def macro():
        return {"indicators": [asdict(i) for i in await app.state.bcb.indicators()]}

    @app.get("/ranking/{asset_class}")
    async def get_class_ranking(asset_class: str, svc: RankingService = Depends(get_ranking)):
        if asset_class not in CLASSES:
            raise HTTPException(404, "Classe desconhecida. Use 'acoes' ou 'fiis'.")
        snapshot = svc.snapshots.get(asset_class)
        if snapshot is None:
            raise HTTPException(503, "Ranking ainda não calculado.")
        return {**asdict(snapshot), "disclaimer": DISCLAIMER}

    @app.post("/ranking/recompute")
    async def recompute(
        svc: RankingService = Depends(get_ranking), x_admin_token: str | None = Header(default=None)
    ):
        if settings.admin_token and x_admin_token != settings.admin_token:
            raise HTTPException(401, "Token de administrador inválido.")
        await svc.recompute(force=True)
        return {"classes": {k: len(v.assets) for k, v in svc.snapshots.items()}}

    def longterm_data() -> LongTermService:
        if app.state.longterm.data is None:
            raise HTTPException(503, "Modelo de horizontes ainda não calibrado.")
        return app.state.longterm

    @app.get("/horizontes")
    async def horizons_overview():
        return {**longterm_data().overview(), "disclaimer": LONGTERM_DISCLAIMER}

    @app.get("/horizontes/{asset_class}/{years}")
    async def horizon_ranking(asset_class: str, years: int):
        if asset_class not in CLASSES:
            raise HTTPException(404, "Classe desconhecida. Use 'acoes' ou 'fiis'.")
        if years not in HORIZONS:
            raise HTTPException(404, "Horizonte desconhecido. Use 1, 3, 5 ou 10.")
        result = longterm_data().horizon(asset_class, years)
        if result is None:
            raise HTTPException(404, "Sem dados para essa classe.")
        return {**result, "disclaimer": LONGTERM_DISCLAIMER}

    @app.get("/assets/{ticker}/historico")
    async def asset_history(ticker: str):
        result = longterm_data().asset(ticker.upper())
        if result is None:
            raise HTTPException(404, f"{ticker.upper()} não tem histórico de longo prazo.")
        return {**result, "disclaimer": LONGTERM_DISCLAIMER}

    def find_asset(svc: RankingService, ticker: str):
        ticker = ticker.upper()
        for snapshot in svc.snapshots.values():
            for asset in snapshot.assets:
                if asset.ticker == ticker:
                    return asset, snapshot
        raise HTTPException(404, f"{ticker} não está no ranking.")

    @app.get("/assets/{ticker}")
    async def get_asset(ticker: str, svc: RankingService = Depends(get_ranking)):
        asset, snapshot = find_asset(svc, ticker)
        return {
            "asset": asdict(asset),
            "benchmark": snapshot.benchmark,
            "total": len(snapshot.assets),
            "computed_at": snapshot.computed_at,
            "data_realtime": snapshot.data_realtime,
            "model_version": snapshot.model_version,
            "disclaimer": DISCLAIMER,
        }

    @app.post("/assets/{ticker}/explain")
    async def explain_asset(
        ticker: str,
        request: Request,
        nivel: Level = "iniciante",
        atualizar: bool = False,
        svc: RankingService = Depends(get_ranking),
    ):
        require_ai()
        asset, snapshot = find_asset(svc, ticker)
        # A última explicação de cada ativo fica guardada até alguém pedir "Atualizar": abrir a página não gasta cota.
        key = (asset.ticker, nivel)
        saved = explain_cache.get(key)
        if saved and (not atualizar or time.time() - saved[1] < REFRESH_MIN_SECONDS):
            usage.hit()
            return {
                "ticker": asset.ticker, "explanation": saved[0], "generated_at": saved[2], "cached": True,
                "disclaimer": DISCLAIMER,
            }
        ai_rate_limit(request)
        macro = await app.state.bcb.indicators()
        text = await Explainer(settings.anthropic_api_key, settings.anthropic_model, usage).explain(
            asset, snapshot, macro, LEVELS[nivel]
        )
        if len(explain_cache) > 500:
            explain_cache.clear()
        generated_at = datetime.now(timezone.utc).isoformat()
        explain_cache[key] = (text, time.time(), generated_at)
        return {
            "ticker": asset.ticker, "explanation": text, "generated_at": generated_at, "cached": False,
            "disclaimer": DISCLAIMER,
        }

    @app.post("/assets/{ticker}/swot")
    async def asset_swot(
        ticker: str,
        request: Request,
        nivel: Level = "iniciante",
        atualizar: bool = False,
        svc: RankingService = Depends(get_ranking),
    ):
        """Análise SWOT do ativo com o cenário geral. Como a explicação, fica guardada até alguém pedir "Atualizar"."""
        require_ai()
        ticker = ticker.upper()
        try:
            asset, snapshot = find_asset(svc, ticker)
            live = {"asset": asdict(asset), "total": len(snapshot.assets), "benchmark": snapshot.benchmark}
        except HTTPException:
            live = None
        history = app.state.longterm.asset(ticker) if app.state.longterm.data else None
        if live is None and history is None:
            raise HTTPException(404, f"{ticker} não está no app.")
        key = (ticker, nivel)
        saved = swot_cache.get(key)
        if saved and (not atualizar or time.time() - saved[1] < REFRESH_MIN_SECONDS):
            usage.hit()
            return {"ticker": ticker, "swot": saved[0], "generated_at": saved[2], "cached": True, "disclaimer": DISCLAIMER}
        ai_rate_limit(request)
        overview = app.state.longterm.overview() if app.state.longterm.data else None
        payload = swot_payload(
            ticker, live, history,
            [asdict(i) for i in await app.state.bcb.indicators()],
            world_markets(await app.state.market.items()),
            overview and overview.get("scenario"),
        )
        try:
            swot = await SwotAnalyst(settings.anthropic_api_key, settings.anthropic_model, usage).analyze(
                payload, LEVELS[nivel]
            )
        except ValueError as exc:
            raise HTTPException(502, str(exc)) from None
        if len(swot_cache) > 500:
            swot_cache.clear()
        generated_at = datetime.now(timezone.utc).isoformat()
        swot_cache[key] = (swot, time.time(), generated_at)
        return {"ticker": ticker, "swot": swot, "generated_at": generated_at, "cached": False, "disclaimer": DISCLAIMER}

    @app.post("/assistant/chat")
    async def chat(body: ChatRequest, request: Request, svc: RankingService = Depends(get_ranking)):
        require_ai()
        if body.messages[-1].role != "user":
            raise HTTPException(422, "A última mensagem precisa ser do usuário.")
        ai_rate_limit(request)
        assistant = Assistant(
            settings.anthropic_api_key, settings.anthropic_model, svc, app.state.bcb, app.state.longterm,
            app.state.market, usage,
        )
        result = await assistant.reply(
            [m.model_dump(include={"role", "content"}) for m in body.messages], page=body.page, level=body.level
        )
        return {**result, "disclaimer": DISCLAIMER}

    return app


app = create_app()
