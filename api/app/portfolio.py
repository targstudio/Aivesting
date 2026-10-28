"""Minha carteira: posições que a pessoa importou de prints da corretora (ou digitou) e a análise delas.

A análise é feita por regras fixas com os dados do próprio app: divisão por classe e por setor, concentração,
ranking de curto prazo e histórico de 10 anos de cada ativo, e a carteira simulada ano a ano e nas crises.
A IA só lê esta análise e explica; ela não calcula os números.
"""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .providers.brapi import logo_url_for

AssetKind = Literal[
    "acoes", "fiis", "etf", "bdr", "renda_fixa", "fundos", "internacional", "cripto", "caixa", "outros"
]
Indexer = Literal["pos", "ipca", "pre"]

CLASS_LABELS: dict[str, str] = {
    "acoes": "Ações",
    "fiis": "Fundos imobiliários",
    "etf": "ETFs",
    "bdr": "BDRs",
    "renda_fixa": "Renda fixa",
    "fundos": "Fundos de investimento",
    "internacional": "Dólar e exterior",
    "cripto": "Criptomoedas",
    "caixa": "Saldo em conta",
    "outros": "Outros",
}

TICKER_RE = re.compile(r"^[A-Z]{4}\d{1,2}[A-Z]?$")


class Holding(BaseModel):
    ticker: str | None = Field(default=None, max_length=20)
    name: str = Field(default="", max_length=120)
    asset_class: AssetKind = "outros"
    # Só para renda fixa: pós-fixado (CDI/Selic), IPCA+ ou prefixado.
    indexer: Indexer | None = None
    quantity: float | None = Field(default=None, ge=0, le=1e12)
    avg_price: float | None = Field(default=None, ge=0, le=1e9)
    price: float | None = Field(default=None, ge=0, le=1e9)
    # Saldo bruto da posição em R$ (o que aparece no print). Se faltar, vem de quantidade x preço.
    value: float | None = Field(default=None, ge=0, le=1e12)
    maturity: str | None = Field(default=None, max_length=20)

    @field_validator("ticker")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        v = (v or "").strip().upper().removesuffix(".SA")
        return v or None


class PortfolioRequest(BaseModel):
    holdings: list[Holding] = Field(max_length=300)


# Setor das ações mais negociadas da B3. Ações fora da lista aparecem como "Outros setores".
SECTORS: dict[str, str] = {
    **dict.fromkeys(["ITUB4", "ITUB3", "BBDC4", "BBDC3", "BBAS3", "SANB11", "BPAC11", "ITSA4", "ITSA3", "BRSR6",
                     "ABCB4", "BPAN4", "BMGB4", "ROXO34", "NU", "B3SA3", "BBSE3", "CXSE3", "PSSA3", "IRBR3", "CIEL3",
                     "WIZC3"], "Financeiro (bancos, bolsa e seguros)"),
    **dict.fromkeys(["PETR4", "PETR3", "PRIO3", "RECV3", "RRRP3", "BRAV3", "CSAN3", "UGPA3", "VBBR3", "RAIZ4"],
                    "Petróleo, gás e combustíveis"),
    **dict.fromkeys(["VALE3", "GGBR4", "GOAU4", "CSNA3", "USIM5", "CMIN3", "BRAP4"], "Mineração e siderurgia"),
    **dict.fromkeys(["TAEE11", "TAEE3", "TAEE4", "EQTL3", "ELET3", "ELET6", "AXIA3", "EGIE3", "CPLE6", "CPLE3",
                     "CMIG4", "CMIG3", "ENGI11", "TRPL4", "ISAE4", "NEOE3", "ALUP11", "CPFE3", "AURE3", "ENEV3",
                     "SBSP3", "CSMG3", "SAPR11"], "Energia elétrica e saneamento"),
    **dict.fromkeys(["WEGE3", "EMBR3", "RAIL3", "CCRO3", "MOTV3", "ECOR3", "RENT3", "MOVI3", "VAMO3", "POMO4",
                     "RAPT4", "TUPY3", "AZUL4", "GOLL4", "STBP3"], "Indústria, transporte e logística"),
    **dict.fromkeys(["ABEV3", "JBSS3", "MRFG3", "BRFS3", "BEEF3", "SMTO3", "SLCE3", "MDIA3", "CAML3"],
                    "Alimentos, bebidas e agro"),
    **dict.fromkeys(["LREN3", "MGLU3", "ASAI3", "CRFB3", "PCAR3", "ARZZ3", "AZZA3", "SOMA3", "PETZ3", "VIVA3",
                     "ALPA4", "CEAB3", "GUAR3"], "Varejo e consumo"),
    **dict.fromkeys(["RADL3", "HAPV3", "RDOR3", "FLRY3", "HYPE3", "QUAL3", "ODPV3"], "Saúde"),
    **dict.fromkeys(["SUZB3", "KLBN11", "DXCO3", "UNIP6", "BRKM5"], "Papel, celulose e química"),
    **dict.fromkeys(["VIVT3", "TIMS3", "TOTS3", "LWSA3", "INTB3"], "Telecom e tecnologia"),
    **dict.fromkeys(["CYRE3", "MRVE3", "EZTC3", "DIRR3", "CURY3", "MULT3", "ALOS3", "IGTI11", "JHSF3"],
                    "Construção e imóveis"),
    **dict.fromkeys(["YDUQ3", "COGN3", "SEER3", "ANIM3"], "Educação"),
}

