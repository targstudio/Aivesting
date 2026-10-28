from contextlib import asynccontextmanager
from dataclasses import asdict

from typing import Literal

import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ai.assistant import Assistant
from .ai.explain import Explainer
from .config import Settings, get_settings
from .providers.bcb import BcbClient
from .providers.brapi import BrapiProvider
from .providers.demo import DemoMacro, DemoProvider
from .ranking.service import CLASSES, RankingService
from .storage import SupabaseStore

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


DISCLAIMER = (
    "Conteúdo informativo gerado por modelo estatístico. Não é recomendação de investimento. "
    "Rentabilidade passada não garante rentabilidade futura."
)


def create_app(settings: Settings | None = None, start_scheduler: bool = True) -> FastAPI:
    settings = settings or get_settings()
    if settings.demo_mode:
        provider, bcb = DemoProvider(), DemoMacro()
    else:
        provider = BrapiProvider(settings.brapi_base_url, settings.brapi_token)
        bcb = BcbClient(settings.bcb_base_url)
    store = (
        SupabaseStore(settings.supabase_url, settings.supabase_secret_key)
        if settings.supabase_url and settings.supabase_secret_key
        else None
    )
    ranking = RankingService(settings, provider, store)

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
        allow_origins=[o.strip() for o in settings.web_origin.split(",") if o.strip()],
        allow_methods=["*"], allow_headers=["*"]
    )
    app.state.ranking = ranking
    app.state.bcb = bcb
    app.state.provider = provider

    def get_ranking() -> RankingService:
        return app.state.ranking

    ai_calls: dict[str, deque] = defaultdict(deque)

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
        }

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
    async def explain_asset(ticker: str, request: Request, svc: RankingService = Depends(get_ranking)):
        if not settings.anthropic_api_key:
            raise HTTPException(503, "ANTHROPIC_API_KEY não configurada.")
        ai_rate_limit(request)
        asset, snapshot = find_asset(svc, ticker)
        macro = await app.state.bcb.indicators()
        text = await Explainer(settings.anthropic_api_key, settings.anthropic_model).explain(
            asset, snapshot, macro
        )
        return {"ticker": asset.ticker, "explanation": text, "disclaimer": DISCLAIMER}

    @app.post("/assistant/chat")
    async def chat(body: ChatRequest, request: Request, svc: RankingService = Depends(get_ranking)):
        if not settings.anthropic_api_key:
            raise HTTPException(503, "ANTHROPIC_API_KEY não configurada.")
        if body.messages[-1].role != "user":
            raise HTTPException(422, "A última mensagem precisa ser do usuário.")
        ai_rate_limit(request)
        assistant = Assistant(settings.anthropic_api_key, settings.anthropic_model, svc, app.state.bcb)
        result = await assistant.reply([m.model_dump() for m in body.messages])
        return {**result, "disclaimer": DISCLAIMER}

    return app


app = create_app()
