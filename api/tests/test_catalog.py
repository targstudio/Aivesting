import asyncio
import io
import zipfile
from datetime import date

import httpx
import respx
from fastapi.testclient import TestClient

from app.catalog import Catalog, Listed, classify, merge, parse_cotahist
from app.config import Settings
from app.main import create_app

from .conftest import make_quote


def cotahist_line(ticker: str, spec: str, codbdi: str = "02", close: float = 10.0, day: str = "20261028",
                  name: str = "EMPRESA", tpmerc: str = "010", volume: float = 1_000_000.0, trades: int = 50) -> str:
    """Monta um registro 01 do COTAHIST com as posições do layout oficial da B3."""
    line = [" "] * 245
    def put(start: int, text: str):  # posição inicial 1-based, como no manual
        line[start - 1:start - 1 + len(text)] = text
    put(1, "01"); put(3, day); put(11, codbdi); put(13, ticker.ljust(12)); put(25, tpmerc)
    put(28, name.ljust(12)); put(40, spec.ljust(10))
    put(109, f"{round(close * 100):013d}"); put(148, f"{trades:05d}"); put(171, f"{round(volume * 100):018d}")
    put(231, "BR" + ticker[:4] + "ACNOR0")
    return "".join(line)


def cotahist_zip(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("COTAHIST.TXT", ("00COTAHIST\n" + "\n".join(lines) + "\n99COTAHIST\n").encode("latin-1"))
    return buf.getvalue()


def test_classify_types():
    assert classify("02", "PETR4", "PN N2") == "acao"
    assert classify("02", "VALE3", "ON NM") == "acao"
    assert classify("02", "TAEE11", "UNT N2") == "unit"
    assert classify("12", "MXRF11", "CI") == "fii"
    assert classify("14", "BOVA11", "CI") == "etf"
    assert classify("02", "AAPL34", "DRN") == "bdr"
    assert classify("10", "PETR1", "DIR PN") is None
    assert classify("96", "PETR4F", "PN N2") is None


def test_parse_cotahist_reads_fixed_width():
    lines = [
        cotahist_line("PETR4", "PN N2", close=38.52, name="PETROBRAS", volume=1_234_567.89, trades=12345),
        cotahist_line("MXRF11", "CI", codbdi="12", close=9.81, name="FII MAXI REN"),
        cotahist_line("PETR4F", "PN N2", codbdi="96"),  # fracionário
        cotahist_line("PETRK400", "PN", tpmerc="070"),  # opção
    ]
    rows = {r.ticker: r for r in parse_cotahist("\n".join(lines))}
    assert set(rows) == {"PETR4", "MXRF11"}
    petr = rows["PETR4"]
    assert (petr.name, petr.type, petr.price, petr.volume, petr.trades, petr.date) == (
        "PETROBRAS", "acao", 38.52, 1_234_567.89, 12345, "2026-10-28"
    )
    assert rows["MXRF11"].type == "fii"


def listed(ticker, price, day, kind="acao"):
    return Listed(ticker, ticker, kind, "ON", price, None, 1.0, 1, day)


def test_merge_computes_change_and_drops_stale():
    previous = [listed("AAAA3", 10, "2026-10-27"), listed("BBBB3", 5, "2026-10-20"), listed("OLDD3", 1, "2026-01-02")]
    out = {a.ticker: a for a in merge(previous, [listed("AAAA3", 11, "2026-10-28")])}
    assert out["AAAA3"].change_percent == 10.0
    assert "BBBB3" in out  # não negociou hoje, mas está dentro do prazo
    assert "OLDD3" not in out


def test_search_orders_exact_prefix_then_name(tmp_path):
    c = Catalog(tmp_path / "x.json")
    c._set([
        Listed("MGLU3", "MAGAZ LUIZA", "acao", "ON", 10, 1.0, 100, 1, "2026-10-28"),
        Listed("PETR4", "PETROBRAS", "acao", "PN", 38, 0.5, 900, 1, "2026-10-28"),
        Listed("PETR3", "PETROBRAS", "acao", "ON", 40, 0.5, 300, 1, "2026-10-28"),
        Listed("MXRF11", "FII MAXI REN", "fii", "CI", 9.8, 0.1, 50, 1, "2026-10-28"),
    ], None)
    assert [a["ticker"] for a in c.search("petr3")["ativos"]] == ["PETR3"]
    assert [a["ticker"] for a in c.search("petr")["ativos"]] == ["PETR4", "PETR3"]  # empate: maior volume
    assert [a["ticker"] for a in c.search("magazine")["ativos"]] == []
    assert [a["ticker"] for a in c.search("magaz")["ativos"]] == ["MGLU3"]
    assert [a["ticker"] for a in c.search("", "fii")["ativos"]] == ["MXRF11"]
    assert c.search("")["ativos"][0]["ticker"] == "PETR4"  # sem busca: maior volume primeiro
    assert c.counts()["acao"] == 3


@respx.mock
def test_refresh_downloads_last_two_sessions(tmp_path):
    base = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/"
    respx.get(f"{base}COTAHIST_D28102026.ZIP").mock(return_value=httpx.Response(
        200, content=cotahist_zip([cotahist_line("PETR4", "PN N2", close=11.0, day="20261028")])))
    respx.get(f"{base}COTAHIST_D27102026.ZIP").mock(return_value=httpx.Response(
        200, content=cotahist_zip([cotahist_line("PETR4", "PN N2", close=10.0, day="20261027"),
                                   cotahist_line("VALE3", "ON NM", close=60.0, day="20261027")])))
    respx.get(url__regex=r".*COTAHIST_D.*").mock(return_value=httpx.Response(404))
    path = tmp_path / "b3.json"
    c = Catalog(path, client=httpx.AsyncClient())
    assert asyncio.run(c.refresh(date(2026, 10, 28))) is True
    assert c.trade_date == "2026-10-28"
    assert c.get("petr4").change_percent == 10.0
    assert c.get("VALE3").price == 60.0
    c.save()
    again = Catalog(path)
    assert again.get("PETR4").price == 11.0
    # Mesmo pregão de novo: nada muda.
    assert asyncio.run(Catalog(path, client=httpx.AsyncClient()).refresh(date(2026, 10, 28))) is False


class OneQuote:
    name = "yahoo"
    realtime = False

    def __init__(self):
        self.calls = 0

    async def quotes(self, tickers, history_days=180):
        self.calls += 1
        return [make_quote(t, 0.001) for t in tickers]


def test_quote_on_demand_uses_cache_and_budget(tmp_path):
    provider = OneQuote()
    c = Catalog(tmp_path / "x.json", provider=provider, quotes_per_minute=1)
    c._set([listed("MGLU3", 10, "2026-10-28"), listed("CASH3", 3, "2026-10-28")], None)
    first = asyncio.run(c.quote("mglu3"))
    assert first["live"] and first["source"] == "yahoo" and len(first["spark"]) == 30
    asyncio.run(c.quote("MGLU3"))
    assert provider.calls == 1  # cache
    other = asyncio.run(c.quote("CASH3"))
    assert provider.calls == 1 and other["live"] is False and other["price"] == 3  # sem cota: fechamento da B3
    assert asyncio.run(c.quote("XXXX3")) is None  # fora da lista: nem tenta


def test_endpoints(tmp_path):
    app = create_app(Settings(_env_file=None), start_scheduler=False)
    catalog = app.state.catalog
    catalog.provider = OneQuote()
    catalog._set([
        Listed("MGLU3", "MAGAZ LUIZA", "acao", "ON", 10, 1.0, 100, 1, "2026-10-28"),
        Listed("BOVA11", "ISHARES BOVA", "etf", "CI", 130, -0.2, 900, 1, "2026-10-28"),
    ], None)
    client = TestClient(app)
    body = client.get("/b3/ativos", params={"q": "mag"}).json()
    assert body["total"] == 1 and body["ativos"][0]["type_label"] == "Ações"
    assert {t["key"]: t["total"] for t in body["tipos"]}["etf"] == 1
    assert client.get("/b3/ativos", params={"tipo": "cripto"}).status_code == 404
    quote = client.get("/b3/ativos/mglu3").json()
    assert quote["live"] and quote["type"] == "acao" and "recomendação" in quote["disclaimer"]
    assert client.get("/b3/ativos/NADA3").status_code == 404
    assert client.get("/health").json()["b3_assets"] == 2
