"""Curto prazo: varre todas as ações e FIIs da B3 atrás dos que parecem baratos e começam a ganhar força.

Fonte gratuita dos indicadores: as tabelas públicas do Fundamentus (resultado.php para ações e fii_resultado.php para
FIIs), que trazem P/VP, P/L, dividend yield, ROE, dívida, liquidez, vacância etc. de todos os papéis em duas páginas,
calculados a partir dos balanços entregues à CVM. É um site de terceiros, sem licença de uso comercial: serve para
testes e validação, como o Yahoo. Uma cópia fica em api/data/curto_prazo.json (GitHub Actions) e a API tenta
atualizar sozinha a cada 6 horas.

O "embalo" (como o preço vem andando) vem do histórico diário do Yahoo, só para os candidatos mais baratos.

Nada aqui é previsão: preço barato pode ficar mais barato, e no teste de 10 anos do app nenhum fator previu sozinho
quem sobe. A tela mostra os números, o risco e os alertas, e quem decide é a pessoa.
"""

import asyncio
import json
import logging
import math
import random
import re
import time
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from statistics import fmean, pstdev

import httpx

from .providers.brapi import logo_url_for

log = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "curto_prazo.json"
STOCKS_URL = "https://www.fundamentus.com.br/resultado.php"
FIIS_URL = "https://www.fundamentus.com.br/fii_resultado.php"
SOURCE = "Fundamentus (balanços entregues à CVM) e Yahoo Finance (preços). Fontes gratuitas, só para testes."
DISCLAIMER = (
    "Curto prazo é a forma mais arriscada de investir: um preço barato pode ficar mais barato, e nenhuma conta prevê "
    "quem vai subir. Esta lista é um ponto de partida para estudar, não uma recomendação de compra."
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "pt-BR,pt;q=0.9",
}
REFRESH_SECONDS = 6 * 3600
MOMENTUM_SECONDS = 30 * 60

# Só entra quem negocia pelo menos isso por dia (média de 2 meses): papel pouco negociado é difícil de vender rápido.
MIN_LIQUIDITY = {"acoes": 2_000_000, "fiis": 500_000}
# Quantos dos mais baratos recebem o histórico de preço (embalo) a cada rodada.
MOMENTUM_CANDIDATES = {"acoes": 60, "fiis": 40}
CLASSES = ("acoes", "fiis")

SIGNALS = {
    "barato_subindo": "Barato e ganhando força",
    "barato_parado": "Barato, preço de lado",
    "barato_caindo": "Barato, mas ainda caindo",
    "subindo": "Subindo, sem desconto",
    "neutro": "Sem destaque agora",
    "sem_preco": "Sem histórico de preço",
}

VIEWS = {
    "oportunidades": "Barato e ganhando força",
    "pvp": "Mais baratos pelo P/VP",
    "dividendos": "Mais dividendos",
    "todos": "Todos",
}


# ---------- Leitura das tabelas do Fundamentus ----------


def br_number(raw: str) -> float | None:
    """'1.234,56' -> 1234.56; '12,5%' -> 0.125; '-' ou vazio -> None."""
    s = (raw or "").strip().replace("\xa0", "")
    if not s or s in ("-", "--"):
        return None
    pct = s.endswith("%")
    s = s.rstrip("%").replace(".", "").replace(",", ".")
    try:
        v = float(s)
    except ValueError:
        return None
    return v / 100 if pct else v


def _key(header: str) -> str:
    """'Dív.Brut/ Patrim.' -> 'divbrutpatrim'."""
    s = unicodedata.normalize("NFKD", header).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


class _TableParser(HTMLParser):
    """Lê a primeira tabela da página: cabeçalhos e linhas como texto."""

    def __init__(self):
        super().__init__()
        self.headers: list[str] = []
        self.rows: list[list[str]] = []
        self._depth = 0
        self._done = False
        self._cell: list[str] | None = None
        self._row: list[str] | None = None
        self._in_header = False

    def handle_starttag(self, tag, attrs):
        if self._done:
            return
        if tag == "table":
            self._depth += 1
        elif self._depth and tag == "tr":
            self._row = []
        elif self._depth and tag in ("td", "th"):
            self._cell = []
            self._in_header = tag == "th"

    def handle_endtag(self, tag):
        if self._done or not self._depth:
            return
        if tag in ("td", "th") and self._cell is not None:
            text = " ".join("".join(self._cell).split())
            if self._in_header:
                self.headers.append(text)
            elif self._row is not None:
                self._row.append(text)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None
        elif tag == "table":
            self._depth -= 1
            if not self._depth:
                self._done = True

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def parse_table(html: str) -> list[dict[str, str]]:
    p = _TableParser()
    p.feed(html)
    keys = [_key(h) for h in p.headers]
    return [dict(zip(keys, row)) for row in p.rows if len(row) == len(keys)]


