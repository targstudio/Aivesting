"""IA da tela Minha carteira: lê prints da corretora e explica a análise da carteira.

Os prints vão direto para a Claude e não são gravados nem registrados em log: só as posições extraídas voltam para o
app, e a pessoa confere antes de salvar.
"""

import base64
import binascii
import json

import anthropic

from ..portfolio import CLASS_LABELS, Holding

MAX_IMAGES = 6
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # limite da API da Anthropic por imagem
MEDIA_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}

EXTRACT_PROMPT = """Você lê prints de carteiras de investimento de corretoras e bancos brasileiros (BTG, XP, Rico, Clear,
Inter, Nubank, Itaú, C6, Banco do Brasil, Área do Investidor da B3 e outros) e transcreve cada posição.

Regras:
- Uma posição por linha de produto. Não some nem divida linhas; não invente posições que não aparecem.
- Números no formato brasileiro (1.234,56) viram números JSON (1234.56). "-" ou campo vazio vira null.
- ticker: o código de negociação (PETR4, HGLG11, BPAC11, IVVB11, AAPL34). Para Tesouro, CDB, LCI, LCA, debêntures,
  fundos e saldo em conta, use null e ponha a descrição em name.
- name: o nome mostrado no print (ex.: "PETROBRAS PN N2", "CDB Banco X 110% CDI", "Tesouro IPCA+ 2035").
- asset_class: acoes (inclui units como BPAC11, TAEE11, SANB11, KLBN11), fiis (fundos imobiliários e Fiagro listados),
  etf, bdr, renda_fixa (Tesouro, CDB, LCI, LCA, LC, debêntures, CRI, CRA, COE de renda fixa), fundos (fundos de
  investimento não listados, previdência), internacional (conta ou ativos no exterior, dólar), cripto, caixa
  (saldo disponível em conta) ou outros. Use a seção do print ("Ações", "Fundos listados", "Renda fixa") e a etiqueta
  da linha ("Fii") para decidir; num ticker terminado em 11, diferencie FII, ETF e unit pelo nome e pela seção.
- indexer: só para renda_fixa: pos (CDI, Selic, DI), ipca (IPCA+) ou pre (prefixado); senão null.
- quantity: quantidade de cotas ou ações. avg_price: preço médio. price: preço ou cotação de mercado.
- value: o saldo bruto ou valor atual da posição em R$. Se o print não mostra, use null.
- maturity: vencimento no formato AAAA-MM-DD quando aparecer; senão null.
- section_totals: cada total de seção que aparece no print (ex.: "Ações" 6747.05), para conferir a soma.
- warnings: avise em português, em frases curtas, o que ficou ilegível, cortado ou ambíguo. Se a imagem não é uma
  carteira de investimentos, devolva holdings vazio e explique em warnings."""

NULLABLE_NUMBER = {"type": ["number", "null"]}
NULLABLE_STRING = {"type": ["string", "null"]}

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "broker": NULLABLE_STRING,
        "holdings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ticker": NULLABLE_STRING,
                    "name": {"type": "string"},
                    "asset_class": {"type": "string", "enum": list(CLASS_LABELS)},
                    "indexer": {"anyOf": [{"type": "string", "enum": ["pos", "ipca", "pre"]}, {"type": "null"}]},
                    "quantity": NULLABLE_NUMBER,
                    "avg_price": NULLABLE_NUMBER,
                    "price": NULLABLE_NUMBER,
                    "value": NULLABLE_NUMBER,
                    "maturity": NULLABLE_STRING,
                },
                "required": ["ticker", "name", "asset_class", "indexer", "quantity", "avg_price", "price", "value",
                             "maturity"],
                "additionalProperties": False,
            },
        },
        "section_totals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"label": {"type": "string"}, "value": {"type": "number"}},
                "required": ["label", "value"],
                "additionalProperties": False,
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["broker", "holdings", "section_totals", "warnings"],
    "additionalProperties": False,
}


class ImageError(ValueError):
    pass


def decode_image(data_url: str) -> tuple[str, str]:
    """Aceita "data:image/png;base64,..." e devolve (media_type, base64 limpo), validando tipo e tamanho."""
    header, sep, data = data_url.partition(",")
    if not sep or not header.startswith("data:") or ";base64" not in header:
        raise ImageError("Envie a imagem como data URL em base64.")
    media_type = header[5:].split(";")[0].lower()
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    if media_type not in MEDIA_TYPES:
        raise ImageError("Formato de imagem não aceito. Use PNG, JPG ou WEBP.")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise ImageError("Imagem corrompida.") from None
    if len(raw) > MAX_IMAGE_BYTES:
        raise ImageError("Imagem acima de 5 MB. Recorte o print ou tire um menor.")
    return media_type, base64.b64encode(raw).decode()