# ETFs da B3 que não são de ações brasileiras.
ETF_FOREIGN = {"IVVB11", "SPXI11", "NASD11", "WRLD11", "ACWI11", "XINA11", "EURP11", "BBSD11", "HASH11", "QBTC11",
               "BITH11", "ETHE11", "GOLD11", "QETH11", "USDB11", "SMAC11", "TECK11"}
ETF_FIXED = {"IMAB11", "B5P211", "IB5M11", "FIXA11", "IRFM11", "LFTS11", "LFTB11", "NTNS11", "IMBB11", "DEBB11"}
ETF_FII = {"XFIX11"}

# Classes do assessor (ver advisor.CLASSES) para comparar a carteira com o plano.
ADVISOR_LABELS = {
    "reserva": "Reserva e saldo em conta",
    "rf_pos": "Renda fixa pós e prefixada",
    "rf_ipca": "Renda fixa atrelada à inflação",
    "acoes": "Ações brasileiras",
    "fiis": "Fundos imobiliários",
    "internacional": "Dólar e exterior",
    "outros": "Outros (fundos, cripto)",
}

MAX_POSITION = 0.10  # mesmo teto do assessor: nenhum ativo acima de 10% do patrimônio
MAX_SECTOR = 0.35  # alerta quando um setor passa de 35% do patrimônio
YEARS = 10


def advisor_bucket(h: Holding) -> str:
    t = h.ticker or ""
    match h.asset_class:
        case "acoes":
            return "acoes"
        case "fiis":
            return "fiis"
        case "etf":
            if t in ETF_FOREIGN:
                return "internacional"
            if t in ETF_FIXED:
                return "rf_ipca" if t in {"IMAB11", "B5P211", "IB5M11", "NTNS11", "IMBB11"} else "rf_pos"
            return "fiis" if t in ETF_FII else "acoes"
        case "bdr" | "internacional":
            return "internacional"
        case "renda_fixa":
            return "rf_ipca" if h.indexer == "ipca" else "rf_pos"
        case "caixa":
            return "reserva"
        case _:
            return "outros"


def position_value(h: Holding, live_price: float | None) -> float:
    """Valor atual: quantidade x cotação do app quando há; senão o saldo do print."""
    if live_price and h.quantity:
        return h.quantity * live_price
    if h.value is not None:
        return h.value
    if h.quantity and h.price:
        return h.quantity * h.price
    return 0.0


def _pct(v: float, digits: int = 1) -> str:
    return f"{v * 100:.{digits}f}%".replace(".", ",")


def _weighted_series(items: list[tuple[float, dict[int, float]]], years: list[int]) -> list[dict]:
    """Retorno ponderado por ano, repesando entre as posições que têm dado naquele ano."""
    out = []
    for y in years:
        pairs = [(w, s[y]) for w, s in items if y in s]
        weight = sum(w for w, _ in pairs)
        if weight <= 0:
            continue
        out.append({"year": y, "return": round(sum(w * r for w, r in pairs) / weight, 4), "coverage": round(weight, 4)})
    return out


def _cagr(series: list[dict]) -> float | None:
    if not series:
        return None
    total = 1.0
    for item in series:
        total *= 1 + item["return"]
    return round(total ** (1 / len(series)) - 1, 4)