def _pick(row: dict[str, str], *names: str) -> str:
    for n in names:
        if n in row:
            return row[n]
    return ""


def parse_stocks(html: str) -> list[dict]:
    out = []
    for r in parse_table(html):
        ticker = _pick(r, "papel").upper()
        if not re.fullmatch(r"[A-Z0-9]{4}\d{1,2}", ticker):
            continue
        out.append({
            "ticker": ticker,
            "price": br_number(_pick(r, "cotacao")),
            "p_l": br_number(_pick(r, "pl")),
            "p_vp": br_number(_pick(r, "pvp")),
            "dy": br_number(_pick(r, "divyield", "dividendyield")),
            "ev_ebitda": br_number(_pick(r, "evebitda")),
            "net_margin": br_number(_pick(r, "mrgliq")),
            "roe": br_number(_pick(r, "roe")),
            "roic": br_number(_pick(r, "roic")),
            "liquidity": br_number(_pick(r, "liq2meses")),
            "equity": br_number(_pick(r, "patrimliq")),
            "debt_equity": br_number(_pick(r, "divbrutpatrim")),
            "revenue_growth_5y": br_number(_pick(r, "crescrec5a")),
        })
    return out


def parse_fiis(html: str) -> list[dict]:
    out = []
    for r in parse_table(html):
        ticker = _pick(r, "papel").upper()
        if not re.fullmatch(r"[A-Z0-9]{4}\d{2}[A-Z]?", ticker):
            continue
        properties = br_number(_pick(r, "qtddeimoveis"))
        out.append({
            "ticker": ticker,
            "segment": _pick(r, "segmento") or None,
            "price": br_number(_pick(r, "cotacao")),
            "p_vp": br_number(_pick(r, "pvp")),
            "dy": br_number(_pick(r, "dividendyield")),
            "ffo_yield": br_number(_pick(r, "ffoyield")),
            "market_cap": br_number(_pick(r, "valordemercado")),
            "liquidity": br_number(_pick(r, "liquidez")),
            "properties": int(properties) if properties is not None else None,
            "cap_rate": br_number(_pick(r, "caprate")),
            "vacancy": br_number(_pick(r, "vacanciamedia")),
        })
    return out


async def fetch_fundamentals(client: httpx.AsyncClient) -> dict[str, list[dict]] | None:
    """Baixa as duas tabelas. None se o site não respondeu ou mudou de formato."""
    try:
        stocks, fiis = await asyncio.gather(
            client.get(STOCKS_URL, headers=HEADERS), client.get(FIIS_URL, headers=HEADERS)
        )
    except httpx.HTTPError as exc:
        log.warning("Fundamentus fora do ar: %s", exc)
        return None
    if stocks.status_code != 200 or fiis.status_code != 200:
        log.warning("Fundamentus respondeu %s / %s", stocks.status_code, fiis.status_code)
        return None
    data = {"acoes": parse_stocks(stocks.text), "fiis": parse_fiis(fiis.text)}
    if len(data["acoes"]) < 100 or len(data["fiis"]) < 50:
        log.warning("Fundamentus com poucas linhas (%s ações, %s FIIs)", len(data["acoes"]), len(data["fiis"]))
        return None
    return data


# ---------- Embalo (preço) ----------


