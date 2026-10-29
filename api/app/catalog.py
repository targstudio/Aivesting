"""Lista completa dos ativos negociados na B3 (ações, FIIs, ETFs, BDRs e units) e cotação sob demanda.

A lista vem do arquivo oficial de cotações históricas da B3 (COTAHIST diário), público e gratuito: traz todos os
papéis negociados no pregão, com o nome de pregão, a especificação (ON, PN, UNT, CI, DRN...), o fechamento e o volume.
Uma cópia fica em api/data/b3_listados.json (atualizada por GitHub Actions) e a API baixa o arquivo do dia sozinha.

A cotação de um ativo fora do ranking é buscada no provedor (Yahoo) só quando alguém abre o ativo, com cache e um
limite de chamadas: o ranking de 5 minutos continua sendo a prioridade.
"""

import asyncio
import io
import json
import logging
import re
import time
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from .providers.brapi import logo_url_for

log = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "b3_listados.json"
COTAHIST_URL = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{day:%d%m%Y}.ZIP"
SOURCE = "B3 · arquivo de cotações históricas (COTAHIST)"

TYPES = {
    "acao": "Ações",
    "fii": "FIIs",
    "etf": "ETFs e fundos",
    "bdr": "BDRs",
    "unit": "Units",
}

# Ticker da B3: 4 caracteres (BDRs podem ter número, ex.: A1MD34), 1 ou 2 dígitos e, às vezes, uma letra (F, B).
B3_TICKER_RE = re.compile(r"^[A-Z0-9]{4}\d{1,2}[A-Z]?$")

# Papel some da lista se não negociar por esse tempo (ex.: deslistado ou suspenso).
STALE_DAYS = 45


@dataclass
class Listed:
    ticker: str
    name: str
    type: str
    spec: str
    price: float
    change_percent: float | None
    volume: float
    trades: int
    date: str
    isin: str = ""


def _num(raw: str, decimals: int = 2) -> float:
    raw = raw.strip()
    return int(raw) / 10**decimals if raw.isdigit() else 0.0


def classify(codbdi: str, ticker: str, spec: str) -> str | None:
    """Tipo do papel pelo código BDI e pela especificação do COTAHIST. None = fora do escopo (direitos, recibos...)."""
    spec = spec.upper()
    if spec.startswith("DR") or ticker[-2:] in ("32", "33", "34", "35", "39"):
        return "bdr"
    if codbdi == "12":
        return "fii"
    if codbdi not in ("02", "14"):
        return None
    if spec.startswith("UNT"):
        return "unit"
    if spec.startswith("CI"):
        return "etf"
    if spec.startswith(("ON", "PN", "PNA", "PNB", "PNC", "PND", "PNE", "PNF", "PNG", "PNH")):
        return "acao"
    return None


def parse_cotahist(text: str) -> list[Listed]:
    """Lê o layout de posições fixas do COTAHIST (registro 01, mercado à vista)."""
    out: dict[str, Listed] = {}
    for line in text.splitlines():
        if len(line) < 245 or line[:2] != "01" or line[24:27] != "010":
            continue
        ticker = line[12:24].strip()
        spec = line[39:49].strip()
        kind = classify(line[10:12], ticker, spec)
        if kind is None or not ticker:
            continue
        day = line[2:10]
        out[ticker] = Listed(
            ticker=ticker,
            name=" ".join(line[27:39].split()),
            type=kind,
            spec=spec,
            price=_num(line[108:121]),
            change_percent=None,
            volume=_num(line[170:188]),
            trades=int(line[147:152].strip() or 0),
            date=f"{day[:4]}-{day[4:6]}-{day[6:]}",
            isin=line[230:242].strip(),
        )
    return list(out.values())


