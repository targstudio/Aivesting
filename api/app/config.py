from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Universo inicial: ações líquidas e FIIs grandes. Cada classe é ranqueada contra seus pares.
DEFAULT_STOCKS = [
    "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "ABEV3", "WEGE3", "B3SA3",
    "RENT3", "SUZB3", "PRIO3", "ELET3", "EQTL3", "RADL3", "GGBR4", "LREN3",
]
DEFAULT_FIIS = [
    "MXRF11", "HGLG11", "KNRI11", "XPML11", "VISC11", "BTLG11",
    "KNCR11", "HGRU11", "VILG11", "XPLG11", "CPTS11", "IRDM11",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Fonte de cotações: "brapi" (precisa de token; plano pago para o universo todo) ou
    # "yahoo" (gratuito, sem chave, uso não comercial).
    data_provider: str = "brapi"
    brapi_token: str = ""
    brapi_base_url: str = "https://brapi.dev/api"
    bcb_base_url: str = "https://api.bcb.gov.br/dados/serie"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"

    ranking_interval_minutes: int = 5
    # Horário do pregão (America/Sao_Paulo). Fora dele o ranking não é recalculado.
    market_open: str = "10:00"
    market_close: str = "18:00"
    run_outside_market_hours: bool = False

    stocks: list[str] = DEFAULT_STOCKS
    fiis: list[str] = DEFAULT_FIIS

    # Origens do front liberadas no CORS, separadas por vírgula (ex.: o domínio da Vercel).
    web_origin: str = "http://localhost:3000"

    # Protege POST /ranking/recompute em produção (header X-Admin-Token). Vazio = liberado (dev).
    admin_token: str = ""
    # Limite de chamadas à IA (chat e explicação) por IP a cada hora, para controlar custo.
    ai_requests_per_hour: int = 30

    # Supabase (opcional): com os dois preenchidos, cada ranking é gravado no banco.
    supabase_url: str = ""
    supabase_secret_key: str = ""

    # Resultado calibrado do modelo de horizontes (1, 3, 5 e 10 anos). Vazio = api/data/longterm.json.
    longterm_path: str = ""

    # Usa dados sintéticos (sem brapi nem BCB). Útil para desenvolvimento e demonstração.
    demo_mode: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