def momentum(closes: list[float], volumes: list[float]) -> dict | None:
    """Como o preço anda: retorno de 1 e 3 meses, distância das médias, procura recente, oscilação e queda do topo."""
    closes = [c for c in closes if c]
    if len(closes) < 45:
        return None
    sma20, sma50 = fmean(closes[-20:]), fmean(closes[-min(50, len(closes)):])
    daily = [closes[i] / closes[i - 1] - 1 for i in range(max(1, len(closes) - 63), len(closes))]
    vols = [v for v in volumes if v]
    vol_recent = fmean(vols[-5:]) if len(vols) >= 5 else None
    vol_base = fmean(vols[-63:]) if len(vols) >= 20 else None
    last = closes[-1]
    high = max(closes[-126:])
    return {
        "ret_1w": round(last / closes[-6] - 1, 4),
        "ret_1m": round(last / closes[-22] - 1, 4),
        "ret_3m": round(last / closes[-min(64, len(closes))] - 1, 4),
        "vs_avg_20d": round(last / sma20 - 1, 4),
        "vs_avg_50d": round(last / sma50 - 1, 4),
        "from_high_6m": round(last / high - 1, 4),
        "volume_ratio": round(vol_recent / vol_base, 2) if vol_recent and vol_base else None,
        "volatility": round(pstdev(daily) * math.sqrt(252), 4) if len(daily) > 10 else None,
    }


async def fetch_momentum(provider, tickers: list[str], batch: int = 10) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(tickers), batch):
        try:
            quotes = await provider.quotes(tickers[i : i + batch], history_days=180)
        except Exception:  # noqa: BLE001
            log.exception("falha ao buscar preços do curto prazo")
            continue
        for q in quotes:
            closes = [b.close for b in q.history]
            if q.price and closes:
                closes[-1] = q.price
            m = momentum(closes, [b.volume for b in q.history])
            if m:
                out[q.ticker] = m
    return out


# ---------- Notas, sinais, risco e alertas ----------


def _ranks(values: list[float | None], higher_is_better: bool) -> list[float | None]:
    """Percentil de cada valor (0 = pior, 1 = melhor) entre os que têm dado."""
    present = sorted(v for v in values if v is not None)
    n = len(present)
    if n < 2:
        return [0.5 if v is not None else None for v in values]
    out = []
    for v in values:
        if v is None:
            out.append(None)
            continue
        below = sum(1 for x in present if x < v)
        equal = sum(1 for x in present if x == v)
        pct = (below + (equal - 1) / 2) / (n - 1)
        out.append(pct if higher_is_better else 1 - pct)
    return out


def _avg(parts: list[tuple[float | None, float]]) -> float | None:
    got = [(v, w) for v, w in parts if v is not None]
    if not got:
        return None
    return sum(v * w for v, w in got) / sum(w for _, w in got)


def eligible(asset_class: str, a: dict) -> bool:
    if (a.get("liquidity") or 0) < MIN_LIQUIDITY[asset_class] or not a.get("price") or a["price"] < 1:
        return False
    if not a.get("p_vp") or a["p_vp"] <= 0:
        return False
    if asset_class == "acoes":
        # Empresa com prejuízo (P/L negativo) não entra: "barata" por estar perdendo dinheiro não é desconto.
        return a.get("p_l") is not None and a["p_l"] > 0
    return a.get("dy") is not None and a["dy"] > 0


def score_class(asset_class: str, assets: list[dict]) -> None:
    """Preenche as notas de 0 a 100 (desconto, qualidade, embalo e total) comparando cada papel com os pares."""
    if not assets:
        return
    col = lambda k, cap=None: [  # noqa: E731
        (min(a[k], cap) if cap is not None and a.get(k) is not None else a.get(k)) for a in assets
    ]
    if asset_class == "acoes":
        value = list(zip(_ranks(col("p_vp"), False), _ranks(col("p_l"), False), _ranks(col("dy", 0.15), True)))
        value_w = (0.45, 0.35, 0.2)
        quality = list(zip(
            _ranks(col("roe", 0.4), True), _ranks(col("net_margin", 0.5), True), _ranks(col("debt_equity"), False)
        ))
        quality_w = (0.45, 0.25, 0.3)
    else:
        value = list(zip(_ranks(col("p_vp"), False), _ranks(col("dy", 0.16), True)))
        value_w = (0.6, 0.4)
        quality = list(zip(_ranks(col("vacancy"), False), _ranks(col("liquidity"), True)))
        quality_w = (0.6, 0.4)
    m = [a.get("momentum") or {} for a in assets]
    trend = list(zip(
        _ranks([x.get("ret_1m") for x in m], True),
        _ranks([x.get("vs_avg_20d") for x in m], True),
        _ranks([x.get("volume_ratio") for x in m], True),
    ))
    for a, v, q, t in zip(assets, value, quality, trend):
        s_value = _avg(list(zip(v, value_w)))
        s_quality = _avg(list(zip(q, quality_w)))
        s_trend = _avg(list(zip(t, (0.4, 0.4, 0.2)))) if a.get("momentum") else None
        total = _avg([(s_value, 0.45), (s_quality, 0.2), (s_trend, 0.35)])
        a["scores"] = {
            "value": _pct(s_value), "quality": _pct(s_quality), "momentum": _pct(s_trend), "total": _pct(total),
        }
        a["signal"] = signal(a)
        a["signal_label"] = SIGNALS[a["signal"]]
        a["risk"], a["risk_label"] = risk(asset_class, a)
        a["alerts"] = alerts(asset_class, a)


