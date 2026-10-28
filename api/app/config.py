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

    web_origin: str = "http://localhost:3000"

    # Usa dados sintéticos (sem brapi nem BCB). Útil para desenvolvimento e demonstração.
    demo_mode: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
