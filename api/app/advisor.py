"""Modo assessor: perfil do investidor (suitability) e plano de alocação entre classes de ativos.

O plano é calculado por regras fixas e transparentes (perfil, prazo, reserva de emergência e juro real). A IA explica
o plano e responde dúvidas sobre ele; ela não inventa a alocação.
"""

from typing import Literal

from pydantic import BaseModel, Field

Profile = Literal["conservador", "moderado", "arrojado"]


class ProfileAnswers(BaseModel):
    # Índices das opções do questionário (ver QUESTIONS).
    objetivo: int = Field(ge=0, le=2)
    prazo: int = Field(ge=0, le=3)
    reacao_queda: int = Field(ge=0, le=2)
    experiencia: int = Field(ge=0, le=2)
    oscilacao: int = Field(ge=0, le=2)


QUESTIONS = [
    {"key": "objetivo", "label": "Qual é o seu principal objetivo com esse dinheiro?",
     "options": ["Preservar o que já tenho", "Crescer com equilíbrio e alguma renda", "Fazer o patrimônio crescer o máximo possível"]},
    {"key": "prazo", "label": "Quando você pretende usar a maior parte desse dinheiro?",
     "options": ["Em menos de 1 ano", "Entre 1 e 3 anos", "Entre 3 e 5 anos", "Daqui a mais de 5 anos"]},
    {"key": "reacao_queda", "label": "Se seus investimentos caíssem 20% em um mês, o que você faria?",
     "options": ["Resgataria tudo para não perder mais", "Esperaria a recuperação", "Aproveitaria para investir mais"]},
    {"key": "experiencia", "label": "Com quais investimentos você já tem experiência?",
     "options": ["Nenhum ou só poupança", "Renda fixa (Tesouro, CDB)", "Ações, FIIs ou fundos de ações"]},
    {"key": "oscilacao", "label": "Quanto do seu patrimônio pode oscilar bastante sem afetar sua vida?",
     "options": ["Menos de 10%", "Entre 10% e 30%", "Mais de 30%"]},
]


def classify(a: ProfileAnswers) -> tuple[Profile, int]:
    score = a.objetivo * 2 + a.prazo + a.reacao_queda * 2 + a.experiencia + a.oscilacao * 2  # 0 a 17
    profile: Profile = "conservador" if score <= 6 else "moderado" if score <= 11 else "arrojado"
    # Travas: dinheiro para menos de 1 ano não vai para renda variável; quem resgataria tudo numa queda não é arrojado.
    if a.prazo == 0:
        profile = "conservador"
    elif a.reacao_queda == 0 and profile == "arrojado":
        profile = "moderado"
    return profile, score


CLASSES = {
    "reserva": {
        "label": "Reserva de emergência",
        "risk": "Muito baixo",
        "products": ["Tesouro Selic", "CDB de liquidez diária pagando 100% do CDI ou mais"],
        "why": "Dinheiro para imprevistos, com resgate no mesmo dia e sem risco de perder valor.",
    },
    "rf_pos": {
        "label": "Renda fixa pós-fixada",
        "risk": "Baixo",
        "products": ["CDB de banco grande (até R$ 250 mil por banco no FGC)", "LCI e LCA (isentas de IR)", "Tesouro Selic"],
        "why": "Acompanha o CDI: com a Selic alta, rende bem com pouca oscilação.",
    },
    "rf_ipca": {
        "label": "Renda fixa atrelada à inflação",
        "risk": "Baixo a médio (oscila se vendida antes do vencimento)",
        "products": ["Tesouro IPCA+ com vencimento próximo do seu prazo", "Debêntures incentivadas (isentas de IR)"],
        "why": "Protege o poder de compra e trava um juro real; ideal quando o prazo combina com o vencimento.",
    },
    "acoes": {
        "label": "Ações brasileiras",
        "risk": "Alto",
        "products": ["ETF do Ibovespa (BOVA11)", "Ações de empresas grandes, diversificadas por setor"],
        "why": "Maior potencial de retorno no longo prazo, com quedas fortes no caminho.",
    },
    "fiis": {
        "label": "Fundos imobiliários",
        "risk": "Médio a alto",
        "products": ["FIIs de logística, shoppings e papel (recebíveis)", "ETF de FIIs (XFIX11)"],
        "why": "Renda mensal isenta de IR para pessoa física, com cotas que oscilam.",
    },
    "internacional": {
        "label": "Dólar e exterior",
        "risk": "Médio a alto",
        "products": ["ETF do S&P 500 em reais (IVVB11)", "BDRs de ETFs globais", "Conta em dólar para objetivos no exterior"],
        "why": "Diversifica fora do Brasil e protege contra a alta do dólar.",
    },
}

