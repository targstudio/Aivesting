"""Consulta no Yahoo o consenso dos analistas (compra, neutro, venda e preço-alvo) das ações mais negociadas e grava em
data/consenso.json, a cópia inicial do ranking "Indicadas pelos bancos" (a API também se atualiza a cada 12 horas).

Uso: python scripts/fetch_consensus.py  (roda no GitHub Actions todo dia útil, depois do curto prazo)."""

import asyncio
import sys

from app.analysts import AnalystService
from app.catalog import Catalog
from app.config import DEFAULT_STOCKS
from app.consensus import ConsensusService, liquid_universe
from app.trader import TraderService


async def main() -> int:
    catalog = Catalog()
    trader = TraderService()  # lê data/curto_prazo.json, que traz a liquidez de todas as ações
    service = ConsensusService(
        AnalystService(),
        universe=lambda: liquid_universe(trader, list(DEFAULT_STOCKS)),
        names=lambda: {t: a.name for t, a in catalog.assets.items()},
        fundamentals=trader.ranking_fundamentals,
    )
    service.raw, service.snapshot = {}, None
    await service.refresh(force=True)
    if not service.snapshot or service.snapshot["covered"] < 5:
        print("Não consegui as opiniões dos analistas no Yahoo.", file=sys.stderr)
        return 1
    service.save()
    snap = service.snapshot
    print(f"{snap['checked']} ações consultadas, {snap['covered']} com {3}+ analistas")
    for a in snap["assets"][:10]:
        c = a["counts"]
        print(f"  {a['rank']:>2} {a['ticker']:7} {a['verdict_label']:7} {c['compra']}/{c['neutro']}/{c['venda']}  alvo {a['upside']}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
