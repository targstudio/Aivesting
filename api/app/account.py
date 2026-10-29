"""Conta com login por link mágico (Supabase Auth) para guardar carteira, alertas, perfil e preferências.

O navegador não fala com o Supabase: a API repassa o pedido de link e a renovação de sessão, e confere o token de
cada pessoa no Supabase Auth antes de ler ou gravar a linha dela na tabela user_data (só a API acessa a tabela).
"""

import time

import httpx
from pydantic import BaseModel, Field


class SignInRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    redirect_to: str = Field(max_length=300)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=2000)


class AccountData(BaseModel):
    # Cópia das chaves do navegador (carteira, alertas, perfil do assessor, preferências), como texto JSON.
    data: dict[str, str] = Field(max_length=10)
    updated_at: str = Field(max_length=40)


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class AccountService:
    def __init__(self, url: str, secret_key: str, client: httpx.AsyncClient | None = None):
        self.url = url.rstrip("/")
        self.key = secret_key
        self.client = client or httpx.AsyncClient(timeout=20)
        self._users: dict[str, tuple[float, dict]] = {}

    def _headers(self, token: str | None = None) -> dict:
        return {"apikey": self.key, "Authorization": f"Bearer {token or self.key}", "Content-Type": "application/json"}

    async def send_link(self, email: str, redirect_to: str) -> None:
        resp = await self.client.post(
            f"{self.url}/auth/v1/otp",
            params={"redirect_to": redirect_to},
            headers=self._headers(),
            json={"email": email, "create_user": True},
        )
        if resp.status_code == 429:
            raise AuthError(429, "Muitos pedidos de link. Espere alguns minutos e tente de novo.")
        if resp.status_code >= 400:
            raise AuthError(502, "Não foi possível enviar o link agora. Tente de novo em instantes.")

    async def refresh(self, refresh_token: str) -> dict:
        resp = await self.client.post(
            f"{self.url}/auth/v1/token",
            params={"grant_type": "refresh_token"},
            headers=self._headers(),
            json={"refresh_token": refresh_token},
        )
        if resp.status_code >= 400:
            raise AuthError(401, "Sessão expirada. Entre de novo.")
        body = resp.json()
        return {k: body.get(k) for k in ("access_token", "refresh_token", "expires_in")} | {
            "email": (body.get("user") or {}).get("email")
        }

    async def user(self, token: str) -> dict:
        """Confere o token no Supabase Auth (cache de 5 minutos por token)."""
        hit = self._users.get(token)
        if hit and time.monotonic() - hit[0] < 300:
            return hit[1]
        resp = await self.client.get(f"{self.url}/auth/v1/user", headers=self._headers(token))
        if resp.status_code != 200:
            raise AuthError(401, "Sessão expirada. Entre de novo.")
        body = resp.json()
        user = {"id": body["id"], "email": body.get("email")}
        if len(self._users) > 5000:
            self._users.clear()
        self._users[token] = (time.monotonic(), user)
        return user

    async def load(self, user_id: str) -> dict | None:
        resp = await self.client.get(
            f"{self.url}/rest/v1/user_data",
            headers=self._headers(),
            params={"user_id": f"eq.{user_id}", "select": "data,updated_at"},
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None

    async def save(self, user_id: str, data: dict[str, str], updated_at: str) -> None:
        resp = await self.client.post(
            f"{self.url}/rest/v1/user_data",
            headers={**self._headers(), "Prefer": "resolution=merge-duplicates"},
            json={"user_id": user_id, "data": data, "updated_at": updated_at},
        )
        resp.raise_for_status()