def analyze(
    holdings: list[Holding],
    ranked: dict[str, dict] | None = None,
    live_prices: dict[str, float] | None = None,
    longterm: dict | None = None,
) -> dict:
    """`ranked` traz os ativos do ranking de 5 minutos por ticker (asdict de RankedAsset + "total");
    `live_prices`, cotações atuais de ativos fora do ranking; `longterm`, o arquivo de horizontes (api/data/longterm.json)."""
    ranked = ranked or {}
    live_prices = live_prices or {}
    lt_assets = (longterm or {}).get("assets", {})

    rows = []
    for h in holdings:
        t = h.ticker
        r = ranked.get(t) if t else None
        live = (r or {}).get("price") or (live_prices.get(t) if t else None)
        value = position_value(h, live)
        if value <= 0:
            continue
        cost = h.quantity * h.avg_price if h.quantity and h.avg_price else None
        lt = lt_assets.get(t) if t else None
        rows.append({
            "ticker": t,
            "name": h.name or (r or {}).get("name") or t or "Sem nome",
            "asset_class": h.asset_class,
            "class_label": CLASS_LABELS[h.asset_class],
            "indexer": h.indexer,
            "maturity": h.maturity,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "price": live or h.price,
            "price_source": "app" if live else "print",
            "value": round(value, 2),
            "cost": round(cost, 2) if cost else None,
            "result": round(value - cost, 2) if cost else None,
            "result_pct": round(value / cost - 1, 4) if cost else None,
            "sector": SECTORS.get(t or "", "Outros setores") if h.asset_class == "acoes" else None,
            "bucket": advisor_bucket(h),
            "logo_url": (r or {}).get("logo_url") or (logo_url_for(t) if t and TICKER_RE.match(t) else None),
            "ranking": {
                "rank": r["rank"], "total": r.get("total"), "probability": r["probability_outperform"],
                "change_percent": r.get("change_percent"),
            } if r else None,
            "risk_10y": lt["risk_10y"] if lt and lt.get("risk_10y") else None,
        })

    total = round(sum(x["value"] for x in rows), 2)
    if not total:
        return {"total": 0, "positions": [], "by_class": [], "by_sector": [], "by_bucket": [], "concentration": None,
                "risk": None, "alerts": [], "result": None}
    for x in rows:
        x["weight"] = round(x["value"] / total, 4)
    rows.sort(key=lambda x: -x["value"])

    def group(key: str, labels: dict[str, str] | None = None, only: str | None = None) -> list[dict]:
        acc: dict[str, dict] = {}
        for x in rows:
            k = x[key]
            if k is None or (only and x["asset_class"] != only):
                continue
            g = acc.setdefault(k, {"key": k, "label": (labels or {}).get(k, k), "value": 0.0, "count": 0})
            g["value"] += x["value"]
            g["count"] += 1
        return sorted(
            ({**g, "value": round(g["value"], 2), "pct": round(g["value"] / total, 4)} for g in acc.values()),
            key=lambda g: -g["value"],
        )

    by_class = group("asset_class", CLASS_LABELS)
    by_sector = group("sector", only="acoes")
    by_bucket = group("bucket", ADVISOR_LABELS)

    weights = [x["weight"] for x in rows]
    hhi = sum(w * w for w in weights)
    concentration = {
        "positions": len(rows),
        "largest": {"ticker": rows[0]["ticker"], "name": rows[0]["name"], "pct": rows[0]["weight"]},
        "top3_pct": round(sum(weights[:3]), 4),
        "hhi": round(hhi, 4),
        # Número efetivo de posições: com 10 posições iguais, 10; quanto mais concentrado, menor.
        "effective_positions": round(1 / hhi, 1),
    }

    alerts = []
    for x in rows:
        if x["weight"] > MAX_POSITION and x["bucket"] in ("acoes", "fiis", "internacional", "outros"):
            alerts.append({
                "kind": "posicao", "level": "alto" if x["weight"] > 2 * MAX_POSITION else "medio",
                "text": f"{x['ticker'] or x['name']} é {_pct(x['weight'])} da carteira, acima do teto de "
                        f"{_pct(MAX_POSITION, 0)} por ativo usado pelo assessor.",
            })
    for s in by_sector:
        if s["pct"] > MAX_SECTOR:
            alerts.append({
                "kind": "setor", "level": "medio",
                "text": f"O setor {s['label']} soma {_pct(s['pct'])} da carteira ({s['count']} ações).",
            })
    variable = sum(g["pct"] for g in by_bucket if g["key"] in ("acoes", "fiis", "internacional", "outros"))
    if not any(g["key"] in ("reserva", "rf_pos", "rf_ipca") for g in by_bucket):
        alerts.append({
            "kind": "classe", "level": "medio",
            "text": "Não há renda fixa nem saldo em conta nos prints: se a reserva de emergência está em outro lugar, "
                    "inclua para a análise ficar completa.",
        })
    if not any(g["key"] == "internacional" for g in by_bucket):
        alerts.append({"kind": "classe", "level": "baixo", "text": "Nada em dólar ou no exterior: a carteira depende só do Brasil."})

    cost_rows = [x for x in rows if x["cost"]]
    result = None
    if cost_rows:
        cost = sum(x["cost"] for x in cost_rows)
        value = sum(x["value"] for x in cost_rows)
        result = {"cost": round(cost, 2), "value": round(value, 2), "result": round(value - cost, 2),
                  "result_pct": round(value / cost - 1, 4), "covered_pct": round(value / total, 4)}

    return {
        "total": total,
        "positions": rows,
        "by_class": by_class,
        "by_sector": by_sector,
        "by_bucket": by_bucket,
        "variable_income_pct": round(variable, 4),
        "concentration": concentration,
        "alerts": alerts,
        "result": result,
        "risk": history_risk(rows, longterm) if longterm else None,
    }


