"""Ranking das ações mais indicadas por bancos e corretoras: o consenso dos analistas de cada ação, lado a lado.

Para cada uma das ações mais negociadas da B3, o app junta o placar do Yahoo Finance (quantos analistas indicam
compra, neutro ou venda) e o preço-alvo médio, via app/analysts.py. É grátis, mas tem limites, e a tela diz isso:

- o Yahoo não diz qual banco deu cada nota. Os nomes só aparecem quando uma casa muda a recomendação, e para a B3
  quase sempre vêm das ADRs (as ações brasileiras negociadas em Nova York), cobertas por bancos estrangeiros;
- não dá para separar "bancos grandes" de "casas pequenas", nem público de privado: é o consenso de quem o Yahoo
  acompanha. A lista nominal (BTG, XP, Itaú BBA, Bradesco BBI, BB Investimentos, Safra...) só existe em fontes pagas;
- fundos imobiliários quase não têm cobertura de analistas no Yahoo, então a lista é só de ações.

Ordem: a parte dos analistas que indica compra, com um ajuste para quem tem poucos analistas (3 de 3 não vale mais
que 14 de 15). Analista erra com frequência e costuma ser otimista: a lista mostra a opinião deles, não uma previsão.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from .providers.brapi import logo_url_for

log = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "consenso.json"
REFRESH_SECONDS = 12 * 3600
UNIVERSE_SIZE = 90  # as mais negociadas do curto prazo (Fundamentus), mais as do ranking principal
MIN_ANALYSTS = 3
# Preço-alvo muito longe do preço quase sempre é alvo antigo que o Yahoo não ajustou (desdobramento, grupamento,
# bonificação) ou é de poucos analistas. A tela mostra o aviso no lugar do número.
SUSPECT_UPSIDE = (-0.5, 0.8)
DISCLAIMER = (
    "Opiniões de analistas de bancos e corretoras compiladas pelo Yahoo Finance. Analistas erram com frequência, "
    "costumam ser otimistas e não conhecem o seu objetivo. A lista mostra o que eles dizem, não é recomendação de "
    "investimento."
)
COVERAGE_NOTE = (
    "O Yahoo junta as opiniões sem dizer qual banco deu cada nota. Os nomes aparecem só quando uma casa muda a "
    "recomendação, quase sempre bancos estrangeiros que cobrem a ação em Nova York. A lista casa por casa dos bancos "
    "brasileiros (BTG, XP, Itaú BBA, BB, Bradesco BBI, Safra...) só existe em serviços pagos."
)
SORTS = {
    "compra": "Mais indicadas para compra",
    "potencial": "Maior distância até o preço-alvo",
    "analistas": "Mais acompanhadas",
}


def buy_score(counts: dict) -> float:
    """Parte que indica compra, puxada para 50% quando há poucos analistas (média com 1 compra e 1 venda a mais)."""
    return (counts["compra"] + 1) / (counts["total"] + 2)


VERDICTS = {"compra": "Compra", "neutro": "Neutro", "venda": "Venda"}


def verdict(counts: dict) -> str:
    """O lado com mais votos. Empate entre compra e venda, ou do neutro com um deles, fica neutro."""
    buy, hold, sell = counts["compra"], counts["neutro"], counts["venda"]
    if buy > hold and buy > sell:
        return "compra"
    if sell > hold and sell > buy:
        return "venda"
    return "neutro"


def row(ticker: str, data: dict, names: dict[str, str], fund: dict | None) -> dict | None:
    counts = data.get("counts")
    if not counts or counts["total"] < MIN_ANALYSTS:
        return None
    fund = fund or {}
    firms = (data.get("firms") or [])[:6]
    upside = data.get("upside")
    suspect = upside is not None and not (SUSPECT_UPSIDE[0] <= upside <= SUSPECT_UPSIDE[1])
    return {
        "ticker": ticker,
        "name": names.get(ticker) or ticker,
        "logo_url": logo_url_for(ticker),
        "counts": counts,
        "verdict": verdict(counts),
        "verdict_label": VERDICTS[verdict(counts)],
        "buy_pct": round(counts["compra"] / counts["total"], 4),
        "sell_pct": round(counts["venda"] / counts["total"], 4),
        "score": round(100 * buy_score(counts)),
        "price": data.get("price"),
        "target_mean": data.get("target_mean"),
        "target_low": data.get("target_low"),
        "target_high": data.get("target_high"),
        "upside": upside,
        "target_suspect": suspect,
        # Últimas notas com nome da casa (compra, neutro ou venda), quando o Yahoo publica.
        "firms": [
            {"firm": f["firm"], "side": f["side"], "side_label": VERDICTS[f["side"]], "date": f["date"], "source": f["source"]}
            for f in firms
        ],
        "named_firms": len(data.get("firms") or []),
        "dy": fund.get("dy"),
        "p_vp": fund.get("p_vp"),
        "p_l": fund.get("p_l"),
    }


def build(results: dict[str, dict | None], names: dict[str, str] | None = None,
          fund: dict[str, dict] | None = None) -> dict:
    names, fund = names or {}, fund or {}
    rows = [r for t, d in results.items() if d and (r := row(t, d, names, fund.get(t)))]
    rows.sort(key=lambda r: (-r["score"], -r["counts"]["total"], -(-1 if r["target_suspect"] else r["upside"] or -1)))
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "checked": len(results),
        "covered": len(rows),
        "assets": rows,
    }


class ConsensusService:
    """Consulta o consenso das ações mais negociadas a cada 12 horas e guarda o ranking (com cópia em disco)."""

    def __init__(self, analysts, universe=None, names=None, fundamentals=None, path: Path | str | None = None):
        self.analysts = analysts  # AnalystService
        self.universe = universe or list  # () -> lista de tickers
        self.names = names or dict
        self.fundamentals = fundamentals or dict
        self.path = Path(path) if path else DATA_PATH
        self.raw: dict[str, dict | None] = {}
        self.snapshot: dict | None = None
        self._lock = asyncio.Lock()
        self.load()

    def _call(self, fn, default):
        try:
            return fn() or default
        except Exception:  # noqa: BLE001
            return default

    def load(self) -> None:
        if getattr(self.analysts, "demo", False):
            return
        try:
            data = json.loads(self.path.read_text())
        except (OSError, ValueError):
            return
        self.raw = data.get("raw") or {}
        self._rebuild(data.get("updated_at"))

    def save(self) -> None:
        payload = {"updated_at": self.snapshot and self.snapshot["updated_at"], "raw": self.raw}
        self.path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    def _rebuild(self, updated_at: str | None = None) -> None:
        if not self.raw:
            return
        snap = build(self.raw, self._call(self.names, {}), self._call(self.fundamentals, {}))
        if updated_at:
            snap["updated_at"] = updated_at
        self.snapshot = snap

    def _age(self) -> float:
        """Segundos desde a última consulta (a cópia em disco conta, para não refazer tudo quando o servidor acorda)."""
        try:
            then = datetime.fromisoformat(self.snapshot["updated_at"])
        except (TypeError, ValueError, KeyError):
            return float("inf")
        return (datetime.now(timezone.utc) - then).total_seconds()

    async def refresh(self, force: bool = False) -> None:
        async with self._lock:
            if not force and self.snapshot and self._age() < REFRESH_SECONDS:
                self._rebuild(self.snapshot["updated_at"])  # nomes e indicadores podem ter chegado depois
                return
            tickers = list(dict.fromkeys(t.upper() for t in self._call(self.universe, [])))
            if not tickers:
                return
            got = await asyncio.gather(*(self.analysts.get(t) for t in tickers), return_exceptions=True)
            fresh = {t: (g if isinstance(g, dict) else None) for t, g in zip(tickers, got)}
            if sum(1 for g in fresh.values() if g) < 5:
                log.warning("consenso: poucas respostas do Yahoo (%s de %s)", sum(1 for g in fresh.values() if g), len(tickers))
                if self.raw:
                    return
            # Quem falhou agora mantém a última resposta boa.
            self.raw = {t: fresh[t] or self.raw.get(t) for t in tickers}
            self._rebuild()

    def view(self, sort: str = "compra", limit: int = 30) -> dict | None:
        if not self.snapshot or not self.snapshot["assets"]:
            return None
        assets = list(self.snapshot["assets"])
        if sort == "potencial":
            assets = [a for a in assets if a["upside"] is not None and not a.get("target_suspect")]
            assets.sort(key=lambda a: -a["upside"])
        elif sort == "analistas":
            assets.sort(key=lambda a: (-a["counts"]["total"], -a["score"]))
        return {
            "sort": sort,
            "sort_label": SORTS.get(sort, sort),
            "updated_at": self.snapshot["updated_at"],
            "checked": self.snapshot["checked"],
            "covered": self.snapshot["covered"],
            "min_analysts": MIN_ANALYSTS,
            "assets": assets[:limit],
            "coverage_note": COVERAGE_NOTE,
            "disclaimer": DISCLAIMER,
            "source": "Yahoo Finance",
        }

    def get(self, ticker: str) -> dict | None:
        for a in (self.snapshot or {}).get("assets") or []:
            if a["ticker"] == ticker.upper():
                return a
        return None


def liquid_universe(trader, extra: list[str], size: int = UNIVERSE_SIZE) -> list[str]:
    """As ações mais negociadas do Fundamentus (uma por empresa: fica a mais líquida), mais a lista do ranking."""
    rows = sorted(((trader.raw or {}).get("acoes") or []), key=lambda r: -(r.get("liquidity") or 0))
    seen_company: set[str] = set()
    out: list[str] = []
    for r in rows:
        company = r["ticker"][:4]
        if company in seen_company:
            continue
        seen_company.add(company)
        out.append(r["ticker"])
        if len(out) >= size:
            break
    return list(dict.fromkeys(extra + out))
