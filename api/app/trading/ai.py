"""IA do módulo de trading: transforma uma estratégia escrita em português em regras testáveis e lê notas de
corretagem (prints) para o diário."""

import json
import re

import anthropic

from .backtest import PRESETS, SERIES_HELP, Strategy, preset_strategy

STRATEGY_PROMPT = f"""Você converte estratégias de trading descritas em português em regras para o motor de backtest do
StockTower. Devolva só o JSON pedido.

Séries que o motor entende (campo "esquerda" e "direita"): {SERIES_HELP}.
Operadores: cruza_acima, cruza_abaixo, acima, abaixo.
- "entrada": todas as condições precisam valer no mesmo candle (E).
- "saida": basta uma valer (OU). Pode ficar vazia se houver stop, alvo ou limite de candles.
- intervalo: 5m, 15m, 60m, 1d ou 1wk. Day trade exige 5m, 15m ou 60m; se a pessoa falar em day trade sem dizer o
  tempo gráfico, use 5m. Swing sem tempo gráfico: 1d.
- modalidade: day_trade (zera no fim do pregão) ou swing.
- stop_pct e alvo_pct em %, stop_atr em múltiplos do ATR, max_barras em candles. Use null quando não forem citados.
- Se a pessoa citar um setup conhecido (9.1, IFR2, cruzamento de médias, rompimento, VWAP, Bollinger), traduza para
  as regras dele. Se o ticker não for citado, use o ticker informado.
- Em "explicacao", diga em 1 ou 2 frases como você entendeu a estratégia e o que precisou supor."""

COND = {
    "type": "object",
    "properties": {
        "esquerda": {"type": "string"},
        "operador": {"type": "string", "enum": ["cruza_acima", "cruza_abaixo", "acima", "abaixo"]},
        "direita": {"type": "string"},
    },
    "required": ["esquerda", "operador", "direita"],
    "additionalProperties": False,
}
NUM = {"anyOf": [{"type": "number"}, {"type": "null"}]}
STRATEGY_SCHEMA = {
    "type": "object",
    "properties": {
        "nome": {"type": "string"},
        "ticker": {"type": "string"},
        "intervalo": {"type": "string", "enum": ["5m", "15m", "60m", "1d", "1wk"]},
        "lado": {"type": "string", "enum": ["compra", "venda"]},
        "modalidade": {"type": "string", "enum": ["day_trade", "swing"]},
        "entrada": {"type": "array", "items": COND},
        "saida": {"type": "array", "items": COND},
        "stop_pct": NUM, "alvo_pct": NUM, "stop_atr": NUM,
        "max_barras": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
        "explicacao": {"type": "string"},
    },
    "required": ["nome", "ticker", "intervalo", "lado", "modalidade", "entrada", "saida", "stop_pct", "alvo_pct",
                 "stop_atr", "max_barras", "explicacao"],
    "additionalProperties": False,
}

NOTE_PROMPT = """Você lê prints ou fotos de notas de corretagem e extratos de ordens de corretoras brasileiras e devolve
as operações para o diário de trades. Devolva só o JSON pedido.

- Uma linha por operação fechada (compra e venda do mesmo ativo). Junte as execuções parciais pelo preço médio.
- Se só houver a ponta de entrada, deixe preco_saida null.
- "lado" é a ponta de entrada: compra quando comprou primeiro, venda quando vendeu primeiro.
- "modalidade": day_trade quando entrada e saída são no mesmo pregão; senão swing.
- "custos": soma de corretagem, emolumentos, taxa de liquidação, ISS e outras taxas atribuíveis à operação (rateie
  pelo volume quando a nota trouxer o total). Não inclua o IRRF.
- Datas no formato AAAA-MM-DD. Não invente: se um número não aparece, use null."""

