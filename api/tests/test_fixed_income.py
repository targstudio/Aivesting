from fastapi.testclient import TestClient

from app.config import Settings
from app.fixed_income import parse_tesouro
from app.main import create_app

CSV = """Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
Tesouro IPCA+;15/05/2035;27/10/2026;7,45;7,57;2.104,33;2.090,10;2.090,10
Tesouro Selic;01/03/2029;28/10/2026;0,0612;0,0712;17.501,20;17.490,00;17.490,00
Tesouro IPCA+;15/05/2035;28/10/2026;7,41;7,53;2.110,50;2.095,00;2.095,00
Tesouro Prefixado;01/01/2026;28/10/2026;12,00;12,10;900,00;899,00;899,00
Tesouro Prefixado;01/01/2032;28/10/2026;13,85;13,97;512,40;508,00;508,00
"""


def test_parse_keeps_latest_base_and_open_bonds():
    base, rows = parse_tesouro(CSV.splitlines())
    assert base.isoformat() == "2026-10-28"
    assert [(r["title"], r["rate"]) for r in rows] == [
        ("Tesouro IPCA+", 7.41),
        ("Tesouro Prefixado", 13.85),
        ("Tesouro Selic", 0.0612),
    ]  # o prefixado vencido sai
    assert rows[0]["kind"] == "ipca" and rows[0]["unit_price"] == 2110.5


def test_rates_endpoint_demo():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    r = c.get("/renda-fixa/taxas").json()
    assert r["cdi"] == r["selic"] - 0.10
    assert {b["kind"] for b in r["tesouro"]} == {"selic", "prefixado", "ipca"}
