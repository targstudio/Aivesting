"""Baixa os últimos pregões do arquivo COTAHIST da B3 e grava a lista completa em data/b3_listados.json.

Uso: python scripts/fetch_b3_list.py  (roda no GitHub Actions todo dia útil; a API também se atualiza sozinha)."""

import asyncio
import sys

from app.catalog import Catalog


async def main() -> int:
    catalog = Catalog()
    changed = await catalog.refresh()
    if not catalog.assets:
        print("Não consegui baixar a lista da B3.", file=sys.stderr)
        return 1
    if changed:
        catalog.save()
    print(f"{len(catalog.assets)} ativos, pregão de {catalog.trade_date}: {catalog.counts()}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
