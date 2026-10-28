from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime

from typing import Literal

import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .advisor import QUESTIONS, PlanRequest, build_plan
from .ai.advisor_ai import EXPLAIN_TASK, advisor_system
from .ai.assistant import Assistant
from .ai.explain import Explainer
from .ai.insights import LEVELS, Insights, valid_context
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
from .storage import SupabaseStore

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
    explain_cache: dict[tuple, str] = {}

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
            system=advisor_system(body.plan, LEVELS[body.level]),
        )
        return {**result, "disclaimer": ADVISOR_DISCLAIMER}

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
    async def ai_reading(request: Request, contexto: str, nivel: Level = "iniciante"):
        """Leitura da IA para uma tela: inicio, mercado, macro, ranking:acoes, horizontes:fiis:5..."""
        if not valid_context(contexto):
            raise HTTPException(404, "Contexto desconhecido.")
        require_ai()
        cached = app.state.insights.cached(contexto, nivel)
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
        ticker: str, request: Request, nivel: Level = "iniciante", svc: RankingService = Depends(get_ranking)
    ):
        require_ai()
        asset, snapshot = find_asset(svc, ticker)
        # Mesma explicação enquanto o ranking não for recalculado: abrir a página de novo não gasta cota.
        key = (asset.ticker, nivel, snapshot.computed_at)
        if key in explain_cache:
            usage.hit()
            return {"ticker": asset.ticker, "explanation": explain_cache[key], "disclaimer": DISCLAIMER}
        ai_rate_limit(request)
        macro = await app.state.bcb.indicators()
        text = await Explainer(settings.anthropic_api_key, settings.anthropic_model, usage).explain(
            asset, snapshot, macro, LEVELS[nivel]
        )
        if len(explain_cache) > 500:
            explain_cache.clear()
        explain_cache[key] = text
        return {"ticker": asset.ticker, "explanation": text, "disclaimer": DISCLAIMER}

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