def clean_holdings(raw: list[dict]) -> list[dict]:
    """Valida cada linha que a IA devolveu e completa o saldo com quantidade x preço quando faltar."""
    out = []
    for item in raw:
        try:
            h = Holding(**item)
        except ValueError:
            continue
        if h.value is None and h.quantity and h.price:
            h.value = round(h.quantity * h.price, 2)
        if h.asset_class != "renda_fixa":
            h.indexer = None
        out.append(h.model_dump())
    return out


ANALYSIS_PROMPT = """Você é a IA do AI.vesting, um app brasileiro de investimentos. A pessoa importou a carteira dela
e o app já calculou a análise (JSON abaixo): divisão por classe e por setor, concentração, resultado contra o preço
médio, posição de cada ativo no ranking de curto prazo do app, histórico de 10 anos e como a carteira de hoje teria
ido ano a ano e nas crises. Escreva em português do Brasil, em linguagem simples.

Organize a leitura em até 4 parágrafos curtos, sem títulos e sem listas longas:
1. Retrato da carteira: total, como está dividida e o que domina.
2. Concentração e riscos: maiores posições, setores repetidos, o que falta (renda fixa, reserva, exterior).
3. Histórico: retorno anual composto e pior ano da carteira de hoje nos últimos 10 anos, comparados ao Ibovespa e
   ao CDI, e o que aconteceria numa crise como as do passado. Diga qual parte da carteira tem histórico no app.
4. Próximos passos práticos.

Regras: use só os números do JSON e não invente notícias, preços ou taxas. Probabilidades e históricos são estimativas;
rentabilidade passada não garante futura. Nenhum ativo deve passar de 10% do patrimônio e a reserva de emergência vem
antes de renda variável."""

ADVISOR_STEPS = """Se houver "comparacao_plano", compare a carteira com o plano do assessor (perfil da pessoa) e diga
quanto, em R$, falta ou sobra em cada classe para chegar perto do plano, sugerindo usar os próximos aportes antes de
vender (vender pode gerar imposto). Se não houver plano, diga que a tela Assessor monta um plano pelo perfil e que
dá para comparar com a carteira."""

INFO_ONLY = """O app está em modo informativo: não diga para comprar, vender ou manter ativos; descreva os pontos de
atenção e o que a pessoa pode avaliar."""


def analysis_system(advisor_on: bool, level_note: str) -> str:
    return f"{ANALYSIS_PROMPT}\n\n{ADVISOR_STEPS if advisor_on else INFO_ONLY}\n\n{level_note}"


def slim_analysis(analysis: dict) -> dict:
    """Tira da análise o que não ajuda a IA (logos, séries repetidas) para gastar menos tokens."""
    data = json.loads(json.dumps(analysis, default=str))
    for p in data.get("positions", []):
        p.pop("logo_url", None)
    return data


class PortfolioAI:
    def __init__(self, api_key: str, model: str, usage=None):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model
        self.usage = usage

    async def extract(self, images: list[tuple[str, str]]) -> dict:
        content: list[dict] = [
            {"type": "image", "source": {"type": "base64", "media_type": mt, "data": data}} for mt, data in images
        ]
        content.append({"type": "text", "text": "Transcreva as posições destes prints de carteira."})
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=16000,
            system=EXTRACT_PROMPT,
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": EXTRACT_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": content}],
        )
        if self.usage:
            self.usage.record("carteira_leitura", response)
        if response.stop_reason == "refusal":
            return {"broker": None, "holdings": [], "section_totals": [],
                    "warnings": ["A IA não conseguiu ler estes prints. Tente outro recorte ou digite as posições."]}
        if response.stop_reason == "max_tokens":
            raise ValueError("Carteira grande demais para uma leitura só. Envie menos prints por vez.")
        text = next((b.text for b in response.content if b.type == "text"), "{}")
        data = json.loads(text)
        data["holdings"] = clean_holdings(data.get("holdings", []))
        return data

    async def explain(self, analysis: dict, advisor_on: bool, level_note: str) -> str:
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=3000,
            system=analysis_system(advisor_on, level_note),
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": "Analise esta carteira.\n\n"
                       + json.dumps(slim_analysis(analysis), ensure_ascii=False)}],
        )
        if self.usage:
            self.usage.record("carteira_analise", response)
        if response.stop_reason == "refusal":
            return "Não foi possível gerar a análise da carteira agora."
        return "".join(b.text for b in response.content if b.type == "text").strip()
