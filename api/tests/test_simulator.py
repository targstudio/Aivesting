import json

from app.simulator import STRATEGIES, SimulationRequest, Simulator

from .longterm_data import synthetic_history


def make(tmp_path):
    path = tmp_path / "history.json"
    path.write_text(json.dumps(synthetic_history()))
    return Simulator(path)


def test_ordered_percentiles_and_invested(tmp_path):
    r = make(tmp_path).simulate(SimulationRequest(initial=1000, monthly=100, years=3, goal=5000))
    assert [s["key"] for s in r["strategies"]] == list(STRATEGIES)
    for s in r["strategies"]:
        if s["enough_history"]:
            assert s["worst"] <= s["p10"] <= s["median"] <= s["p90"] <= s["best"]
            assert s["invested"] == 1000 + 100 * 36
            assert 0 <= s["goal_hit_rate"] <= 1


def test_needed_monthly_reaches_goal_in_80_percent(tmp_path):
    sim = make(tmp_path)
    r = sim.simulate(SimulationRequest(monthly=100, years=3, goal=8000))
    cdi = next(s for s in r["strategies"] if s["key"] == "cdi")
    again = sim.simulate(SimulationRequest(monthly=cdi["needed_monthly_80"] + 0.01, years=3, goal=8000))
    hit = next(s for s in again["strategies"] if s["key"] == "cdi")["goal_hit_rate"]
    assert hit >= 0.8


def test_missing_file(tmp_path):
    assert Simulator(tmp_path / "nao.json").simulate(SimulationRequest(years=1)) is None
