"""Serve o resultado calibrado do modelo de horizontes (gerado por `python -m app.longterm.build`)."""

import json
from pathlib import Path

from ..providers.brapi import logo_url_for
from .build import DATA_DIR
from .model import HORIZONS


class LongTermService:
    def __init__(self, path: str = ""):
        self.path = Path(path) if path else DATA_DIR / "longterm.json"
        self._data: dict | None = None
        self._mtime: float | None = None

    @property
    def data(self) -> dict | None:
        """Lê o arquivo de novo quando ele muda (a calibração é refeita todo mês)."""
        try:
            mtime = self.path.stat().st_mtime
        except OSError:
            return None
        if mtime != self._mtime:
            self._data = json.loads(self.path.read_text())
            self._mtime = mtime
        return self._data

    def overview(self) -> dict | None:
        data = self.data
        if data is None:
            return None
        return {
            **{k: v for k, v in data.items() if k not in ("classes", "assets")},
            "horizons": list(HORIZONS),
            "classes": {
                c: {k: v for k, v in info.items() if k != "horizons"}
                | {
                    "horizons": {
                        y: {"model_used": h["model_used"], "beat_benchmark": h["beat_benchmark"], "beat_cdi": h["beat_cdi"]}
                        for y, h in info["horizons"].items()
                    }
                }
                for c, info in data["classes"].items()
            },
        }

    def horizon(self, asset_class: str, years: int) -> dict | None:
        data = self.data
        if data is None or asset_class not in data["classes"]:
            return None
        info = data["classes"][asset_class]
        result = info["horizons"].get(str(years))
        if result is None:
            return None
        return {
            **result,
            "assets": [{**a, "logo_url": logo_url_for(a["ticker"])} for a in result["assets"]],
            "asset_class": asset_class,
            "benchmark": info["benchmark"],
            "benchmark_is_proxy": info["benchmark_is_proxy"],
            "model_version": data["model_version"],
            "data_through": data["data_through"],
            "scenario": data["scenario"],
        }

    def asset(self, ticker: str) -> dict | None:
        data = self.data
        if data is None or ticker not in data["assets"]:
            return None
        asset = data["assets"][ticker]
        info = data["classes"][asset["asset_class"]]
        return {
            "ticker": ticker,
            **asset,
            "logo_url": logo_url_for(ticker),
            "benchmark": info["benchmark"],
            "benchmark_risk": info["benchmark_risk"],
            "benchmark_annual": info["benchmark_annual"],
            "benchmark_crises": info["benchmark_crises"],
            "benchmark_in_scenario": info["benchmark_in_scenario"],
            "cdi_risk": data["cdi_risk"],
            "cdi_annual": data["cdi_annual"],
            "crisis_list": data["crises"],
            "scenario": data["scenario"],
            "model_version": data["model_version"],
            "data_through": data["data_through"],
            "model_used": {y: h["model_used"] for y, h in info["horizons"].items()},
        }
