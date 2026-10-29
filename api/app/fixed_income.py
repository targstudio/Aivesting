"""Taxas de renda fixa para o simulador: Selic, CDI e IPCA do Banco Central e os títulos do Tesouro Direto.

Os títulos vêm do arquivo público de preços e taxas do Tesouro Transparente (CSV com todo o histórico, alguns MB).
O arquivo é lido em streaming e só a última data base fica guardada, com cache de 12 horas. Se a fonte falhar, o
simulador continua funcionando com as taxas que a pessoa digitar.
"""

import time
from datetime import date, datetime

import httpx

TESOURO_CSV = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv"
)
CACHE_SECONDS = 12 * 3600
# O CDI anda colado na Selic meta, cerca de 0,10 ponto abaixo.
CDI_SPREAD = 0.10

KIND = {
    "Tesouro Selic": "selic",
    "Tesouro Prefixado": "prefixado",
    "Tesouro Prefixado com Juros Semestrais": "prefixado",
    "Tesouro IPCA+": "ipca",
    "Tesouro IPCA+ com Juros Semestrais": "ipca",
    "Tesouro Educa+": "ipca",
    "Tesouro Renda+ Aposentadoria Extra": "ipca",
}


def _num(v: str) -> float | None:
    v = v.strip().replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


def _date(v: str) -> date | None:
    try:
        return datetime.strptime(v.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def parse_tesouro(lines) -> tuple[date | None, list[dict]]:
    """Linhas do CSV (cabeçalho incluído) → data base mais recente e os títulos à venda nela."""
    header = None
    latest: date | None = None
    rows: list[dict] = []
    for line in lines:
        cols = line.rstrip("\r\n").split(";")
        if header is None:
            header = [c.strip() for c in cols]
            continue
        if len(cols) < len(header):
            continue
        rec = dict(zip(header, cols))
        base = _date(rec.get("Data Base", ""))
        if base is None or (latest and base < latest):
            continue
        rate = _num(rec.get("Taxa Compra Manha", ""))
        name = rec.get("Tipo Titulo", "").strip()
        maturity = _date(rec.get("Data Vencimento", ""))
        if not rate or not maturity or maturity <= base:
            continue
        if latest is None or base > latest:
            latest, rows = base, []
        rows.append({
            "title": name,
            "kind": KIND.get(name, "outro"),
            "maturity": maturity.isoformat(),
            "rate": rate,
            "unit_price": _num(rec.get("PU Compra Manha", "")),
        })
    rows.sort(key=lambda r: (r["title"], r["maturity"]))
    return latest, rows


class TesouroService:
    def __init__(self, url: str | None = TESOURO_CSV, client: httpx.AsyncClient | None = None):
        # url None = modo demonstração (títulos fixos).
        self.url = url
        self.client = client
        self._at = 0.0
        self._data: tuple[date | None, list[dict]] | None = None

    async def bonds(self) -> tuple[date | None, list[dict]]:
        if self._data and time.monotonic() - self._at < CACHE_SECONDS:
            return self._data
        if self.url is None:
            self._data = demo_bonds()
        else:
            try:
                client = self.client or httpx.AsyncClient(timeout=60, follow_redirects=True)
                async with client.stream("GET", self.url) as resp:
                    resp.raise_for_status()
                    lines = []
                    async for line in resp.aiter_lines():
                        lines.append(line)
                    self._data = parse_tesouro(lines)
            except Exception:  # noqa: BLE001
                # Mantém a última leitura boa; sem nenhuma, devolve vazio e tenta de novo na próxima.
                return self._data or (None, [])
        self._at = time.monotonic()
        return self._data


def demo_bonds() -> tuple[date, list[dict]]:
    today = date.today()
    y = today.year
    return today, [
        {"title": "Tesouro Selic", "kind": "selic", "maturity": f"{y + 3}-03-01", "rate": 0.06, "unit_price": None},
        {"title": "Tesouro Prefixado", "kind": "prefixado", "maturity": f"{y + 2}-01-01", "rate": 13.4, "unit_price": None},
        {"title": "Tesouro Prefixado", "kind": "prefixado", "maturity": f"{y + 6}-01-01", "rate": 13.9, "unit_price": None},
        {"title": "Tesouro IPCA+", "kind": "ipca", "maturity": f"{y + 3}-05-15", "rate": 7.6, "unit_price": None},
        {"title": "Tesouro IPCA+", "kind": "ipca", "maturity": f"{y + 9}-05-15", "rate": 7.2, "unit_price": None},
    ]


def rates_payload(macro: dict[str, float], base: date | None, bonds: list[dict]) -> dict:
    selic = macro.get("selic")
    return {
        "selic": selic,
        "cdi": round(selic - CDI_SPREAD, 2) if selic is not None else None,
        "ipca_12m": macro.get("ipca_12m"),
        "tesouro_date": base.isoformat() if base else None,
        "tesouro": bonds,
        "source": "Banco Central (Selic e IPCA) e Tesouro Transparente (títulos do Tesouro Direto)",
    }