# Pesos (%) do que sobra depois da reserva de emergência.
WEIGHTS: dict[str, dict[str, int]] = {
    "conservador": {"rf_pos": 55, "rf_ipca": 30, "acoes": 5, "fiis": 5, "internacional": 5},
    "moderado": {"rf_pos": 35, "rf_ipca": 20, "acoes": 20, "fiis": 10, "internacional": 15},
    "arrojado": {"rf_pos": 15, "rf_ipca": 15, "acoes": 35, "fiis": 15, "internacional": 20},
}

REAL_RATE_HIGH = 6.0  # % a.a. de juro real (Selic menos IPCA 12 meses) a partir do qual a renda fixa ganha peso
TILT = 5


class PlanRequest(BaseModel):
    answers: ProfileAnswers
    amount: float = Field(gt=0, le=1e10, description="Quanto a pessoa quer investir agora, em R$")
    monthly_contribution: float = Field(default=0, ge=0, le=1e9)
    monthly_expenses: float = Field(default=0, ge=0, le=1e9)
    has_reserve: bool = False


def build_plan(req: PlanRequest, macro: dict[str, float], examples: dict[str, list[dict]] | None = None) -> dict:
    """`macro` tem selic e ipca_12m em % a.a.; `examples` traz ativos do app para ações e FIIs."""
    profile, score = classify(req.answers)
    weights = dict(WEIGHTS[profile])
    notes: list[str] = []

    selic, ipca = macro.get("selic"), macro.get("ipca_12m")
    real_rate = round(selic - ipca, 2) if selic is not None and ipca is not None else None
    if real_rate is not None and real_rate >= REAL_RATE_HIGH and profile != "conservador":
        weights["acoes"] -= TILT
        weights["rf_ipca"] += TILT
        rate = f"{real_rate:.1f}".replace(".", ",")
        notes.append(
            f"Juro real alto ({rate}% ao ano acima da inflação): {TILT} pontos saem de ações e vão para "
            "renda fixa atrelada à inflação."
        )

    reserve = 0.0
    if not req.has_reserve:
        target = req.monthly_expenses * 6 if req.monthly_expenses else req.amount * 0.2
        reserve = min(req.amount, target)
        notes.append(
            "Você ainda não tem reserva de emergência: o primeiro passo é separar "
            + ("6 meses de gastos" if req.monthly_expenses else "uma parte (20%) até saber seus gastos mensais")
            + " em aplicações de resgate imediato."
        )
    rest = req.amount - reserve

    allocations = []
    if reserve:
        allocations.append(("reserva", reserve))
    for key, pct in weights.items():
        if pct > 0:
            allocations.append((key, rest * pct / 100))

    cdi = round(selic - 0.1, 2) if selic is not None else None
    items = []
    for key, value in allocations:
        info = CLASSES[key]
        items.append({
            "key": key,
            "label": info["label"],
            "value": round(value, 2),
            "pct": round(100 * value / req.amount, 1),
            "risk": info["risk"],
            "why": info["why"],
            "products": info["products"],
            "examples": (examples or {}).get(key, []),
        })
    contribution = None
    if req.monthly_contribution:
        contribution = [
            {"key": k, "label": CLASSES[k]["label"], "value": round(req.monthly_contribution * p / 100, 2)}
            for k, p in weights.items() if p > 0
        ]
    return {
        "profile": profile,
        "score": score,
        "amount": req.amount,
        "allocation": items,
        "monthly_contribution": contribution,
        "variable_income_pct": round(sum(i["pct"] for i in items if i["key"] in ("acoes", "fiis", "internacional")), 1),
        "macro": {"selic": selic, "ipca_12m": ipca, "juro_real": real_rate, "cdi_estimado": cdi},
        "notes": notes,
    }


def horizon_for(prazo: int) -> int:
    return {0: 1, 1: 1, 2: 3, 3: 10}[prazo]
