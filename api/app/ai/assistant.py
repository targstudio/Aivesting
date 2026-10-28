"""Assistente de chat: a Claude responde perguntas consultando os dados do próprio app por ferramentas."""

import json
from dataclasses import asdict

import anthropic

from ..ranking.service import CLASSES, RankingService

MAX_TOOL_ROUNDS = 6

SYSTEM_PROMPT = """Você é a assistente do AI.vesting, um app brasileiro de informação sobre investimentos.
Responda em português do Brasil, de forma direta e em linguagem simples.

Use as ferramentas para buscar dados do app (ranking de ações e FIIs, detalhes de um ativo, indicadores macro,
ranking por horizonte de 1, 3, 5 e 10 anos e o histórico de longo prazo de cada ativo, com o comportamento em crises)
antes de citar qualquer número. Não invente preços, probabilidades, notícias ou eventos. Se o app não tem o dado,
diga isso. As probabilidades vêm de modelos estatísticos; trate-as como estimativas incertas. No ranking por horizonte,
quando "modelo_validado" é falso, a probabilidade é só a frequência histórica da classe e a ordem segue o retorno
ajustado ao risco dos últimos 10 anos: diga isso com clareza. Lembre que rentabilidade passada não garante futura.

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
        "name": "get_horizon_ranking",
        "description": "Ranking de longo prazo de uma classe para um horizonte (1, 3, 5 ou 10 anos): probabilidade "
        "estimada de superar o índice e o CDI, retorno histórico em janelas desse prazo, índice de Sharpe de 10 anos, "
        "validação fora da amostra do modelo e o cenário macro atual.",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_class": {"type": "string", "enum": list(CLASSES), "description": "acoes ou fiis"},
                "years": {"type": "integer", "enum": [1, 3, 5, 10], "description": "Horizonte em anos"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "description": "Quantos ativos retornar"},
            },
            "required": ["asset_class", "years"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "name": "get_asset_history",
        "description": "Histórico de longo prazo de um ativo: retorno, volatilidade, pior queda e Sharpe dos últimos "
        "10 anos, retorno ano a ano, comportamento em crises (2008, 2015-16, 2018, Covid, alta de juros 2021-22, "
        "estresse fiscal 2024) comparado ao índice, e probabilidades por horizonte.",
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
    def __init__(self, api_key: str, model: str, ranking: RankingService, macro_source, longterm=None):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.ranking = ranking
        self.macro_source = macro_source
        self.longterm = longterm

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
        if name == "get_horizon_ranking":
            result = self.longterm.horizon(args["asset_class"], args["years"]) if self.longterm else None
            if result is None:
                return {"erro": "Ranking por horizonte indisponível."}
            limit = args.get("limit") or 10
            return {
                "indice_referencia": result["benchmark"],
                "horizonte_anos": result["years"],
                "modelo_validado": result["model_used"],
                "validacao": {"vs_indice": result["beat_benchmark"], "vs_cdi": result["beat_cdi"]},
                "dados_ate": result["data_through"],
                "cenario_atual": result["scenario"],
                "ativos": result["assets"][:limit],
            }
        if name == "get_asset_history":
            ticker = args["ticker"].upper().strip()
            result = self.longterm.asset(ticker) if self.longterm else None
            return result or {"erro": f"{ticker} não tem histórico de longo prazo no app."}
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
