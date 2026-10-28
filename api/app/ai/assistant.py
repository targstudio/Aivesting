"""Assistente de chat: a Claude responde perguntas consultando os dados do próprio app por ferramentas."""

import json
from dataclasses import asdict

import anthropic

from ..ranking.service import CLASSES, RankingService

MAX_TOOL_ROUNDS = 6

SYSTEM_PROMPT = """Você é a assistente do AI.vesting, um app brasileiro de informação sobre investimentos.
Responda em português do Brasil, de forma direta e em linguagem simples.

Use as ferramentas para buscar dados do app (ranking de ações e FIIs, detalhes de um ativo, indicadores macro)
antes de citar qualquer número. Não invente preços, probabilidades, notícias ou eventos. Se o app não tem o dado,
diga isso. As probabilidades vêm de um modelo estatístico ainda em calibração; trate-as como estimativas incertas.

O app é informativo. Você pode apresentar e comparar dados e explicar o ranking, mas não diga para comprar, vender
ou manter um ativo, não indique preço-alvo, não monte carteira para a pessoa e não prometa rentabilidade. Se pedirem
uma recomendação, explique que o app não faz isso e ofereça os dados que ajudam a pessoa a decidir."""

TOOLS = [
    {
        "name": "get_ranking",
        "description": "Ranking atual de uma classe de ativos, do mais para o menos provável de superar o índice. "
        "Retorna posição, preço, variação do dia, score e probabilidade de cada ativo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_class": {"type": "string", "enum": list(CLASSES), "description": "acoes ou fiis"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "description": "Quantos ativos retornar"},
            },
            "required": ["asset_class"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "name": "get_asset",
        "description": "Detalhes de um ativo do ranking pelo ticker (ex.: PETR4, MXRF11): posição, score, "
        "probabilidade e os fatores que mais pesaram.",
        "input_schema": {
            "type": "object",
            "properties": {"ticker": {"type": "string"}},
            "required": ["ticker"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "name": "get_macro",
        "description": "Indicadores macroeconômicos atuais do Banco Central: Selic, IPCA 12 meses e dólar.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        "strict": True,
    },
]


class Assistant:
    def __init__(self, api_key: str, model: str, ranking: RankingService, macro_source):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.ranking = ranking
        self.macro_source = macro_source

    async def run_tool(self, name: str, args: dict) -> dict:
        if name == "get_ranking":
            snapshot = self.ranking.snapshots.get(args["asset_class"])
            if snapshot is None:
                return {"erro": "Ranking ainda não calculado."}
            limit = args.get("limit") or 10
            return {
                "indice_referencia": snapshot.benchmark,
                "calculado_em": snapshot.computed_at,
                "dados_em_tempo_real": snapshot.data_realtime,
                "versao_modelo": snapshot.model_version,
                "total_ativos": len(snapshot.assets),
                "ativos": [
                    {k: v for k, v in asdict(a).items() if k != "top_factors"} for a in snapshot.assets[:limit]
                ],
            }
        if name == "get_asset":
            ticker = args["ticker"].upper().strip()
            for snapshot in self.ranking.snapshots.values():
                for asset in snapshot.assets:
                    if asset.ticker == ticker:
                        return {**asdict(asset), "indice_referencia": snapshot.benchmark, "total": len(snapshot.assets)}
            return {"erro": f"{ticker} não está no ranking do app."}
        if name == "get_macro":
            return {"indicadores": [asdict(i) for i in await self.macro_source.indicators()]}
        return {"erro": f"Ferramenta desconhecida: {name}"}

    async def reply(self, history: list[dict]) -> dict:
        """`history` é a conversa em texto: [{"role": "user"|"assistant", "content": str}, ...]."""
        messages: list = [{"role": m["role"], "content": m["content"]} for m in history]
        tools_used: list[str] = []
        for _ in range(MAX_TOOL_ROUNDS):
            response = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                messages=messages,
            )
            if response.stop_reason == "refusal":
                return {"reply": "Não consigo responder a isso por aqui.", "tools_used": tools_used}
            if response.stop_reason != "tool_use":
                text = "".join(b.text for b in response.content if b.type == "text").strip()
                return {"reply": text, "tools_used": tools_used}

            messages.append({"role": "assistant", "content": response.content})
            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                tools_used.append(block.name)
                data = await self.run_tool(block.name, block.input)
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(data, ensure_ascii=False, default=str),
                        "is_error": "erro" in data,
                    }
                )
            messages.append({"role": "user", "content": results})
        return {"reply": "A consulta ficou longa demais. Tente uma pergunta mais específica.", "tools_used": tools_used}