def _pct(v: float | None) -> int | None:
    return None if v is None else round(v * 100)


def signal(a: dict) -> str:
    m = a.get("momentum")
    cheap = (a["scores"]["value"] or 0) >= 60
    if not m:
        return "sem_preco"
    up = m["ret_1m"] > 0 and m["vs_avg_20d"] > 0
    down = m["ret_1m"] < -0.03 and m["vs_avg_20d"] < 0
    if cheap and up:
        return "barato_subindo"
    if cheap and down:
        return "barato_caindo"
    if cheap:
        return "barato_parado"
    return "subindo" if up else "neutro"


def risk(asset_class: str, a: dict) -> tuple[str, str]:
    vol = (a.get("momentum") or {}).get("volatility")
    if vol is None:
        level = "medio" if asset_class == "fiis" else "alto"
    else:
        cut = (0.18, 0.3) if asset_class == "fiis" else (0.28, 0.45)
        level = "baixo" if vol < cut[0] else "medio" if vol < cut[1] else "alto"
    if (a.get("liquidity") or 0) < MIN_LIQUIDITY[asset_class] * 2.5 and level != "alto":
        level = "medio" if level == "baixo" else "alto"
    return level, {"baixo": "Risco menor", "medio": "Risco médio", "alto": "Risco alto"}[level]


def alerts(asset_class: str, a: dict) -> list[str]:
    """Avisos em linguagem simples do que pode estar por trás do desconto."""
    out = []
    pvp, dy, m = a.get("p_vp"), a.get("dy"), a.get("momentum") or {}
    if pvp is not None and pvp < (0.5 if asset_class == "acoes" else 0.7):
        out.append("Preço muito abaixo do patrimônio: às vezes o mercado está vendo um problema que os números ainda não mostram.")
    if dy is not None and dy > (0.15 if asset_class == "acoes" else 0.16):
        out.append("Dividendos muito altos podem ter vindo de um pagamento único, que não se repete.")
    if asset_class == "acoes":
        if (a.get("debt_equity") or 0) > 2:
            out.append("Empresa bem endividada: deve mais de duas vezes o que tem de patrimônio.")
        if a.get("revenue_growth_5y") is not None and a["revenue_growth_5y"] < 0:
            out.append("As vendas encolheram nos últimos 5 anos.")
        if a.get("p_l") is not None and a["p_l"] < 3:
            out.append("Lucro alto demais para o preço pode ter sido algo pontual (venda de um negócio, por exemplo).")
    else:
        if (a.get("vacancy") or 0) > 0.15:
            out.append("Muitos imóveis vazios: mais de 15% de vacância.")
        if a.get("properties") == 1:
            out.append("Fundo de um imóvel só: se o inquilino sair, a renda cai de uma vez.")
    if m.get("ret_1m") is not None and m["ret_1m"] < -0.15:
        out.append("Caiu mais de 15% em um mês: pode continuar caindo.")
    if m.get("ret_1m") is not None and m["ret_1m"] > 0.25:
        out.append("Subiu mais de 25% em um mês: parte do desconto pode já ter acabado.")
    if (a.get("liquidity") or 0) < MIN_LIQUIDITY[asset_class] * 2.5:
        out.append("Pouco negociado: pode demorar ou custar caro para vender.")
    return out


# ---------- Montagem do retrato ----------


