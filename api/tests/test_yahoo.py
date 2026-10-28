import asyncio

import httpx
import respx

from app.config import Settings
from app.main import create_app
from app.providers.yahoo import YahooProvider, parse_chart

CHART = {
    "meta": {"regularMarketPrice": 38.5, "previousClose": 38.0, "longName": "Petróleo Brasileiro S.A.", "currency": "BRL", "regularMarketTime": 1767312000},
    "timestamp": [1767139200, 1767225600, 1767312000],
    "indicators": {"quote": [{"close": [37.0, None, 38.5], "volume": [100, 200, 300]}]},
}


def test_parse_chart_skips_missing_closes():
    q = parse_chart("PETR4", CHART)
    assert q.price == 38.5 and q.name.startswith("Petróleo")
    assert [b.close for b in q.history] == [37.0, 38.5]
    assert [b.volume for b in q.history] == [100, 300]
    assert q.change_percent == round((38.5 / 38.0 - 1) * 100, 2)
    assert q.logo_url.endswith("/PETR4.svg")


@respx.mock
def test_quotes_uses_sa_suffix_and_drops_failures():
    respx.get("https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA").mock(
        return_value=httpx.Response(200, json={"chart": {"result": [CHART]}})
    )
    respx.get("https://query1.finance.yahoo.com/v8/finance/chart/XXXX3.SA").mock(return_value=httpx.Response(404))
    quotes = asyncio.run(YahooProvider().quotes(["PETR4", "XXXX3"]))
    assert [q.ticker for q in quotes] == ["PETR4"]


def test_setting_selects_yahoo():
    app = create_app(Settings(_env_file=None, data_provider="yahoo"), start_scheduler=False)
    assert app.state.provider.name == "yahoo"