def merge(previous: list[Listed], latest: list[Listed]) -> list[Listed]:
    """Junta o pregão mais novo ao anterior: calcula a variação e mantém quem não negociou hoje (até STALE_DAYS)."""
    old = {a.ticker: a for a in previous}
    out = {}
    for a in latest:
        before = old.get(a.ticker)
        if before and before.date < a.date and before.price and a.price:
            a.change_percent = round((a.price / before.price - 1) * 100, 2)
        out[a.ticker] = a
    if latest:
        newest = max(a.date for a in latest)
        limit = (date.fromisoformat(newest) - timedelta(days=STALE_DAYS)).isoformat()
        for a in previous:
            if a.ticker not in out and a.date >= limit:
                out[a.ticker] = a
    return sorted(out.values(), key=lambda a: a.ticker)


def normalize(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.upper()) if unicodedata.category(c) != "Mn")


def business_days_back(start: date, n: int):
    day = start
    while n > 0:
        if day.weekday() < 5:
            yield day
            n -= 1
        day -= timedelta(days=1)


async def download_day(client: httpx.AsyncClient, day: date) -> list[Listed] | None:
    resp = await client.get(COTAHIST_URL.format(day=day))
    if resp.status_code != 200 or not resp.content.startswith(b"PK"):
        return None
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        text = zf.read(zf.namelist()[0]).decode("latin-1")
    return parse_cotahist(text) or None


async def download_latest(client: httpx.AsyncClient, today: date, days: int = 2, lookback: int = 10) -> list[list[Listed]]:
    """Os `days` pregões mais recentes com arquivo publicado (do mais antigo para o mais novo)."""
    found: list[list[Listed]] = []
    for day in business_days_back(today, lookback):
        try:
            rows = await download_day(client, day)
        except (httpx.HTTPError, zipfile.BadZipFile):
            log.warning("COTAHIST de %s indisponível", day)
            rows = None
        if rows:
            found.append(rows)
            if len(found) == days:
                break
    return list(reversed(found))


