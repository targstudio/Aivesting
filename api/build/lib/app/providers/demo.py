"""Dados sintéticos para rodar o app sem token de dados nem acesso à internet (DEMO_MODE=true)."""

import random
from datetime import date, timedelta

from .base import Bar, Quote
from .bcb import MacroIndicator
from .brapi import logo_url_for


class DemoProvider:
    name = "demo"
    realtime = False

    async def quotes(self, tickers: list[str], history_days: int = 180) -> list[Quote]:
        out = []
        start = date.today() - timedelta(days=history_days)
        for ticker in tickers:
            rng = random.Random(ticker)
            drift = rng.uniform(-0.0015, 0.002)
            vol = rng.uniform(0.008, 0.025)
            price = rng.uniform(8, 120)
            history = []
            for i in range(history_days):
                price *= 1 + rng.gauss(drift, vol)
                history.append(Bar(start + timedelta(days=i), round(price, 2), rng.uniform(5e5, 5e6)))
            prev = history[-2].close
            out.append(
                Quote(
                    ticker=ticker,
                    name=f"{ticker} (dados de demonstração)",
                    price=history[-1].close,
                    change_percent=round((history[-1].close / prev - 1) * 100, 2),
                    history=history,
                    logo_url=logo_url_for(ticker),
                )
            )
        return out


class DemoMacro:
    async def indicators(self) -> list[MacroIndicator]:
        return [
            MacroIndicator("selic", "Selic meta", "% a.a.", 15.0, "demo", 15.0),
            MacroIndicator("ipca_12m", "IPCA acumulado em 12 meses", "%", 4.8, "demo", 5.1),
            MacroIndicator("usd_brl", "Dólar comercial (venda)", "R$", 5.42, "demo", 5.47),
        ]
