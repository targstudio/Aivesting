"""Treinadora da jornada: um resumo do mês que incentiva o hábito de guardar, sem recomendar ativos."""

import json

from pydantic import BaseModel, Field

COACH_PROMPT = """Você é a treinadora do StockTower, um app brasileiro que ajuda quem não entende de mercado financeiro a criar
o hábito de investir e fazer o patrimônio crescer. Escreva em português do Brasil, para um leigo, num tom caloroso e direto.

Use apenas os dados da jornada em JSON. Não invente números. Não cite ações, fundos ou títulos específicos, não diga para
comprar ou vender nada e não prometa rentabilidade. Elogie a constância (guardar todo mês, ter reserva, diversificar), nunca
ganhos de curto prazo. Se a pessoa não guardou nada no mês, incentive sem culpa e sugira um valor pequeno para recomeçar."""

COACH_TASK = """Escreva o resumo do mês em até 3 parágrafos curtos, sem títulos e sem listas:
1) como foi o mês (quanto guardou, comparado ao mês anterior, e a sequência de meses);
2) quanto falta para o próximo nível e um valor por mês que levaria até lá em um prazo razoável;
3) a próxima missão e por que ela importa.

Dados da jornada:
{data}"""


class CoachRequest(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    level: int = Field(ge=1, le=20)
    level_name: str = Field(max_length=40)
    total: float = Field(ge=0)
    next_level_name: str | None = Field(default=None, max_length=40)
    to_next_level: float | None = Field(default=None, ge=0)
    streak_months: int = Field(ge=0, le=600)
    saved_this_month: float = Field(default=0, ge=0)
    saved_last_month: float = Field(default=0, ge=0)
    next_mission: str | None = Field(default=None, max_length=120)
    missions_done: int = Field(ge=0, le=50)
    missions_total: int = Field(ge=0, le=50)


def coach_task(body: CoachRequest) -> str:
    data = {
        "mes": body.month,
        "nivel": body.level,
        "nome_do_nivel": body.level_name,
        "patrimonio_reais": round(body.total, 2),
        "proximo_nivel": body.next_level_name,
        "falta_para_o_proximo_nivel_reais": body.to_next_level and round(body.to_next_level, 2),
        "meses_seguidos_guardando": body.streak_months,
        "guardou_este_mes_reais": round(body.saved_this_month, 2),
        "guardou_mes_passado_reais": round(body.saved_last_month, 2),
        "proxima_missao": body.next_mission,
        "missoes_cumpridas": f"{body.missions_done} de {body.missions_total}",
    }
    return COACH_TASK.format(data=json.dumps(data, ensure_ascii=False))
