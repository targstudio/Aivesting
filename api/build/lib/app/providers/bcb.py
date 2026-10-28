import asyncio
from dataclasses import dataclass

import httpx

# Séries do SGS (Sistema Gerenciador de Séries Temporais) do Banco Central.
SERIES = {
    "selic": (432, "Selic meta", "% a.a."),
    "ipca_12m": (13522, "IPCA acumulado em 12 meses", "%"),
    "usd_brl": (1, "Dólar comercial (venda)", "R$"),
}


@dataclass
class MacroIndicator:
    key: str
    label: str
    unit: str
    value: float
    date: str
    previous: float | None


class BcbClient:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.AsyncClient(timeout=20)

    async def _series(self, key: str) -> MacroIndicator | None:
        code, label, unit = SERIES[key]
        resp = await self.client.get(
            f"{self.base_url}/bcdata.sgs.{code}/dados/ultimos/2", params={"formato": "json"}
        )
        if resp.status_code != 200:
            return None
        points = resp.json()
        if not points:
            return None
        last = points[-1]
        prev = points[-2] if len(points) > 1 else None
        return MacroIndicator(
            key=key,
            label=label,
            unit=unit,
            value=float(last["valor"]),
            date=last["data"],
            previous=float(prev["valor"]) if prev else None,
        )

    async def indicators(self) -> list[MacroIndicator]:
        results = await asyncio.gather(
            *(self._series(k) for k in SERIES), return_exceptions=True
        )
        return [r for r in results if isinstance(r, MacroIndicator)]
