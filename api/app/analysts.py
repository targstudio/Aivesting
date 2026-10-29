"""O que os analistas de bancos e corretoras dizem de cada ação: compra, neutro ou venda, e o preço-alvo médio.

Fonte gratuita: Yahoo Finance (módulos `recommendationTrend`, `financialData` e `upgradeDowngradeHistory`), só para
testes, como as cotações. O Yahoo dá a contagem de recomendações e o preço-alvo médio sem dizer quem é quem. Os nomes
das casas só aparecem quando ela muda a recomendação de uma ação, e para a B3 isso quase sempre vem das ADRs (as
ações das empresas brasileiras negociadas em Nova York), cobertas por bancos estrangeiros e alguns brasileiros.

A lista completa casa por casa (BTG, XP, Itaú BBA, Safra...) só existe em fontes pagas (LSEG, Bloomberg, FactSet) ou
nos relatórios de cada corretora, que não podem ser copiados.
"""

import asyncio
import random
import time
from datetime import datetime, timedelta, timezone

import httpx

CACHE_SECONDS = 12 * 3600
FIRM_MAX_AGE_DAYS = 540  # recomendação nominal mais velha que ~18 meses já não diz muito
DISCLAIMER = (
    "Opiniões de analistas de bancos e corretoras compiladas pelo Yahoo Finance. Analistas erram com frequência, e "
    "estas opiniões não levam em conta o seu objetivo. Não é recomendação de investimento."
)

# Ações da B3 com ADR em Nova York: os bancos que cobrem a ADR costumam ter o mesmo nome publicado no Yahoo.
ADR = {
    "PETR3": "PBR", "PETR4": "PBR", "VALE3": "VALE", "ITUB3": "ITUB", "ITUB4": "ITUB", "BBDC3": "BBD",
    "BBDC4": "BBD", "ABEV3": "ABEV", "SBSP3": "SBS", "GGBR4": "GGB", "CSNA3": "SID", "ELET3": "EBR",
    "ELET6": "EBR", "EMBJ3": "EMBJ", "EMBR3": "EMBJ", "SUZB3": "SUZ", "CMIG4": "CIG", "UGPA3": "UGP",
    "TIMS3": "TIMB", "VIVT3": "VIV", "CPLE6": "ELP", "CPLE3": "ELP", "SANB11": "BSBR", "BRFS3": "BRFS",
    "BRKM5": "BAK", "PBRA3": "PBR",
}

BUY = {"buy", "strong buy", "outperform", "overweight", "market outperform", "sector outperform", "accumulate",
       "positive", "add", "top pick", "conviction buy", "long-term buy", "speculative buy", "moderate buy"}
HOLD = {"hold", "neutral", "equal-weight", "equal weight", "market perform", "sector perform", "peer perform",
        "in-line", "in line", "sector weight", "perform", "mixed", "fair value", "moderate"}
SELL = {"sell", "strong sell", "underperform", "underweight", "market underperform", "sector underperform",
        "reduce", "negative", "moderate sell"}


def grade_side(grade: str | None) -> str | None:
    """Traduz a nota em inglês da casa para compra, neutro ou venda."""
    g = (grade or "").strip().lower()
    if g in BUY:
        return "compra"
    if g in HOLD:
        return "neutro"
    if g in SELL:
        return "venda"
    return None


def _raw(v) -> float | None:
    """O Yahoo manda números como {"raw": 1.2, "fmt": "1,20"} ou direto."""
    if isinstance(v, dict):
        v = v.get("raw")
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def parse_counts(trend: dict) -> dict | None:
    """Contagem do mês atual (ou do anterior, se o atual vier vazio): compra, neutro e venda."""
    periods = {p.get("period"): p for p in (trend.get("trend") or [])}
    for key in ("0m", "-1m"):
        p = periods.get(key)
        if not p:
            continue
        buy = int(_raw(p.get("strongBuy")) or 0) + int(_raw(p.get("buy")) or 0)
        hold = int(_raw(p.get("hold")) or 0)
        sell = int(_raw(p.get("sell")) or 0) + int(_raw(p.get("strongSell")) or 0)
        if buy + hold + sell:
            return {"compra": buy, "neutro": hold, "venda": sell, "total": buy + hold + sell}
    return None


