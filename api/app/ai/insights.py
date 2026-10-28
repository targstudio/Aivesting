"""Leituras da IA em cada tela do app: resumo do mercado, do ranking, do macro e dos horizontes, e alertas explicados.

Cada leitura recebe só os dados que o app já calculou e fica guardada até alguém pedir "Atualizar", para que todas as
pessoas vejam o mesmo texto e o custo não cresça com o número de acessos. A IA descreve os dados; ela não recomenda.
"""

import json
import re
import time
from dataclasses import asdict
from datetime import datetime, timezone

import anthropic

from ..alerts import Alert, AlertResult, describe
from ..market import MarketService
from ..ranking.service import CLASSES, RankingService

LEVELS = {
    "iniciante": "A pessoa está começando a investir: evite jargão, explique termos como Selic, IFIX ou volatilidade "
    "em poucas palavras quando aparecerem e use comparações do dia a dia.",
    "intermediario": "A pessoa conhece o básico de investimentos: pode usar os termos comuns do mercado sem defini-los.",
    "avancado": "A pessoa tem experiência: seja técnica e concisa, cite os números e os fatores do modelo.",
}

BASE_RULES = """Escreva em português do Brasil. Use apenas os dados fornecidos em JSON. Não invente números, notícias,
eventos ou causas que não estejam nos dados; se os dados não bastam para explicar um movimento, diga isso.
O AI.vesting é informativo: não diga para comprar, vender ou manter ativos, não indique preço-alvo, não monte
carteira e não prometa rentabilidade. Probabilidades vêm de modelos estatísticos e são estimativas incertas.
Não use títulos nem listas longas: texto corrido, frases curtas."""

TASKS = {
    "inicio": "Faça o resumo do dia para a tela inicial em até 4 frases: como se moveram os principais índices e o "
    "dólar, o que o cenário macro mostra e o que chama atenção no topo do ranking de ações e de FIIs.",
    "mercado": "Resuma o pregão em até 2 parágrafos curtos: Brasil (Ibovespa, dólar, altas e baixas do app, "
    "quantos ativos sobem e caem) e exterior (EUA, Europa, China, petróleo, ouro, juros americanos).",
    "ranking": "Explique em até 2 parágrafos curtos o que o ranking desta classe mostra agora: o que os primeiros "
    "colocados têm em comum nos fatores do modelo, o que puxa os últimos para baixo e como o macro conversa com isso.",
    "macro": "Explique em até 2 parágrafos curtos o cenário macro atual (Selic, IPCA, dólar e, se houver, o cenário de "
    "longo prazo) e como cada indicador costuma se relacionar com ações e fundos imobiliários, sem prever o futuro.",
    "horizontes": "Explique em até 2 parágrafos curtos o ranking deste horizonte: se o modelo foi validado ou se a "
    "ordem segue o histórico, o que os primeiros colocados têm em comum e o que o cenário atual sugere sobre o "
    "passado em situações parecidas. Lembre que rentabilidade passada não garante futura.",
    "alertas": "Explique em até 2 parágrafos curtos por que este alerta disparou, com os dados do ativo (preço, "
    "variação, posição no ranking, fatores do modelo) e o contexto do mercado e do macro. Não sugira o que fazer.",
}

# A última leitura de cada tela fica guardada e é servida sem chamar a IA até alguém pedir "Atualizar".
# Pedidos de atualização dentro deste intervalo recebem a leitura recém-gerada (evita cliques repetidos).
REFRESH_MIN_SECONDS = 2 * 60


def system_prompt(task: str, level: str) -> str:
    return (
        "Você é a IA do AI.vesting, um app brasileiro de informação sobre investimentos.\n"
        f"{TASKS[task]}\n{LEVELS.get(level, LEVELS['iniciante'])}\n\n{BASE_RULES}"
    )


def _slim_ranking(snapshot, limit: int) -> dict:
    return {
        "indice_referencia": snapshot.benchmark,
        "calculado_em": snapshot.computed_at,
        "versao_modelo": snapshot.model_version,
        "total_ativos": len(snapshot.assets),
        "ativos": [
            {
                "posicao": a.rank, "ticker": a.ticker, "nome": a.name, "preco": a.price,
                "variacao_dia_pct": a.change_percent, "probabilidade": a.probability_outperform,
                "fatores": [{"fator": c.label, "contribuicao": round(c.contribution, 2)} for c in a.top_factors],
            }
            for a in (snapshot.assets[:limit] + (snapshot.assets[-3:] if len(snapshot.assets) > limit else []))
        ],
    }


