"""Consumo de IA: tokens e custo estimado de cada chamada à Claude, por função do app.

Cada chamada é registrada em memória e, com o Supabase configurado, gravada na tabela ai_usage para o histórico
sobreviver aos reinícios da API. O custo é estimado pela tabela de preços abaixo (US$ por milhão de tokens).
"""

import asyncio
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

log = logging.getLogger(__name__)

# US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache (1,25x a entrada).
PRICES = {
    "claude-opus-5-5": (4.0, 20.0, 0.20, 5.0),
    "claude-opus-5": (5.0, 25.0, 0.50, 6.25),
    "claude-opus-4-8": (5.0, 25.0, 0.50, 6.25),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20, 2.5),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
}
DEFAULT_PRICE = PRICES["claude-opus-5-5"]

FEATURE_LABELS = {
    "chat": "Chat \"Pergunte à IA\"",
    "assessor_chat": "Chat do assessor",
    "assessor_plano": "Explicação do plano (assessor)",
    "explicacao_ativo": "Explicação de ativo",
    "leitura_inicio": "Resumo da Início",
    "leitura_mercado": "Resumo do Mercado",
    "leitura_ranking": "Leitura do Ranking",
    "leitura_macro": "Leitura do Macro",
    "leitura_horizontes": "Leitura dos Horizontes",
    "leitura_alertas": "Explicação de alerta",
}

KEEP_DAYS = 90
SAO_PAULO = ZoneInfo("America/Sao_Paulo")


@dataclass
class UsageEvent:
    at: str
    feature: str
    model: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost_usd: float


def cost_of(model: str, inp: int, out: int, cache_read: int, cache_write: int) -> float:
    p_in, p_out, p_read, p_write = PRICES.get(model, DEFAULT_PRICE)
    return (inp * p_in + out * p_out + cache_read * p_read + cache_write * p_write) / 1_000_000


class UsageTracker:
    def __init__(self, supabase_url: str = "", secret_key: str = "", client: httpx.AsyncClient | None = None):
        self.events: list[UsageEvent] = []
        self.cache_hits = 0  # leituras servidas do cache, sem chamar a IA
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.base = f"{supabase_url.rstrip('/')}/rest/v1" if supabase_url and secret_key else None
        self.headers = {"apikey": secret_key, "Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}
        self.client = client or (httpx.AsyncClient(timeout=20) if self.base else None)
        self.loaded = False

    def record(self, feature: str, response) -> UsageEvent | None:
        usage = getattr(response, "usage", None)
        if usage is None:
            return None
        inp = getattr(usage, "input_tokens", 0) or 0
        out = getattr(usage, "output_tokens", 0) or 0
        read = getattr(usage, "cache_read_input_tokens", 0) or 0
        write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        model = getattr(response, "model", "") or ""
        event = UsageEvent(
            at=datetime.now(timezone.utc).isoformat(), feature=feature, model=model,
            input_tokens=inp, output_tokens=out, cache_read_tokens=read, cache_write_tokens=write,
            cost_usd=round(cost_of(model, inp, out, read, write), 6),
        )
        self.events.append(event)
        self._trim()
        if self.base:
            asyncio.get_running_loop().create_task(self._save(event))
        return event

    def hit(self) -> None:
        self.cache_hits += 1

    def _trim(self) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat()
        if self.events and self.events[0].at < cutoff:
            self.events = [e for e in self.events if e.at >= cutoff]

    async def _save(self, event: UsageEvent) -> None:
        try:
            resp = await self.client.post(f"{self.base}/ai_usage", headers=self.headers, json=asdict(event))
            resp.raise_for_status()
        except Exception:
            log.exception("falha ao gravar consumo de IA")

    async def load(self) -> None:
        """Traz do banco o consumo dos últimos 90 dias (uma vez por processo)."""
        if self.loaded or not self.base:
            self.loaded = True
            return
        self.loaded = True
        since = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat()
        try:
            resp = await self.client.get(
                f"{self.base}/ai_usage",
                headers=self.headers,
                params={"select": "*", "at": f"gte.{since}", "order": "at.asc", "limit": "50000"},
            )
            resp.raise_for_status()
            fields = UsageEvent.__dataclass_fields__
            stored = [UsageEvent(**{k: v for k, v in row.items() if k in fields}) for row in resp.json()]
            seen = {(e.at, e.feature) for e in stored}
            self.events = stored + [e for e in self.events if (e.at, e.feature) not in seen]
        except Exception:
            log.exception("falha ao ler consumo de IA do banco")

    def _since(self, since: datetime | None) -> dict | None:
        """Custo a partir de um momento. `complete` é falso quando o histórico guardado não cobre o período inteiro
        (sem banco, o consumo só existe desde que a API ligou; com banco, até 90 dias)."""
        if since is None:
            return None
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        start = since.astimezone(timezone.utc).isoformat()
        covered_from = (
            (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat() if self.base else self.started_at
        )
        return {
            "at": start,
            "cost_usd": round(sum(e.cost_usd for e in self.events if e.at >= start), 4),
            "complete": start >= covered_from,
        }

    def summary(self, usd_brl: float | None = None, now: datetime | None = None, since: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)

        def window(days: int | None, events=None) -> dict:
            evs = events if events is not None else self.events
            if days is not None:
                start = (now - timedelta(days=days)).isoformat()
                evs = [e for e in evs if e.at >= start]
            cost = sum(e.cost_usd for e in evs)
            return {
                "calls": len(evs),
                "input_tokens": sum(e.input_tokens + e.cache_read_tokens + e.cache_write_tokens for e in evs),
                "output_tokens": sum(e.output_tokens for e in evs),
                "cost_usd": round(cost, 4),
                "cost_brl": round(cost * usd_brl, 2) if usd_brl else None,
            }

        month = [e for e in self.events if e.at >= (now - timedelta(days=30)).isoformat()]
        by_feature = {}
        for e in month:
            by_feature.setdefault(e.feature, []).append(e)
        features = sorted(
            ({"feature": f, "label": FEATURE_LABELS.get(f, f), **window(None, evs)} for f, evs in by_feature.items()),
            key=lambda x: x["cost_usd"],
            reverse=True,
        )
        # Dias no horário de Brasília.
        local_day = lambda iso: datetime.fromisoformat(iso).astimezone(SAO_PAULO).date().isoformat()  # noqa: E731
        today_local = now.astimezone(SAO_PAULO)
        daily = []
        for i in range(13, -1, -1):
            day = (today_local - timedelta(days=i)).date().isoformat()
            evs = [e for e in self.events if local_day(e.at) == day]
            daily.append({"day": day, "calls": len(evs), "cost_usd": round(sum(e.cost_usd for e in evs), 4)})
        start_of_day = today_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
        return {
            "today": window(None, [e for e in self.events if e.at >= start_of_day]),
            "last_7_days": window(7),
            "last_30_days": window(30),
            "by_feature_30_days": features,
            "daily": daily,
            "cache_hits_since_start": self.cache_hits,
            "since": self.events[0].at if self.events else self.started_at,
            "since_request": self._since(since),
            "avg_daily_usd_7_days": round(sum(e.cost_usd for e in self.events if e.at >= (now - timedelta(days=7)).isoformat()) / 7, 4),
            "persisted": self.base is not None,
            "usd_brl": usd_brl,
            "prices_usd_per_million": {"input": DEFAULT_PRICE[0], "output": DEFAULT_PRICE[1]},
        }