def history_risk(rows: list[dict], longterm: dict) -> dict | None:
    """Como a carteira de hoje teria ido nos últimos 10 anos e nas crises, com o histórico de cada ativo.

    Renda fixa e saldo em conta entram com o CDI do ano. Ativos sem histórico no app (BDRs, ETFs, fundos,
    ações fora do universo) ficam de fora e a parte coberta aparece em `coverage`.
    """
    assets = longterm.get("assets", {})
    cdi = {a["year"]: a["return"] for a in longterm.get("cdi_annual", []) if not a.get("partial")}
    ibov = longterm.get("classes", {}).get("acoes", {})
    bench = {a["year"]: a["return"] for a in ibov.get("benchmark_annual", []) if not a.get("partial")}
    if not cdi:
        return None
    last = max(cdi)
    years = list(range(last - YEARS + 1, last + 1))

    items: list[tuple[float, dict[int, float]]] = []
    crisis_items: list[tuple[float, dict[str, float]]] = []
    covered = 0.0
    for x in rows:
        a = assets.get(x["ticker"] or "")
        if a:
            items.append((x["weight"], {r["year"]: r["return"] for r in a["annual"] if not r.get("partial")}))
            crisis_items.append((x["weight"], {c["key"]: c["return"] for c in a["crises"] if c["return"] is not None}))
            covered += x["weight"]
        elif x["bucket"] in ("reserva", "rf_pos", "rf_ipca"):
            items.append((x["weight"], cdi))
            covered += x["weight"]
    if covered <= 0:
        return None

    annual = _weighted_series(items, years)
    rets = [a["return"] for a in annual]
    mean = sum(rets) / len(rets) if rets else 0
    vol = (sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)) ** 0.5 if len(rets) > 1 else None
    bench_series = [{"year": y, "return": bench[y]} for y in years if y in bench]
    cdi_series = [{"year": y, "return": cdi[y]} for y in years if y in cdi]

    crises = []
    for c in longterm.get("crises", []):
        pairs = [(w, s[c["key"]]) for w, s in crisis_items if c["key"] in s]
        weight = sum(w for w, _ in pairs)
        if weight <= 0:
            continue
        b = next((x["return"] for x in ibov.get("benchmark_crises", []) if x["key"] == c["key"]), None)
        crises.append({"key": c["key"], "label": c["label"], "start": c["start"], "end": c["end"],
                       "return": round(sum(w * r for w, r in pairs) / weight, 4), "benchmark": b,
                       "coverage": round(weight, 4)})

    return {
        "years": years,
        "coverage": round(covered, 4),
        "annual": annual,
        "cagr": _cagr(annual),
        "volatility_annual": round(vol, 4) if vol is not None else None,
        "worst_year": min(annual, key=lambda a: a["return"]) if annual else None,
        "best_year": max(annual, key=lambda a: a["return"]) if annual else None,
        "benchmark": ibov.get("benchmark", "Ibovespa"),
        "benchmark_annual": bench_series,
        "benchmark_cagr": _cagr(bench_series),
        "cdi_annual": cdi_series,
        "cdi_cagr": _cagr(cdi_series),
        "crises": crises,
        "data_through": longterm.get("data_through"),
    }


def compare_with_plan(analysis: dict, plan: dict) -> list[dict]:
    """Quanto a carteira tem em cada classe do assessor e quanto o plano sugere, em % e em R$."""
    current = {g["key"]: g for g in analysis["by_bucket"]}
    total = analysis["total"]
    target = {a["key"]: a["pct"] / 100 for a in plan["allocation"]}
    out = []
    for key, label in ADVISOR_LABELS.items():
        cur = current.get(key, {}).get("pct", 0.0)
        tgt = target.get(key, 0.0)
        if not cur and not tgt:
            continue
        out.append({"key": key, "label": label, "current_pct": round(cur, 4), "target_pct": round(tgt, 4),
                    "diff_value": round((tgt - cur) * total, 2)})
    return out