class Insights:
    def __init__(
        self, api_key: str, model: str, ranking: RankingService, macro_source, longterm, market: MarketService, usage=None
    ):
        self.usage = usage
        self.client = anthropic.AsyncAnthropic(api_key=api_key) if api_key else None
        self.model = model
        self.ranking = ranking
        self.macro_source = macro_source
        self.longterm = longterm
        self.market = market
        self._cache: dict[tuple, tuple[float, dict]] = {}

    # ---- Dados de cada contexto ----

    async def _macro(self) -> list[dict]:
        return [asdict(i) for i in await self.macro_source.indicators()]

    async def payload(self, context: str) -> tuple[str, dict] | None:
        """Converte "ranking:acoes", "horizontes:fiis:5" etc. na tarefa e nos dados que a IA recebe."""
        parts = context.split(":")
        kind = parts[0]
        if kind in ("inicio", "mercado"):
            overview = await self.market.overview(self.ranking)
            data = {"mercado": overview, "macro": await self._macro()}
            if kind == "inicio":
                data.pop("mercado")
                data["indices"] = overview["indices"]
                data["rankings"] = {c: _slim_ranking(s, 5) for c, s in self.ranking.snapshots.items()}
            for item in data.get("indices", []) + data.get("mercado", {}).get("indices", []):
                item.pop("spark", None)
            for side in ("altas", "baixas"):
                for item in data.get("mercado", {}).get(side, []):
                    item.pop("spark", None)
                    item.pop("logo_url", None)
            return kind, data
        if kind == "ranking" and len(parts) == 2 and parts[1] in CLASSES:
            snapshot = self.ranking.snapshots.get(parts[1])
            if snapshot is None or not snapshot.assets:
                return None
            return kind, {"ranking": _slim_ranking(snapshot, 10), "macro": await self._macro()}
        if kind == "macro":
            overview = self.longterm.overview() if self.longterm and self.longterm.data else None
            return kind, {"macro": await self._macro(), "cenario_longo_prazo": overview and overview.get("scenario")}
        if kind == "horizontes" and len(parts) == 3 and parts[1] in CLASSES and parts[2] in ("1", "3", "5", "10"):
            result = self.longterm.horizon(parts[1], int(parts[2])) if self.longterm and self.longterm.data else None
            if result is None:
                return None
            data = {
                "indice_referencia": result["benchmark"], "horizonte_anos": result["years"],
                "modelo_validado": result["model_used"], "historico_suficiente": result["enough_history"],
                "frequencia_historica_superar_indice": result["beat_benchmark"]["base_rate"],
                "dados_ate": result["data_through"], "cenario_atual": result["scenario"],
                "ativos": result["assets"][:10],
            }
            return kind, data
        return None

    # ---- Chamada à Claude ----

    async def _complete(self, task: str, level: str, data: dict, instruction: str) -> str:
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=1500,
            system=system_prompt(task, level),
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": f"{instruction}\n\n" + json.dumps(data, ensure_ascii=False, default=str)}],
        )
        if self.usage:
            self.usage.record(f"leitura_{task}", response)
        if response.stop_reason == "refusal":
            return "Não foi possível gerar esta leitura agora."
        return "".join(b.text for b in response.content if b.type == "text").strip()

    async def complete_with(self, system: str, instruction: str, feature: str = "assessor_plano") -> str:
        """Chamada simples com um papel próprio (ex.: o assessor explicando o plano)."""
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=2000,
            system=system,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": instruction}],
        )
        if self.usage:
            self.usage.record(feature, response)
        if response.stop_reason == "refusal":
            return "Não foi possível gerar esta explicação agora."
        return "".join(b.text for b in response.content if b.type == "text").strip()

    def cached(self, context: str, level: str, max_age: float | None = None) -> dict | None:
        """Última leitura guardada; com `max_age`, só se for mais nova que isso (em segundos)."""
        hit = self._cache.get((context, level))
        if hit and (max_age is None or time.monotonic() - hit[0] < max_age):
            if self.usage:
                self.usage.hit()
            return {**hit[1], "cached": True}
        return None

    async def insight(self, context: str, level: str) -> dict | None:
        """Retorna None se o contexto não existe ou não tem dados. Chame `cached` antes para não gastar cota."""
        built = await self.payload(context)
        if built is None:
            return None
        task, data = built
        text = await self._complete(task, level, data, "Leia estes dados do app.")
        result = {
            "context": context,
            "level": level,
            "text": text,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._cache[(context, level)] = (time.monotonic(), result)
        return {**result, "cached": False}

    async def explain_alert(self, alert: Alert, result: AlertResult, level: str) -> str:
        asset = next(
            (a for s in self.ranking.snapshots.values() for a in s.assets if a.ticker == alert.ticker.upper()), None
        )
        data = {
            "alerta": {"regra": describe(alert), "disparou": result.triggered, "situacao": result.message},
            "ativo": asdict(asset) if asset else None,
            "indices": [{k: v for k, v in asdict(i).items() if k != "spark"} for i in await self.market.items()],
            "macro": await self._macro(),
        }
        if data["ativo"]:
            data["ativo"].pop("spark", None)
        return await self._complete("alertas", level, data, "Explique este alerta.")


def valid_context(context: str) -> bool:
    return bool(re.fullmatch(r"[a-z]+(:[a-z0-9]+){0,2}", context))
