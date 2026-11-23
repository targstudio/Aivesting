"""Radar de setups: varre as ações mais negociadas da B3 no gráfico diário e mostra onde cada setup apareceu, além de
uma lista de candidatas para day trade (as mais líquidas e com maior amplitude diária)."""

import asyncio
import logging
import time
from datetime import datetime, timezone

from .data import INTERVALS, CandleSource
from .indicators import atr, sma
from .setups import SETUPS, analyze

log = logging.getLogger(__name__)

VIEWS = ("setups", "alta", "baixa", "day_trade")
MIN_DAY_TRADE_VOLUME = 20_000_000  # R$ por dia: abaixo disso o spread e o escorregamento comem o day trade


class TradingService:
    def __init__(self, source: CandleSource, universe):
        self.source = source
        self.universe = universe  # função que devolve a lista de tickers
        self.snapshot: dict | None = None
        self.updated = 0.0
        self.lock = asyncio.Lock()

    async def refresh(self, max_age: float = 15 * 60) -> None:
        if self.snapshot and time.time() - self.updated < max_age:
            return
        async with self.lock:
            tickers = list(dict.fromkeys(self.universe()))[:120]
            sem = asyncio.Semaphore(8)

            async def one(t: str):
                async with sem:
                    try:
                        data = await self.source.get(t, "1d", "1y")
                    except Exception:  # noqa: BLE001
                        log.exception("radar: falha em %s", t)
                        return None
                    return row(data) if data and len(data["candles"]) >= 60 else None

            rows = [r for r in await asyncio.gather(*(one(t) for t in tickers)) if r]
            if rows:
                self.snapshot = {"updated_at": datetime.now(timezone.utc).isoformat(), "rows": rows}
                self.updated = time.time()

    def view(self, visao: str, setup: str | None = None) -> dict | None:
        if not self.snapshot:
            return None
        rows = self.snapshot["rows"]
        if visao == "day_trade":
            picked = [r for r in rows if (r["volume_financeiro"] or 0) >= MIN_DAY_TRADE_VOLUME and r["atr_pct"]]
            picked.sort(key=lambda r: -(r["atr_pct"] or 0) * min(1.0, (r["volume_financeiro"] or 0) / 2e8) ** 0.25)
        else:
            picked = [r for r in rows if r["setups"]]
            if setup:
                picked = [r for r in picked if any(s["key"] == setup for s in r["setups"])]
            if visao in ("alta", "baixa"):
                picked = [r for r in picked if any(s["direction"] == visao for s in r["setups"])]
            picked.sort(key=lambda r: (-len(r["setups"]), -(r["volume_relativo"] or 0)))
        counts: dict[str, int] = {}
        for r in rows:
            for s in r["setups"]:
                counts[s["key"]] = counts.get(s["key"], 0) + 1
        return {
            "updated_at": self.snapshot["updated_at"],
            "visao": visao,
            "varridos": len(rows),
            "contagem_setups": [{"key": k, "label": SETUPS[k][0], "direction": SETUPS[k][1], "total": v}
                                for k, v in sorted(counts.items(), key=lambda kv: -kv[1])],
            "ativos": picked[:60],
            "fonte": "Gráfico diário do Yahoo Finance (cerca de 15 min de atraso), ações mais negociadas da B3.",
            "aviso": "Setups são padrões gráficos com regras fixas, não recomendação. Teste a regra antes de operar e "
                     "use stop.",
        }


def row(data: dict) -> dict:
    a = analyze(data, intraday=False)
    candles = data["candles"]
    fin = sma([c.c * c.v for c in candles], 20)[-1]
    at = atr(candles)[-1]
    last = candles[-1]
    return {
        "ticker": a["ticker"],
        "name": a["name"],
        "price": a["price"],
        "change_percent": a["change_percent"],
        "trend": a["trend"]["label"],
        "ifr14": a["indicators"]["ifr14"],
        "ifr2": a["indicators"]["ifr2"],
        "atr_pct": round(at / last.c * 100, 2) if at else None,
        "volume_financeiro": round(fin) if fin else None,
        "volume_relativo": a["indicators"]["volume_relativo"],
        "gap_pct": round((last.o / candles[-2].c - 1) * 100, 2),
        "setups": [{"key": s["key"], "label": s["label"], "direction": s["direction"]} for s in a["setups"]],
        "spark": [round(c.c, 2) for c in candles[-30:]],
    }


__all__ = ["TradingService", "VIEWS", "INTERVALS"]
