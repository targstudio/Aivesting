from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .ai.explain import Explainer
from .config import Settings, get_settings
from .providers.bcb import BcbClient
from .providers.brapi import BrapiProvider
from .providers.demo import DemoMacro, DemoProvider
from .ranking.service import CLASSES, RankingService

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
    ranking = RankingService(settings, provider)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if start_scheduler:
            await ranking.recompute(force=True)
            ranking.start()
        yield
        ranking.stop()

    app = FastAPI(title="AI.vesting API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=[settings.web_origin], allow_methods=["*"], allow_headers=["*"]
    )
    app.state.ranking = ranking
    app.state.bcb = bcb
    app.state.provider = provider

    def get_ranking() -> RankingService:
        return app.state.ranking

    @app.get("/health")
    async def health():
        return {"status": "ok", "provider": provider.name, "realtime": provider.realtime}

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
    async def recompute(svc: RankingService = Depends(get_ranking)):
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
    async def explain_asset(ticker: str, svc: RankingService = Depends(get_ranking)):
        if not settings.anthropic_api_key:
            raise HTTPException(503, "ANTHROPIC_API_KEY não configurada.")
        asset, snapshot = find_asset(svc, ticker)
        macro = await app.state.bcb.indicators()
        text = await Explainer(settings.anthropic_api_key, settings.anthropic_model).explain(
            asset, snapshot, macro
        )
        return {"ticker": asset.ticker, "explanation": text, "disclaimer": DISCLAIMER}

    return app


app = create_app()
