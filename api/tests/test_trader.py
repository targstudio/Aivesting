import asyncio

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.trader import (
    TraderService,
    br_number,
    build,
    demo_raw,
    momentum,
    parse_fiis,
    parse_stocks,
)

from .conftest import make_quote

STOCKS_HTML = """<html><body><table id="resultado"><thead><tr>
<th><a>Papel</a></th><th>Cotação</th><th>P/L</th><th>P/VP</th><th>PSR</th><th>Div.Yield</th><th>P/Ativo</th>
<th>P/Cap.Giro</th><th>P/EBIT</th><th>P/Ativ Circ.Liq</th><th>EV/EBIT</th><th>EV/EBITDA</th><th>Mrg Ebit</th>
<th>Mrg. Líq.</th><th>Liq. Corr.</th><th>ROIC</th><th>ROE</th><th>Liq.2meses</th><th>Patrim. Líq</th>
<th>Dív.Brut/ Patrim.</th><th>Cresc. Rec.5a</th></tr></thead><tbody>
<tr><td><span class="tips"><a href="detalhes.php?papel=PETR4">PETR4</a></span></td><td>38,50</td><td>4,12</td>
<td>1,05</td><td>0,9</td><td>12,30%</td><td>0,4</td><td>-</td><td>2,1</td><td>-</td><td>3,0</td><td>2,50</td>
<td>30%</td><td>20,10%</td><td>1,1</td><td>18%</td><td>25,40%</td><td>1.234.567.890,00</td>
<td>400.000.000.000,00</td><td>0,75</td><td>10,50%</td></tr>
<tr><td>XYZW3</td><td>2,00</td><td>-1,00</td><td>0,30</td><td>0</td><td>0,00%</td><td>0</td><td>0</td><td>0</td>
<td>0</td><td>0</td><td>0</td><td>0%</td><td>-5%</td><td>0</td><td>0%</td><td>-3%</td><td>10.000,00</td>
<td>1.000,00</td><td>3,00</td><td>-2%</td></tr>
</tbody></table></body></html>"""

FIIS_HTML = """<table id="tabelaResultado"><thead><tr><th>Papel</th><th>Segmento</th><th>Cotação</th><th>FFO Yield</th>
<th>Dividend Yield</th><th>P/VP</th><th>Valor de Mercado</th><th>Liquidez</th><th>Qtd de imóveis</th>
<th>Preço do m2</th><th>Aluguel por m2</th><th>Cap Rate</th><th>Vacância Média</th></tr></thead><tbody>
<tr><td><a>HGLG11</a></td><td>Logística</td><td>160,10</td><td>8,1%</td><td>8,90%</td><td>0,98</td>
<td>4.500.000.000</td><td>9.800.000</td><td>21</td><td>0,00</td><td>0,00</td><td>9,2%</td><td>4,50%</td></tr>
</tbody></table>"""


def test_br_number():
    assert br_number("1.234,56") == 1234.56
    assert br_number("12,5%") == 0.125
    assert br_number("-") is None
    assert br_number("") is None


def test_parse_stocks_by_header():
    rows = parse_stocks(STOCKS_HTML)
    petr = rows[0]
    assert petr["ticker"] == "PETR4"
    assert petr["price"] == 38.5
    assert petr["p_vp"] == 1.05
    assert petr["p_l"] == 4.12
    assert abs(petr["dy"] - 0.123) < 1e-9
    assert abs(petr["roe"] - 0.254) < 1e-9
    assert petr["liquidity"] == 1234567890.0
    assert petr["debt_equity"] == 0.75
    assert abs(petr["revenue_growth_5y"] - 0.105) < 1e-9


def test_parse_fiis():
    (hglg,) = parse_fiis(FIIS_HTML)
    assert hglg["segment"] == "Logística"
    assert hglg["p_vp"] == 0.98
    assert abs(hglg["vacancy"] - 0.045) < 1e-9
    assert hglg["properties"] == 21


def test_loss_makers_and_illiquid_are_out():
    snap = build({"acoes": parse_stocks(STOCKS_HTML), "fiis": parse_fiis(FIIS_HTML)}, {})
    tickers = [a["ticker"] for a in snap["classes"]["acoes"]["assets"]]
    assert tickers == ["PETR4"]  # XYZW3 tem prejuízo e quase não negocia
    assert snap["classes"]["acoes"]["total_listed"] == 2


def test_momentum_and_signals():
    up = make_quote("UP", 0.004)
    m = momentum([b.close for b in up.history], [b.volume for b in up.history])
    assert m["ret_1m"] > 0 and m["vs_avg_20d"] > 0
    assert m["volatility"] is not None

    raw = demo_raw()
    down = make_quote("X", -0.004)
    moms = {
        a["ticker"]: momentum([b.close for b in (up if i % 2 else down).history], [1e6] * 130)
        for i, a in enumerate(raw["acoes"])
    }
    snap = build(raw, moms)
    assets = snap["classes"]["acoes"]["assets"]
    assert assets, "a varredura de demonstração deve ter ações"
    for a in assets:
        assert 0 <= a["scores"]["total"] <= 100
        assert a["signal"] in ("barato_subindo", "barato_parado", "barato_caindo", "subindo", "neutro")
        if a["signal"] == "barato_caindo":
            assert a["momentum"]["ret_1m"] < 0
        assert a["risk"] in ("baixo", "medio", "alto")
    fiis = snap["classes"]["fiis"]["assets"]
    assert fiis and all(a["signal"] == "sem_preco" for a in fiis)


def test_service_views_and_fundamentals_fallback():
    svc = TraderService(demo=True)
    asyncio.run(svc.refresh(force=True))
    pvp = svc.view("acoes", "pvp", limit=100)
    values = [a["p_vp"] for a in pvp["assets"]]
    assert values == sorted(values)
    assert svc.view("fiis", "dividendos")["assets"][0]["dy"] >= svc.view("fiis", "dividendos")["assets"][-1]["dy"]
    assert svc.view("acoes", "todos", q="petr")["assets"][0]["ticker"] == "PETR4"
    assert svc.fundamentals("hglg11")["asset_class"] == "fiis"


def test_endpoint_demo():
    app = create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False)
    client = TestClient(app)
    asyncio.run(app.state.trader.refresh(force=True))
    body = client.get("/curto-prazo/acoes?visao=todos").json()
    assert body["screened"] > 0 and body["assets"]
    assert client.get("/curto-prazo/cripto").status_code == 404
    fund = client.get("/assets/PETR4/fundamentos")
    assert fund.status_code == 200


def test_fundamentals_fallback_without_brapi():
    app = create_app(Settings(_env_file=None), start_scheduler=False)
    app.state.trader.raw = {"acoes": parse_stocks(STOCKS_HTML), "fiis": parse_fiis(FIIS_HTML)}
    client = TestClient(app)
    body = client.get("/assets/HGLG11/fundamentos").json()
    assert body["price_to_book"] == 0.98 and body["source"] == "Fundamentus"
    assert client.get("/assets/ABCD3/fundamentos").status_code == 404