class Catalog:
    """Lista dos ativos da B3, busca e cotação sob demanda."""

    def __init__(self, path: Path | str | None = None, provider=None, client: httpx.AsyncClient | None = None,
                 quote_ttl: int = 300, quotes_per_minute: int = 30):
        self.path = Path(path) if path else DATA_PATH
        self.provider = provider  # tem `quotes(tickers, history_days)`; None = só o fechamento da B3
        self.client = client
        self.assets: dict[str, Listed] = {}
        self.trade_date: str | None = None
        self.updated_at: str | None = None
        self.source = SOURCE
        self.quote_ttl = quote_ttl
        self.quotes_per_minute = quotes_per_minute
        self._quotes: dict[str, tuple[float, dict]] = {}
        self._calls: list[float] = []
        self._lock = asyncio.Lock()
        self._sem = asyncio.Semaphore(4)
        self.load()

    # ---- Lista ----

    def load(self) -> None:
        try:
            raw = json.loads(self.path.read_text())
        except (OSError, ValueError):
            log.warning("lista da B3 não encontrada em %s", self.path)
            return
        self._set([Listed(**a) for a in raw.get("assets", [])], raw.get("updated_at"))

    def _set(self, assets: list[Listed], updated_at: str | None) -> None:
        self.assets = {a.ticker: a for a in assets}
        self.trade_date = max((a.date for a in assets), default=None)
        self.updated_at = updated_at

    def dump(self) -> dict:
        return {
            "source": self.source,
            "updated_at": self.updated_at,
            "trade_date": self.trade_date,
            "assets": [asdict(a) for a in sorted(self.assets.values(), key=lambda a: a.ticker)],
        }

    def save(self) -> None:
        self.path.write_text(json.dumps(self.dump(), ensure_ascii=False, separators=(",", ":")) + "\n")

    async def refresh(self, today: date | None = None) -> bool:
        """Baixa os dois últimos pregões da B3. Devolve False se nada novo foi encontrado."""
        today = today or datetime.now(timezone(timedelta(hours=-3))).date()
        async with self._lock:
            client = self.client or httpx.AsyncClient(timeout=60, follow_redirects=True,
                                                      headers={"User-Agent": "Mozilla/5.0"})
            try:
                days = await download_latest(client, today)
            finally:
                if self.client is None:
                    await client.aclose()
            days = [rows for rows in days if not self.trade_date or rows[0].date > self.trade_date]
            if not days:
                return False
            assets = list(self.assets.values())
            for rows in days:
                assets = merge(assets, rows)
            self._set(assets, datetime.now(timezone.utc).isoformat())
            log.info("lista da B3 atualizada: %d ativos do pregão de %s", len(self.assets), self.trade_date)
            return True

    def counts(self) -> dict[str, int]:
        out = {k: 0 for k in TYPES}
        for a in self.assets.values():
            out[a.type] += 1
        return out

    def search(self, q: str = "", kind: str | None = None, offset: int = 0, limit: int = 50) -> dict:
        query = normalize(q.strip())
        items = [a for a in self.assets.values() if not kind or a.type == kind]
        if query:
            def score(a: Listed) -> int | None:
                if a.ticker == query:
                    return 0
                if a.ticker.startswith(query):
                    return 1
                name = normalize(a.name)
                if name.startswith(query):
                    return 2
                if query in name or query in a.ticker:
                    return 3
                return None

            scored = [(s, a) for a in items if (s := score(a)) is not None]
            scored.sort(key=lambda p: (p[0], -p[1].volume))
            items = [a for _, a in scored]
        else:
            items.sort(key=lambda a: -a.volume)
        return {
            "total": len(items),
            "ativos": [self.slim(a) for a in items[offset:offset + limit]],
        }

    @staticmethod
    def slim(a: Listed) -> dict:
        return {**asdict(a), "type_label": TYPES[a.type], "logo_url": logo_url_for(a.ticker)}

    def get(self, ticker: str) -> Listed | None:
        return self.assets.get(ticker.upper().strip())

    # ---- Cotação sob demanda ----

    def _budget_ok(self) -> bool:
        now = time.monotonic()
        self._calls = [t for t in self._calls if now - t < 60]
        if len(self._calls) >= self.quotes_per_minute:
            return False
        self._calls.append(now)
        return True

    async def quote(self, ticker: str) -> dict | None:
        """Cotação com atraso do provedor (cache de 5 min). Sem provedor, sem cota ou com erro: fechamento da B3."""
        ticker = ticker.upper().strip()
        listed = self.assets.get(ticker)
        # Com a lista carregada, só busca cotação de quem está nela: protege a cota do provedor.
        if not B3_TICKER_RE.match(ticker) or (self.assets and listed is None):
            return None
        cached = self._quotes.get(ticker)
        if cached and time.monotonic() - cached[0] < self.quote_ttl:
            return cached[1]
        live = None
        if self.provider is not None and self._budget_ok():
            async with self._sem:
                try:
                    quotes = await asyncio.wait_for(self.provider.quotes([ticker], history_days=180), 12)
                    live = next((q for q in quotes if q.ticker == ticker and q.price), None)
                except Exception:  # noqa: BLE001
                    log.warning("sem cotação sob demanda para %s", ticker)
        if live is not None:
            result = {
                "ticker": ticker,
                "name": live.name if live.name != ticker else (listed.name if listed else ticker),
                "price": live.price,
                "change_percent": live.change_percent,
                "as_of": live.as_of,
                "spark": [round(b.close, 4) for b in live.history[-30:]],
                "volume": live.history[-1].volume if live.history else None,
                "source": self.provider.name,
                "live": True,
            }
        elif listed is not None:
            result = {
                "ticker": ticker, "name": listed.name, "price": listed.price,
                "change_percent": listed.change_percent, "as_of": listed.date, "spark": [],
                "volume": listed.volume, "source": "b3", "live": False,
            }
        else:
            return None
        if listed:
            result |= {"type": listed.type, "type_label": TYPES[listed.type], "spec": listed.spec}
        result["logo_url"] = logo_url_for(ticker)
        # Só a cotação do provedor entra no cache: com o fechamento da B3, a próxima visita tenta de novo.
        if live is not None:
            if len(self._quotes) > 2000:
                self._quotes.clear()
            self._quotes[ticker] = (time.monotonic(), result)
        return result
