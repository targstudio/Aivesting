"""Conta (Supabase Auth) para guardar carteira, alertas, perfil e preferências: Google, e-mail e senha ou link no e-mail.

O navegador não fala com o Supabase: a API repassa cadastro, login, link, troca de senha e renovação de sessão, e
confere o token de cada pessoa no Supabase Auth antes de ler ou gravar a linha dela na tabela user_data (só a API
acessa a tabela). O Google volta direto para o site com a sessão no endereço, como o link do e-mail.
"""

import time

import httpx
from pydantic import BaseModel, Field


class SignInRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    redirect_to: str = Field(max_length=300)


class PasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=200)
    redirect_to: str = Field(default="", max_length=300)


class NewPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=200)


OAUTH_PROVIDERS = ("google",)


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
        self._providers: tuple[float, dict[str, bool]] | None = None

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

    @staticmethod
    def _session(body: dict) -> dict:
        return {k: body.get(k) for k in ("access_token", "refresh_token", "expires_in")} | {
            "email": (body.get("user") or {}).get("email")
        }

    def oauth_url(self, provider: str, redirect_to: str) -> str:
        return str(httpx.URL(f"{self.url}/auth/v1/authorize", params={"provider": provider, "redirect_to": redirect_to}))

    async def providers(self) -> dict[str, bool]:
        """Quais formas de entrar estão ligadas no painel do Supabase (cache de 10 minutos)."""
        if self._providers and time.monotonic() - self._providers[0] < 600:
            return self._providers[1]
        resp = await self.client.get(f"{self.url}/auth/v1/settings", headers=self._headers())
        external = resp.json().get("external", {}) if resp.status_code == 200 else {}
        result = {"email": bool(external.get("email", True))} | {p: bool(external.get(p)) for p in OAUTH_PROVIDERS}
        self._providers = (time.monotonic(), result)
        return result

    async def sign_up(self, email: str, password: str, redirect_to: str) -> dict | None:
        """Cria a conta. Devolve a sessão, ou None quando o Supabase pede para confirmar o e-mail primeiro."""
        resp = await self.client.post(
            f"{self.url}/auth/v1/signup",
            params={"redirect_to": redirect_to},
            headers=self._headers(),
            json={"email": email, "password": password},
        )
        if resp.status_code == 429:
            raise AuthError(429, "Muitos cadastros agora. Espere alguns minutos e tente de novo.")
        if resp.status_code == 422 and "already" in resp.text:
            raise AuthError(409, "Esse e-mail já tem conta. Use Entrar.")
        if resp.status_code == 422 and "password" in resp.text.lower():
            raise AuthError(400, "Senha fraca. Use pelo menos 8 caracteres, com letras e números.")
        if resp.status_code >= 400:
            raise AuthError(502, "Não foi possível criar a conta agora. Tente de novo em instantes.")
        body = resp.json()
        return self._session(body) if body.get("access_token") else None

    async def sign_in_password(self, email: str, password: str) -> dict:
        resp = await self.client.post(
            f"{self.url}/auth/v1/token",
            params={"grant_type": "password"},
            headers=self._headers(),
            json={"email": email, "password": password},
        )
        if resp.status_code == 429:
            raise AuthError(429, "Muitas tentativas. Espere alguns minutos e tente de novo.")
        if resp.status_code == 400 and "not confirmed" in resp.text.lower():
            raise AuthError(403, "Confirme seu e-mail primeiro: abra o link que mandamos quando você criou a conta.")
        if resp.status_code in (400, 401):
            raise AuthError(401, "E-mail ou senha incorretos.")
        if resp.status_code >= 400:
            raise AuthError(502, "Não foi possível entrar agora. Tente de novo em instantes.")
        return self._session(resp.json())

    async def send_recovery(self, email: str, redirect_to: str) -> None:
        resp = await self.client.post(
            f"{self.url}/auth/v1/recover",
            params={"redirect_to": redirect_to},
            headers=self._headers(),
            json={"email": email},
        )
        if resp.status_code == 429:
            raise AuthError(429, "Muitos pedidos. Espere alguns minutos e tente de novo.")
        if resp.status_code >= 400:
            raise AuthError(502, "Não foi possível enviar o e-mail agora. Tente de novo em instantes.")

    async def set_password(self, token: str, password: str) -> None:
        resp = await self.client.put(f"{self.url}/auth/v1/user", headers=self._headers(token), json={"password": password})
        if resp.status_code == 401:
            raise AuthError(401, "Sessão expirada. Peça um novo e-mail de troca de senha.")
        if resp.status_code == 422:
            raise AuthError(400, "Senha fraca ou igual à anterior. Escolha outra com pelo menos 8 caracteres.")
        if resp.status_code >= 400:
            raise AuthError(502, "Não foi possível trocar a senha agora.")

    async def refresh(self, refresh_token: str) -> dict:
        resp = await self.client.post(
            f"{self.url}/auth/v1/token",
            params={"grant_type": "refresh_token"},
            headers=self._headers(),
            json={"refresh_token": refresh_token},
        )
        if resp.status_code >= 400:
            raise AuthError(401, "Sessão expirada. Entre de novo.")
        return self._session(resp.json())

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