def build(raw: dict[str, list[dict]], moms: dict[str, dict], names: dict[str, str] | None = None) -> dict:
    """Junta indicadores, embalo e nomes num retrato por classe, já com notas, sinais e alertas."""
    names = names or {}
    classes = {}
    for cls in CLASSES:
        rows = raw.get(cls) or []
        assets = []
        for r in rows:
            if not eligible(cls, r):
                continue
            a = dict(r)
            a["name"] = names.get(a["ticker"]) or a["ticker"]
            a["logo_url"] = logo_url_for(a["ticker"])
            a["momentum"] = moms.get(a["ticker"])
            assets.append(a)
        score_class(cls, assets)
        assets.sort(key=lambda a: -(a["scores"]["total"] or 0))
        classes[cls] = {"total_listed": len(rows), "screened": len(assets), "assets": assets}
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": SOURCE,
        "min_liquidity": MIN_LIQUIDITY,
        "classes": classes,
    }


def momentum_candidates(raw: dict[str, list[dict]]) -> list[str]:
    """Os mais baratos de cada classe (pelo desconto, sem o preço), que recebem o histórico de preço."""
    out = []
    for cls in CLASSES:
        pre = build({cls: raw.get(cls) or []}, {})["classes"][cls]["assets"]
        pre.sort(key=lambda a: -(a["scores"]["value"] or 0))
        out += [a["ticker"] for a in pre[: MOMENTUM_CANDIDATES[cls]]]
    return out


def demo_raw() -> dict[str, list[dict]]:
    """Dados sintéticos (DEMO_MODE) com o mesmo formato do Fundamentus."""
    from .config import DEFAULT_FIIS, DEFAULT_STOCKS

    extra_stocks = ["CMIG4", "CSAN3", "USIM5", "CPLE6", "TAEE11", "SANB11", "BBSE3", "CSNA3", "VIVT3", "KLBN11"]
    extra_fiis = ["HGBS11", "RBRF11", "BCFF11", "VGIR11", "RECR11", "HCTR11", "TRXF11", "PVBI11"]
    stocks, fiis = [], []
    for t in DEFAULT_STOCKS + extra_stocks:
        rng = random.Random(f"tr:{t}")
        stocks.append({
            "ticker": t, "price": round(rng.uniform(6, 80), 2), "p_l": round(rng.uniform(-3, 22), 2),
            "p_vp": round(rng.uniform(0.4, 4), 2), "dy": round(rng.uniform(0, 0.14), 4),
            "ev_ebitda": round(rng.uniform(2, 14), 2), "net_margin": round(rng.uniform(-0.05, 0.3), 4),
            "roe": round(rng.uniform(-0.05, 0.3), 4), "roic": round(rng.uniform(0, 0.25), 4),
            "liquidity": round(rng.uniform(1e6, 8e8)), "equity": round(rng.uniform(1e9, 3e11)),
            "debt_equity": round(rng.uniform(0, 2.5), 2), "revenue_growth_5y": round(rng.uniform(-0.1, 0.3), 4),
        })
    for t in DEFAULT_FIIS + extra_fiis:
        rng = random.Random(f"tr:{t}")
        fiis.append({
            "ticker": t, "segment": rng.choice(["Logística", "Shoppings", "Títulos e Val. Mob.", "Lajes Corporativas"]),
            "price": round(rng.uniform(8, 160), 2), "p_vp": round(rng.uniform(0.6, 1.2), 2),
            "dy": round(rng.uniform(0.07, 0.17), 4), "ffo_yield": round(rng.uniform(0.06, 0.14), 4),
            "market_cap": round(rng.uniform(3e8, 8e9)), "liquidity": round(rng.uniform(3e5, 1.5e7)),
            "properties": rng.choice([0, 1, 5, 12, 20]), "cap_rate": round(rng.uniform(0, 0.11), 4),
            "vacancy": round(rng.uniform(0, 0.25), 4),
        })
    return {"acoes": stocks, "fiis": fiis}


# ---------- Serviço ----------


