"""Baixa o histórico mensal de longo prazo usado pelo modelo de horizontes (1, 3, 5 e 10 anos).

Fontes: Yahoo Finance (preço ajustado por proventos, desde o início disponível de cada ativo) e SGS do
Banco Central (CDI, Selic e IPCA). Grava `data/history.json`. Roda no GitHub Actions
(.github/workflows/calibrate.yml), porque o ambiente de desenvolvimento não alcança essas fontes.

Uso: python scripts/fetch_history.py [--out data/history.json]

O Yahoo não permite uso comercial: este arquivo serve para validar o modelo. Para lançar, troque a fonte
por uma licenciada.
"""

import argparse
import json
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DEFAULT_FIIS, DEFAULT_STOCKS  # noqa: E402

YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]
BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados"

BENCHMARKS = {"acoes": ("^BVSP", "Ibovespa"), "fiis": ("IFIX.SA", "IFIX")}
# Séries mensais do SGS. CDI vem em % no mês; Selic, em % a.a.; IPCA, acumulado em 12 meses.
BCB_SERIES = {"cdi": 4391, "selic": 4189, "ipca_12m": 13522}
# Contexto global (Yahoo): dólar, bolsa americana e juro de 10 anos dos EUA.
GLOBAL = {"usd_brl": "BRL=X", "sp500": "^GSPC", "us10y": "^TNX"}

START_YEAR = 2000


def get(client: httpx.Client, url: str, params: dict) -> httpx.Response | None:
    for attempt in range(4):
        try:
            resp = client.get(url, params=params)
        except httpx.HTTPError:
            resp = None
        if resp is not None and resp.status_code == 200:
            return resp
        if resp is not None and resp.status_code == 404:
            return None
        time.sleep(2 ** (attempt + 1))
    return None


def yahoo_monthly(client: httpx.Client, symbol: str) -> tuple[str | None, dict[str, float]]:
    """Fechamento mensal ajustado (proventos e desdobramentos) por mês "AAAA-MM"."""
    for host in YAHOO_HOSTS:
        resp = get(
            client,
            f"{host}/v8/finance/chart/{symbol}",
            {"range": "max", "interval": "1mo", "events": "div,split"},
        )
        if resp is None:
            continue
        result = ((resp.json().get("chart") or {}).get("result") or [None])[0]
        if not result:
            continue
        meta = result.get("meta") or {}
        indicators = result.get("indicators") or {}
        adj = ((indicators.get("adjclose") or [{}])[0]).get("adjclose")
        closes = adj or ((indicators.get("quote") or [{}])[0]).get("close") or []
        series: dict[str, float] = {}
        for ts, close in zip(result.get("timestamp") or [], closes):
            if close is None or close <= 0:
                continue
            # O Yahoo marca a barra mensal no primeiro pregão do mês; o fechamento é o do fim do mês.
            month = datetime.fromtimestamp(ts + 12 * 3600, tz=timezone.utc).strftime("%Y-%m")
            series[month] = round(float(close), 6)
        return meta.get("longName") or meta.get("shortName"), series
    return None, {}


def bcb_monthly(client: httpx.Client, code: int) -> dict[str, float]:
    """Série mensal do SGS em blocos de 10 anos (limite da API)."""
    series: dict[str, float] = {}
    today = date.today()
    for start in range(START_YEAR, today.year + 1, 10):
        end = min(start + 9, today.year)
        resp = get(
            client,
            BCB_URL.format(code=code),
            {"formato": "json", "dataInicial": f"01/01/{start}", "dataFinal": f"31/12/{end}"},
        )
        if resp is None:
            raise RuntimeError(f"SGS {code}: sem resposta para {start}-{end}")
        for point in resp.json():
            d, m, y = point["data"].split("/")
            series[f"{y}-{m}"] = float(point["valor"])
    return series


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data" / "history.json"))
    args = parser.parse_args()

    yahoo = httpx.Client(timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    bcb = httpx.Client(timeout=60, headers={"Accept": "application/json"})

    assets = {}
    for asset_class, tickers in (("acoes", DEFAULT_STOCKS), ("fiis", DEFAULT_FIIS)):
        for ticker in tickers:
            name, monthly = yahoo_monthly(yahoo, f"{ticker}.SA")
            print(f"{ticker}: {len(monthly)} meses", file=sys.stderr)
            if monthly:
                assets[ticker] = {"name": name or ticker, "class": asset_class, "monthly": monthly}

    benchmarks = {}
    for asset_class, (symbol, label) in BENCHMARKS.items():
        _, monthly = yahoo_monthly(yahoo, symbol)
        print(f"{label}: {len(monthly)} meses", file=sys.stderr)
        # Sem o índice na fonte, o modelo usa a média igualitária do universo da classe.
        benchmarks[asset_class] = {"label": label, "monthly": monthly}

    macro = {key: bcb_monthly(bcb, code) for key, code in BCB_SERIES.items()}
    for key, symbol in GLOBAL.items():
        macro[key] = yahoo_monthly(yahoo, symbol)[1]
    for key, series in macro.items():
        print(f"{key}: {len(series)} meses", file=sys.stderr)

    if len(assets) < 10 or not macro["cdi"]:
        raise SystemExit("Dados insuficientes: verifique o acesso ao Yahoo e ao Banco Central.")

    out = {
        "source": "Yahoo Finance (preço ajustado por proventos) e Banco Central (SGS 4391, 4189, 13522)",
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "assets": assets,
        "benchmarks": benchmarks,
        "macro": macro,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    print(f"gravado em {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
