import pytest

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


def test_dividends_and_value_lift_ranking():
    """Com preços iguais, quem paga mais dividendos e está mais barato fica na frente."""
    same = [make_quote(t, 0.001) for t in ("RICA3", "MEIO3", "CARA3")]
    fund = {
        "RICA3": {"dy": 0.12, "p_vp": 0.8, "p_l": 6},
        "MEIO3": {"dy": 0.05, "p_vp": 1.5, "p_l": 12},
        "CARA3": {"dy": 0.0, "p_vp": 4.0, "p_l": 40},
    }
    snap = rank_assets(same, "acoes", "Ibovespa", data_realtime=False, fundamentals=fund)
    assert [a.ticker for a in snap.assets] == ["RICA3", "MEIO3", "CARA3"]
    top = snap.assets[0]
    assert top.dividend_yield == 0.12 and top.p_vp == 0.8
    assert top.total_return_6m == round(top.return_6m + 0.06, 4)
    assert any(f.factor == "dividend_yield" for f in top.top_factors)


def test_dividends_count_as_return_in_momentum():
    q = make_quote("RICA3", 0.0, vol=0.0)
    assert compute_factors(q, {"dy": 0.12}, "fiis")["momentum_3m"] == pytest.approx(0.12 * 63 / 252)


def test_missing_fundamentals_are_neutral(quotes):
    snap = rank_assets(quotes, "fiis", "IFIX", data_realtime=False, fundamentals={"ALTA3": {"dy": 0.1, "p_vp": 0.9}})
    assert snap.assets[0].ticker == "ALTA3"
    neut = next(a for a in snap.assets if a.ticker == "NEUT3")
    assert neut.dividend_yield is None
    assert all(f.factor not in ("dividend_yield", "book_value") for f in neut.top_factors)