class TraderService:
    """Guarda o retrato do curto prazo, atualiza indicadores a cada 6 horas e o embalo a cada 30 minutos."""

    def __init__(self, provider=None, path: Path | str | None = None, client: httpx.AsyncClient | None = None,
                 demo: bool = False, names=None):
        self.provider = provider
        self.path = Path(path) if path else DATA_PATH
        self.client = client or httpx.AsyncClient(timeout=30, follow_redirects=True)
        self.demo = demo
        self.names = names or dict
        self.raw: dict[str, list[dict]] | None = None
        self.fundamentals_at: str | None = None
        self.moms: dict[str, dict] = {}
        self.snapshot: dict | None = None
        self._fund_checked = 0.0
        self._mom_checked = 0.0
        self._lock = asyncio.Lock()
        self.load()

    def load(self) -> None:
        if self.demo:
            self.raw, self.fundamentals_at = demo_raw(), datetime.now(timezone.utc).isoformat(timespec="seconds")
            return
        try:
            data = json.loads(self.path.read_text())
        except (OSError, ValueError):
            return
        self.raw = data.get("raw")
        self.fundamentals_at = data.get("fundamentals_at")
        self.moms = data.get("momentum") or {}
        self._rebuild()

    def dump(self) -> dict:
        return {"fundamentals_at": self.fundamentals_at, "raw": self.raw, "momentum": self.moms}

    def save(self) -> None:
        self.path.write_text(json.dumps(self.dump(), ensure_ascii=False, separators=(",", ":")))

    def _rebuild(self) -> None:
        if not self.raw:
            return
        try:
            names = self.names() or {}
        except Exception:  # noqa: BLE001
            names = {}
        snap = build(self.raw, self.moms, names)
        snap["fundamentals_at"] = self.fundamentals_at
        self.snapshot = snap

    async def refresh(self, force: bool = False) -> None:
        """Busca indicadores (se passaram 6 h) e o embalo dos candidatos (se passaram 30 min)."""
        async with self._lock:
            now = time.monotonic()
            if not self.demo and (force or not self.raw or now - self._fund_checked > REFRESH_SECONDS):
                self._fund_checked = now
                raw = await fetch_fundamentals(self.client)
                if raw:
                    self.raw = raw
                    self.fundamentals_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            if self.raw and self.provider and (force or now - self._mom_checked > MOMENTUM_SECONDS or not self.moms):
                self._mom_checked = now
                fresh = await fetch_momentum(self.provider, momentum_candidates(self.raw))
                if fresh:
                    self.moms = {**self.moms, **fresh} if len(self.moms) < 400 else fresh
            self._rebuild()

    def fundamentals(self, ticker: str) -> dict | None:
        """Indicadores de um papel (para o card de fundamentos da tela do ativo, sem brapi paga)."""
        ticker = ticker.upper()
        for cls in CLASSES:
            for r in (self.raw or {}).get(cls) or []:
                if r["ticker"] == ticker:
                    return {"asset_class": cls, **r}
        return None

    def view(self, asset_class: str, view: str = "oportunidades", q: str = "", offset: int = 0, limit: int = 30) -> dict | None:
        if not self.snapshot or asset_class not in CLASSES:
            return None
        block = self.snapshot["classes"][asset_class]
        assets = block["assets"]
        if view == "oportunidades":
            picked = [a for a in assets if a["signal"] == "barato_subindo"]
            picked.sort(key=lambda a: -(a["scores"]["total"] or 0))
        elif view == "pvp":
            picked = sorted(assets, key=lambda a: a["p_vp"])
        elif view == "dividendos":
            picked = sorted(assets, key=lambda a: -(a.get("dy") or 0))
        else:
            picked = list(assets)
        if q:
            qn = _key(q)
            picked = [a for a in picked if qn in _key(a["ticker"]) or qn in _key(a["name"])]
        signals: dict[str, int] = {}
        for a in assets:
            signals[a["signal"]] = signals.get(a["signal"], 0) + 1
        return {
            "asset_class": asset_class,
            "view": view,
            "view_label": VIEWS.get(view, view),
            "updated_at": self.snapshot["updated_at"],
            "fundamentals_at": self.snapshot.get("fundamentals_at"),
            "source": self.snapshot["source"],
            "min_liquidity": MIN_LIQUIDITY[asset_class],
            "total_listed": block["total_listed"],
            "screened": block["screened"],
            "with_momentum": sum(1 for a in assets if a.get("momentum")),
            "signals": signals,
            "total": len(picked),
            "assets": picked[offset : offset + limit],
            "disclaimer": DISCLAIMER,
        }
