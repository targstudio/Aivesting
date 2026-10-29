"""Baixa os indicadores de todas as ações e FIIs (Fundamentus) e o embalo dos mais baratos (Yahoo) e grava em
data/curto_prazo.json, a cópia inicial da tela Curto prazo (a API também se atualiza sozinha).

Uso: python scripts/fetch_trader.py  (roda no GitHub Actions todo dia útil depois do pregão)."""

import asyncio
import sys

from app.catalog import Catalog
from app.providers.yahoo import YahooProvider
from app.trader import TraderService


async def main() -> int:
    catalog = Catalog()
    trader = TraderService(provider=YahooProvider(), names=lambda: {t: a.name for t, a in catalog.assets.items()})
    trader.raw, trader.snapshot, trader.moms = None, None, {}
    await trader.refresh(force=True)
    if not trader.raw or not trader.snapshot:
        print("Não consegui baixar os indicadores do Fundamentus.", file=sys.stderr)
        return 1
    trader.save()
    for cls, block in trader.snapshot["classes"].items():
        with_m = sum(1 for a in block["assets"] if a.get("momentum"))
        print(f"{cls}: {block['total_listed']} listados, {block['screened']} na varredura, {with_m} com embalo")
        for a in block["assets"][:5]:
            print(f"  {a['ticker']:8} P/VP {a['p_vp']}  nota {a['scores']['total']}  {a['signal_label']}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