TRADE_ITEM = {
    "type": "object",
    "properties": {
        "data": {"type": "string"},
        "data_saida": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "ticker": {"type": "string"},
        "lado": {"type": "string", "enum": ["compra", "venda"]},
        "modalidade": {"type": "string", "enum": ["day_trade", "swing"]},
        "quantidade": {"type": "number"},
        "preco_entrada": {"type": "number"},
        "preco_saida": NUM,
        "custos": NUM,
    },
    "required": ["data", "data_saida", "ticker", "lado", "modalidade", "quantidade", "preco_entrada", "preco_saida",
                 "custos"],
    "additionalProperties": False,
}
NOTE_SCHEMA = {
    "type": "object",
    "properties": {"operacoes": {"type": "array", "items": TRADE_ITEM}, "observacao": {"type": "string"}},
    "required": ["operacoes", "observacao"],
    "additionalProperties": False,
}

TICKER_RE = re.compile(r"\b([A-Z]{4}\d{1,2})\b")


def guess_strategy(text: str, ticker: str) -> tuple[Strategy, str]:
    """Sem IA: reconhece os setups mais comuns pelo texto e lê stop, alvo e ticker."""
    low = text.lower()
    found = TICKER_RE.search(text.upper())
    ticker = found.group(1) if found else ticker
    preset = (
        "setup_91" if "9.1" in low or "91" in low.split() else
        "ifr2" if "ifr2" in low.replace(" ", "") or "ifr de 2" in low else
        "vwap_day" if "vwap" in low else
        "bollinger_reversao" if "bollinger" in low else
        "rompimento_20" if "rompimento" in low or "romper" in low else
        "mme_9_21"
    )
    s = preset_strategy(preset, ticker)
    data = s.model_dump()
    if m := re.search(r"stop\D{0,12}(\d+(?:[.,]\d+)?)\s*%", low):
        data["stop_pct"], data["stop_atr"] = float(m.group(1).replace(",", ".")), None
    if m := re.search(r"(?:alvo|gain|ganho)\D{0,12}(\d+(?:[.,]\d+)?)\s*%", low):
        data["alvo_pct"] = float(m.group(1).replace(",", "."))
    if "day trade" in low or "daytrade" in low:
        data["modalidade"] = "day_trade"
        if data["intervalo"] in ("1d", "1wk"):
            data["intervalo"] = "15m" if "15" in low else "60m" if "60" in low else "5m"
    for k, v in (("5 min", "5m"), ("15 min", "15m"), ("60 min", "60m"), ("semanal", "1wk"), ("diário", "1d")):
        if k in low:
            data["intervalo"] = v
    if "vend" in low and "compr" not in low:
        data["lado"] = "venda"
    name = next(p["nome"] for p in PRESETS if p["id"] == preset)
    return Strategy(**data), f"Entendi como \"{name}\" (leitura automática sem IA). Confira as regras abaixo."


class TradingAI:
    def __init__(self, api_key: str, model: str, usage=None):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.usage = usage

    async def _json(self, feature: str, system: str, schema: dict, content) -> dict:
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=4000,
            system=system,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": content}],
        )
        if self.usage:
            self.usage.record(feature, response)
        if response.stop_reason in ("refusal", "max_tokens"):
            raise ValueError("A IA não conseguiu ler isso agora. Tente de novo ou escreva de outro jeito.")
        return json.loads(next((b.text for b in response.content if b.type == "text"), "{}"))

    async def strategy(self, text: str, ticker: str) -> tuple[Strategy, str]:
        data = await self._json("trading_estrategia", STRATEGY_PROMPT, STRATEGY_SCHEMA,
                                f"Ticker padrão: {ticker}\n\nEstratégia: {text}")
        explanation = str(data.pop("explicacao", "")).strip()
        data = {k: v for k, v in data.items() if v is not None}
        return Strategy(**data), explanation

    async def read_notes(self, images: list[tuple[str, str]]) -> dict:
        content = [{"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}} for mt, b64 in images]
        content.append({"type": "text", "text": "Extraia as operações destes prints."})
        return await self._json("trading_nota", NOTE_PROMPT, NOTE_SCHEMA, content)
