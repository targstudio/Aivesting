import logging
from datetime import datetime, time
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from ..config import Settings
from ..providers.base import MarketDataProvider
from .engine import RankingSnapshot, rank_assets

log = logging.getLogger(__name__)
SAO_PAULO = ZoneInfo("America/Sao_Paulo")

CLASSES = {
    "acoes": "Ibovespa",
    "fiis": "IFIX",
}


def market_is_open(settings: Settings, now: datetime | None = None) -> bool:
    now = (now or datetime.now(SAO_PAULO)).astimezone(SAO_PAULO)
    if now.weekday() >= 5:
        return False
    open_ = time.fromisoformat(settings.market_open)
    close = time.fromisoformat(settings.market_close)
    return open_ <= now.time() <= close


class RankingService:
    """Guarda o último ranking de cada classe e o recalcula a cada N minutos durante o pregão."""

    def __init__(self, settings: Settings, provider: MarketDataProvider):
        self.settings = settings
        self.provider = provider
        self.snapshots: dict[str, RankingSnapshot] = {}
        self.scheduler: AsyncIOScheduler | None = None

    def universe(self, asset_class: str) -> list[str]:
        return self.settings.stocks if asset_class == "acoes" else self.settings.fiis

    async def recompute(self, force: bool = False) -> None:
        if not force and not self.settings.run_outside_market_hours and not market_is_open(self.settings):
            return
        for asset_class, benchmark in CLASSES.items():
            try:
                quotes = await self.provider.quotes(self.universe(asset_class))
                self.snapshots[asset_class] = rank_assets(
                    quotes, asset_class, benchmark, data_realtime=self.provider.realtime
                )
            except Exception:
                log.exception("falha ao recalcular ranking de %s", asset_class)

    def start(self) -> None:
        self.scheduler = AsyncIOScheduler(timezone=SAO_PAULO)
        self.scheduler.add_job(
            self.recompute, "interval", minutes=self.settings.ranking_interval_minutes, id="ranking"
        )
        self.scheduler.start()

    def stop(self) -> None:
        if self.scheduler:
            self.scheduler.shutdown(wait=False)