def parse_firms(history: dict, source: str, now: datetime | None = None) -> list[dict]:
    """Última recomendação de cada casa, só as que deram nota nos últimos ~18 meses."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=FIRM_MAX_AGE_DAYS)
    latest: dict[str, dict] = {}
    for h in history.get("history") or []:
        firm, ts = (h.get("firm") or "").strip(), _raw(h.get("epochGradeDate"))
        if not firm or not ts:
            continue
        when = datetime.fromtimestamp(ts, tz=timezone.utc)
        side = grade_side(h.get("toGrade"))
        if when < cutoff or side is None:
            continue
        if firm not in latest or when > latest[firm]["_when"]:
            latest[firm] = {
                "firm": firm,
                "side": side,
                "grade": h.get("toGrade"),
                "previous_side": grade_side(h.get("fromGrade")),
                "date": when.date().isoformat(),
                "source": source,
                "_when": when,
            }
    rows = sorted(latest.values(), key=lambda r: r["_when"], reverse=True)
    return [{k: v for k, v in r.items() if k != "_when"} for r in rows[:25]]


def parse_targets(fin: dict) -> dict:
    price, mean = _raw(fin.get("currentPrice")), _raw(fin.get("targetMeanPrice"))
    return {
        "price": price,
        "target_mean": mean,
        "target_high": _raw(fin.get("targetHighPrice")),
        "target_low": _raw(fin.get("targetLowPrice")),
        "upside": round(mean / price - 1, 4) if mean and price else None,
        "analysts": int(_raw(fin.get("numberOfAnalystOpinions")) or 0) or None,
    }


def build(ticker: str, local: dict, adr_symbol: str | None, adr: dict | None, now: datetime | None = None) -> dict | None:
    counts = parse_counts(local.get("recommendationTrend") or {})
    targets = parse_targets(local.get("financialData") or {})
    firms = parse_firms(local.get("upgradeDowngradeHistory") or {}, "B3", now)
    seen = {f["firm"] for f in firms}
    if adr_symbol and adr:
        firms += [f for f in parse_firms(adr.get("upgradeDowngradeHistory") or {}, f"ADR {adr_symbol}", now) if f["firm"] not in seen]
        firms.sort(key=lambda f: f["date"], reverse=True)
    if not counts and not firms and not targets["target_mean"]:
        return None
    return {
        "ticker": ticker,
        "counts": counts,
        **targets,
        "firms": firms,
        "adr": adr_symbol,
        "as_of": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "source": "Yahoo Finance",
    }


def demo_analysts(ticker: str) -> dict | None:
    if ticker.endswith("11"):
        return None
    rng = random.Random(f"analysts:{ticker}")
    buy, hold, sell = rng.randint(2, 9), rng.randint(1, 6), rng.randint(0, 2)
    price = rng.uniform(8, 120)
    mean = price * rng.uniform(0.9, 1.35)
    today = datetime.now(timezone.utc).date()
    firms = [
        {"firm": f"Banco exemplo {c}", "side": s, "grade": g, "previous_side": None,
         "date": (today - timedelta(days=rng.randint(5, 300))).isoformat(), "source": "B3"}
        for c, s, g in (("A", "compra", "Buy"), ("B", "neutro", "Hold"), ("C", "compra", "Outperform"))
    ]
    return {
        "ticker": ticker,
        "counts": {"compra": buy, "neutro": hold, "venda": sell, "total": buy + hold + sell},
        "price": round(price, 2),
        "target_mean": round(mean, 2),
        "target_high": round(mean * 1.25, 2),
        "target_low": round(mean * 0.75, 2),
        "upside": round(mean / price - 1, 4),
        "analysts": buy + hold + sell,
        "firms": sorted(firms, key=lambda f: f["date"], reverse=True),
        "adr": None,
        "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "demonstração",
    }


class AnalystService:
    """Busca e guarda por 12 horas o consenso dos analistas. O Yahoo exige cookie e "crumb" nesse endpoint."""

    def __init__(self, demo: bool = False, client: httpx.AsyncClient | None = None,
                 base_url: str = "https://query2.finance.yahoo.com"):
        self.demo = demo
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.AsyncClient(
            timeout=20, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"},
        )
        self._crumb: str | None = None
        self._crumb_lock = asyncio.Lock()
        self._cache: dict[str, tuple[float, dict | None]] = {}
        self._sem = asyncio.Semaphore(4)

    async def _get_crumb(self, refresh: bool = False) -> str | None:
        async with self._crumb_lock:
            if self._crumb and not refresh:
                return self._crumb
            try:
                await self.client.get("https://fc.yahoo.com")  # só para receber o cookie; responde 404
            except httpx.HTTPError:
                pass
            try:
                resp = await self.client.get(f"{self.base_url}/v1/test/getcrumb")
                crumb = resp.text.strip() if resp.status_code == 200 else ""
            except httpx.HTTPError:
                crumb = ""
            self._crumb = crumb if crumb and "<" not in crumb and len(crumb) < 40 else None
            return self._crumb

    async def _summary(self, symbol: str, modules: str) -> dict | None:
        for attempt in range(2):
            crumb = await self._get_crumb(refresh=attempt > 0)
            params = {"modules": modules, **({"crumb": crumb} if crumb else {})}
            try:
                resp = await self.client.get(f"{self.base_url}/v10/finance/quoteSummary/{symbol}", params=params)
            except httpx.HTTPError:
                return None
            if resp.status_code in (401, 403) and attempt == 0:
                continue
            if resp.status_code != 200:
                return None
            results = (resp.json().get("quoteSummary") or {}).get("result") or []
            return results[0] if results else None
        return None

    async def get(self, ticker: str) -> dict | None:
        ticker = ticker.upper()
        if self.demo:
            return demo_analysts(ticker)
        hit = self._cache.get(ticker)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
        adr_symbol = ADR.get(ticker)
        async with self._sem:
            local, adr = await asyncio.gather(
                self._summary(f"{ticker}.SA", "recommendationTrend,financialData,upgradeDowngradeHistory"),
                self._summary(adr_symbol, "upgradeDowngradeHistory") if adr_symbol else asyncio.sleep(0),
            )
        result = build(ticker, local or {}, adr_symbol, adr) if (local or adr) else None
        if len(self._cache) > 2000:
            self._cache.clear()
        # Sem dados (ou falha de rede): tenta de novo em 30 minutos, não em 12 horas.
        self._cache[ticker] = (time.time() if result else time.time() - CACHE_SECONDS + 1800, result)
        return result
