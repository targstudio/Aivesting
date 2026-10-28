from app.ranking.engine import rank_assets
from app.ranking.factors import compute_factors

from .conftest import make_quote


def test_factors_need_enough_history():
    assert compute_factors(make_quote("CURT3", 0.0, days=30)) is None


def test_momentum_reflects_trend():
    up = compute_factors(make_quote("ALTA3", 0.004))
    down = compute_factors(make_quote("BAIX3", -0.004))
    assert up["momentum_3m"] > 0 > down["momentum_3m"]


def test_ranking_orders_uptrend_first(quotes):
    snap = rank_assets(quotes, "acoes", "Ibovespa", data_realtime=False)
    tickers = [a.ticker for a in snap.assets]
    assert tickers[0] == "ALTA3"
    assert tickers[-1] == "BAIX3"
    assert [a.rank for a in snap.assets] == [1, 2, 3, 4]
    assert snap.assets[0].score == 100.0 and snap.assets[-1].score == 0.0


def test_probability_is_bounded_and_monotonic(quotes):
    snap = rank_assets(quotes, "acoes", "Ibovespa", data_realtime=False)
    probs = [a.probability_outperform for a in snap.assets]
    assert all(0.35 <= p <= 0.65 for p in probs)
    assert probs == sorted(probs, reverse=True)
    assert len(snap.assets[0].top_factors) == 3


def test_empty_universe():
    snap = rank_assets([], "fiis", "IFIX", data_realtime=False)
    assert snap.assets == []
