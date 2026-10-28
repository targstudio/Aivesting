"""Histórico mensal de longo prazo (preços ajustados, índices, CDI e macro) alinhado num único calendário."""

import json
from dataclasses import dataclass, field
from pathlib import Path


def month_index(month: str) -> int:
    year, mon = month.split("-")
    return int(year) * 12 + int(mon) - 1


def month_label(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


Series = list[float | None]


@dataclass
class Benchmark:
    label: str
    levels: Series
    # True quando o índice não veio da fonte e foi substituído pela média igualitária do universo.
    proxy: bool = False


@dataclass
class History:
    months: list[str]
    prices: dict[str, Series]
    names: dict[str, str]
    classes: dict[str, str]
    benchmarks: dict[str, Benchmark]
    cdi: Series  # retorno do CDI no mês, em decimal
    macro: dict[str, Series] = field(default_factory=dict)
    # Meses em que um grupamento ou desdobramento não ajustado pela fonte foi corrigido, por ativo.
    adjustments: dict[str, list[str]] = field(default_factory=dict)
    source: str = ""
    fetched_at: str = ""

    @property
    def first(self) -> int:
        return month_index(self.months[0])

    def index_of(self, month: str) -> int | None:
        i = month_index(month) - self.first
        return i if 0 <= i < len(self.months) else None

    def tickers(self, asset_class: str) -> list[str]:
        return [t for t, c in self.classes.items() if c == asset_class]


def _align(raw: dict[str, float], first: int, size: int) -> Series:
    out: Series = [None] * size
    for month, value in raw.items():
        i = month_index(month) - first
        if 0 <= i < size and value is not None:
            out[i] = float(value)
    return out


# Variação mensal acima de +150% ou abaixo de -65% num ativo grande é quase sempre um grupamento ou
# desdobramento que a fonte não ajustou (ex.: XPML11 em jan/2026). O histórico anterior é reescalado.
SPLIT_UP, SPLIT_DOWN = 2.5, 0.35


def fix_unadjusted_splits(prices: Series) -> tuple[Series, list[int]]:
    out = list(prices)
    fixed = []
    for i in range(1, len(out)):
        a, b = out[i - 1], out[i]
        if a is None or b is None or a <= 0:
            continue
        ratio = b / a
        if ratio > SPLIT_UP or ratio < SPLIT_DOWN:
            for k in range(i):
                if out[k] is not None:
                    out[k] *= ratio
            fixed.append(i)
    return out, fixed


def equal_weight_index(series: list[Series]) -> Series:
    """Índice de média igualitária dos retornos mensais disponíveis, começando em 100."""
    size = len(series[0]) if series else 0
    levels: Series = [None] * size
    level = None
    for i in range(1, size):
        rets = [s[i] / s[i - 1] - 1 for s in series if s[i] is not None and s[i - 1] is not None]
        if not rets:
            continue
        if level is None:
            level = 100.0
            levels[i - 1] = level
        level *= 1 + sum(rets) / len(rets)
        levels[i] = level
    return levels


def from_dict(data: dict) -> History:
    all_months = [m for a in data["assets"].values() for m in a["monthly"]]
    all_months += [m for b in data.get("benchmarks", {}).values() for m in b.get("monthly", {})]
    first, last = min(map(month_index, all_months)), max(map(month_index, all_months))
    size = last - first + 1

    prices, adjustments = {}, {}
    for t, a in data["assets"].items():
        prices[t], fixed = fix_unadjusted_splits(_align(a["monthly"], first, size))
        if fixed:
            adjustments[t] = [month_label(first + i) for i in fixed]
    classes = {t: a["class"] for t, a in data["assets"].items()}
    names = {t: a.get("name") or t for t, a in data["assets"].items()}

    benchmarks = {}
    for asset_class in sorted(set(classes.values())):
        raw = data.get("benchmarks", {}).get(asset_class, {})
        label = raw.get("label") or asset_class
        members = [prices[t] for t in classes if classes[t] == asset_class]
        levels = _align(raw.get("monthly") or {}, first, size)
        # Usa o índice oficial só se ele cobre ao menos o período em que o universo tem dados.
        member_start = min((next((i for i, v in enumerate(s) if v is not None), size) for s in members), default=size)
        index_start = next((i for i, v in enumerate(levels) if v is not None), size)
        if index_start <= member_start + 12 and sum(v is not None for v in levels) > 24:
            benchmarks[asset_class] = Benchmark(label, levels)
        else:
            proxy_label = "média dos FIIs do app" if asset_class == "fiis" else "média das ações do app"
            benchmarks[asset_class] = Benchmark(proxy_label, equal_weight_index(members), True)

    macro_raw = data.get("macro", {})
    cdi = [None if v is None else v / 100 for v in _align(macro_raw.get("cdi", {}), first, size)]
    macro = {k: _align(v, first, size) for k, v in macro_raw.items() if k != "cdi"}
    return History(
        months=[month_label(first + i) for i in range(size)],
        prices=prices,
        names=names,
        classes=classes,
        benchmarks=benchmarks,
        cdi=cdi,
        macro=macro,
        adjustments=adjustments,
        source=data.get("source", ""),
        fetched_at=data.get("fetched_at", ""),
    )


def load(path: Path) -> History:
    return from_dict(json.loads(path.read_text()))
