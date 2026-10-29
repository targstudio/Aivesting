"""Análise SWOT de um ativo: forças, fraquezas, oportunidades e ameaças, juntando os dados do ativo com o cenário.

A IA recebe o que o app já tem do ativo (preço, ranking de curto prazo, histórico de 10 anos, crises, setor) e o
cenário geral (macro do Brasil, índices e commodities do mundo, cenário de longo prazo). Ela devolve um JSON com
os quatro quadrantes para a tela montar o quadro, sem markdown solto.
"""

import json
from dataclasses import asdict

import anthropic

from ..portfolio import SECTORS

SYSTEM_PROMPT = """Você é a IA do StockTower, um app brasileiro de informação sobre investimentos.
Monte uma análise SWOT do ativo: forças e fraquezas (do próprio ativo) e oportunidades e ameaças (do cenário).

Use os dados fornecidos em JSON: preço, ranking, fatores do modelo, retorno e risco de 10 anos, comportamento nas
crises, desempenho em cenários parecidos com o atual, setor, indicadores macro do Brasil e mercados do exterior.
Pode usar o que é conhecido e estável sobre a empresa ou o fundo e o seu setor (modelo de negócio, controle
acionário, exposição a commodities, juros ou câmbio, regulação), mas não invente números, notícias, balanços ou
eventos recentes que não estejam nos dados. Todo número citado precisa vir do JSON.

Ligue o ativo ao cenário: diga como a Selic, a inflação, o dólar, as bolsas e as commodities atuais costumam afetar
este tipo de ativo. Rentabilidade passada não garante futura e probabilidades são estimativas incertas.

O StockTower é informativo: não diga para comprar, vender ou manter, não indique preço-alvo e não prometa
rentabilidade. Escreva em português do Brasil, sem markdown (sem asteriscos, títulos ou listas dentro dos textos).
Cada quadrante tem de 2 a 4 itens; cada item tem um título curto (até 6 palavras) e uma ou duas frases."""

ITEM = {
    "type": "object",
    "properties": {"titulo": {"type": "string"}, "texto": {"type": "string"}},
    "required": ["titulo", "texto"],
    "additionalProperties": False,
}
QUADRANTS = ("forcas", "fraquezas", "oportunidades", "ameacas")
SCHEMA = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string"},
        **{q: {"type": "array", "items": ITEM} for q in QUADRANTS},
    },
    "required": ["resumo", *QUADRANTS],
    "additionalProperties": False,
}


def build_payload(ticker: str, live: dict | None, history: dict | None, macro: list, world: list, scenario) -> dict:
    """Junta o que o app sabe do ativo e do cenário, sem séries longas que só gastam tokens."""
    name = (live or {}).get("asset", {}).get("name") or (history or {}).get("name")
    asset_class = (live or {}).get("asset", {}).get("asset_class") or (history or {}).get("asset_class")
    data: dict = {
        "ativo": {
            "ticker": ticker,
            "nome": name,
            "classe": "fundo imobiliário" if asset_class == "fiis" else "ação",
            "setor": SECTORS.get(ticker) if asset_class == "acoes" else None,
        }
    }
    if live:
        a = live["asset"]
        data["curto_prazo"] = {
            "preco": a["price"],
            "variacao_dia_pct": a["change_percent"],
            "posicao_ranking": f"{a['rank']}º de {live['total']}",
            "probabilidade_superar_indice": a["probability_outperform"],
            "indice_referencia": live["benchmark"],
            "fatores": [{"fator": c["label"], "contribuicao": round(c["contribution"], 2)} for c in a["top_factors"]],
            "variacao_30_pregoes_pct": round((a["spark"][-1] / a["spark"][0] - 1) * 100, 2)
            if len(a.get("spark") or []) > 1 and a["spark"][0] else None,
        }
    if history:
        data["historico"] = {
            "desde": history.get("first_month"),
            "dados_ate": history.get("data_through"),
            "risco_retorno_10_anos": history.get("risk_10y"),
            "retorno_por_ano": history.get("annual"),
            "crises": history.get("crises"),
            "crises_descricao": history.get("crisis_list"),
            "em_cenarios_parecidos_com_o_atual": history.get("in_scenario"),
            "indice_referencia": history.get("benchmark"),
            "indice_risco_retorno_10_anos": history.get("benchmark_risk"),
            "indice_em_cenarios_parecidos": history.get("benchmark_in_scenario"),
            "cdi_risco_retorno_10_anos": history.get("cdi_risk"),
            "horizontes": {
                y: {k: h.get(k) for k in ("rank", "total", "prob_beat_benchmark", "prob_beat_cdi")}
                for y, h in (history.get("horizons") or {}).items()
            },
        }
    data["cenario"] = {
        "macro_brasil": macro,
        "mercados_mundo": world,
        "cenario_longo_prazo": scenario,
    }
    return data


class SwotAnalyst:
    def __init__(self, api_key: str, model: str, usage=None):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.usage = usage

    async def analyze(self, payload: dict, level_note: str = "") -> dict:
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=4000,
            system=f"{SYSTEM_PROMPT}\n\n{level_note}".strip(),
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": "Monte a análise SWOT deste ativo.\n\n"
                       + json.dumps(payload, ensure_ascii=False, default=str)}],
        )
        if self.usage:
            self.usage.record("swot_ativo", response)
        if response.stop_reason in ("refusal", "max_tokens"):
            raise ValueError("A IA não conseguiu montar a análise SWOT agora. Tente de novo.")
        text = next((b.text for b in response.content if b.type == "text"), "{}")
        return clean(json.loads(text))


def clean(data: dict) -> dict:
    """Garante o formato que a tela espera, mesmo se a IA devolver algo incompleto."""
    out = {"resumo": str(data.get("resumo") or "").strip()}
    for q in QUADRANTS:
        items = data.get(q) if isinstance(data.get(q), list) else []
        out[q] = [
            {"titulo": str(i.get("titulo") or "").strip(), "texto": str(i.get("texto") or "").strip()}
            for i in items[:5]
            if isinstance(i, dict) and (i.get("titulo") or i.get("texto"))
        ]
    return out


def world_markets(items) -> list[dict]:
    return [{k: v for k, v in asdict(i).items() if k not in ("spark", "logo_url")} for i in items]
