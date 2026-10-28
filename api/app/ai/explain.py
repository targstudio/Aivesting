"""Explicações em linguagem natural. A IA só descreve os números calculados pelo motor; ela não recomenda."""

import json
from dataclasses import asdict

import anthropic

from ..providers.bcb import MacroIndicator
from ..ranking.engine import RankedAsset, RankingSnapshot

SYSTEM_PROMPT = """Você é o analista de dados do AI.vesting, um app brasileiro de informação sobre investimentos.
Escreva em português do Brasil, em linguagem simples, em no máximo três parágrafos curtos.

Explique a posição do ativo no ranking usando apenas os dados fornecidos em JSON: preço, variação, fatores
calculados pelo modelo e indicadores macroeconômicos. Não invente números, notícias ou eventos que não estejam
nos dados. Se os dados não bastarem para explicar algo, diga isso.

O app é informativo. Não diga para comprar, vender ou manter o ativo, não indique preço-alvo e não fale como se
a valorização fosse garantida. A probabilidade vem de um modelo estatístico ainda em calibração; trate-a como
estimativa incerta."""


def build_payload(
    asset: RankedAsset, snapshot: RankingSnapshot, macro: list[MacroIndicator]
) -> dict:
    return {
        "ativo": {
            "ticker": asset.ticker,
            "nome": asset.name,
            "classe": asset.asset_class,
            "preco": asset.price,
            "variacao_dia_pct": asset.change_percent,
        },
        "ranking": {
            "posicao": asset.rank,
            "total_ativos": len(snapshot.assets),
            "score_0_100": asset.score,
            "probabilidade_superar_indice": asset.probability_outperform,
            "indice_referencia": snapshot.benchmark,
            "versao_modelo": snapshot.model_version,
            "dados_em_tempo_real": snapshot.data_realtime,
            "fatores_principais": [asdict(c) for c in asset.top_factors],
        },
        "macro": [asdict(m) for m in macro],
    }


class Explainer:
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def explain(
        self, asset: RankedAsset, snapshot: RankingSnapshot, macro: list[MacroIndicator]
    ) -> str:
        payload = build_payload(asset, snapshot, macro)
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[
                {
                    "role": "user",
                    "content": "Explique este ativo no ranking.\n\n"
                    + json.dumps(payload, ensure_ascii=False, default=str),
                }
            ],
        )
        if response.stop_reason == "refusal":
            return "Não foi possível gerar a explicação para este ativo agora."
        return "".join(b.text for b in response.content if b.type == "text").strip()
