"""Alertas: regras simples sobre os ativos do app, avaliadas contra o último ranking.

Os alertas ficam no navegador da pessoa (ainda não há login); a API só avalia as regras que recebe.
"""

from typing import Literal

from pydantic import BaseModel, Field

from .ranking.engine import RankedAsset

AlertKind = Literal["preco_acima", "preco_abaixo", "alta_dia", "queda_dia", "entrou_top", "prob_acima"]

KIND_LABELS = {
    "preco_acima": "Preço acima de",
    "preco_abaixo": "Preço abaixo de",
    "alta_dia": "Alta no dia de pelo menos",
    "queda_dia": "Queda no dia de pelo menos",
    "entrou_top": "Entrar no top",
    "prob_acima": "Probabilidade de superar o índice acima de",
}


class Alert(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    ticker: str = Field(min_length=4, max_length=12)
    kind: AlertKind
    # Preço em R$, variação em %, posição no ranking ou probabilidade em % (0 a 100), conforme o tipo.
    value: float


class AlertResult(BaseModel):
    id: str
    ticker: str
    triggered: bool
    available: bool
    current: float | None = None
    message: str


def _fmt(v: float) -> str:
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def describe(alert: Alert) -> str:
    v = alert.value
    if alert.kind in ("preco_acima", "preco_abaixo"):
        return f"{alert.ticker}: {KIND_LABELS[alert.kind].lower()} R$ {_fmt(v)}"
    if alert.kind == "entrou_top":
        return f"{alert.ticker}: entrar no top {int(v)} do ranking"
    return f"{alert.ticker}: {KIND_LABELS[alert.kind].lower()} {_fmt(v)}%"


def evaluate(alert: Alert, asset: RankedAsset | None) -> AlertResult:
    base = {"id": alert.id, "ticker": alert.ticker.upper()}
    if asset is None:
        return AlertResult(**base, triggered=False, available=False,
                           message=f"{alert.ticker.upper()} não está no ranking do app agora.")
    v = alert.value
    match alert.kind:
        case "preco_acima":
            current, hit = asset.price, asset.price >= v
            msg = f"{asset.ticker} está a R$ {_fmt(current)} (alerta em R$ {_fmt(v)} ou mais)."
        case "preco_abaixo":
            current, hit = asset.price, asset.price <= v
            msg = f"{asset.ticker} está a R$ {_fmt(current)} (alerta em R$ {_fmt(v)} ou menos)."
        case "alta_dia":
            current, hit = asset.change_percent, asset.change_percent >= abs(v)
            msg = f"{asset.ticker} varia {_fmt(current)}% no dia (alerta em alta de {_fmt(abs(v))}%)."
        case "queda_dia":
            current, hit = asset.change_percent, asset.change_percent <= -abs(v)
            msg = f"{asset.ticker} varia {_fmt(current)}% no dia (alerta em queda de {_fmt(abs(v))}%)."
        case "entrou_top":
            current, hit = float(asset.rank), asset.rank <= int(v)
            msg = f"{asset.ticker} está em {asset.rank}º no ranking (alerta no top {int(v)})."
        case "prob_acima":
            current = round(asset.probability_outperform * 100, 1)
            hit = current >= v
            msg = f"{asset.ticker} tem probabilidade estimada de {_fmt(current)}% (alerta acima de {_fmt(v)}%)."
    return AlertResult(**base, triggered=hit, available=True, current=current, message=msg)
