import json

import httpx
from fastapi.testclient import TestClient

from app.account import AccountService
from app.config import Settings
from app.main import create_app

USER = {"id": "11111111-1111-1111-1111-111111111111", "email": "ana@exemplo.com"}


def fake_supabase(store: dict, calls: list):
    def handler(request: httpx.Request):
        calls.append((request.method, request.url.path, dict(request.url.params)))
        path = request.url.path
        if path == "/auth/v1/otp":
            return httpx.Response(200, json={})
        if path == "/auth/v1/user":
            ok = request.headers["authorization"] == "Bearer token-bom"
            return httpx.Response(200, json=USER) if ok else httpx.Response(401, json={})
        if path == "/rest/v1/user_data" and request.method == "GET":
            return httpx.Response(200, json=[store[USER["id"]]] if USER["id"] in store else [])
        if path == "/rest/v1/user_data" and request.method == "POST":
            body = json.loads(request.content)
            store[body["user_id"]] = {"data": body["data"], "updated_at": body["updated_at"]}
            return httpx.Response(201)
        return httpx.Response(404)

    return handler


def client(store, calls):
    app = create_app(Settings(_env_file=None, demo_mode=True, web_origin="https://app.exemplo.com"), start_scheduler=False)
    transport = httpx.MockTransport(fake_supabase(store, calls))
    app.state.accounts = AccountService("https://sb.exemplo.co", "segredo", client=httpx.AsyncClient(transport=transport))
    return TestClient(app)


def test_sign_in_only_redirects_to_own_site():
    calls = []
    c = client({}, calls)
    ok = c.post("/conta/entrar", json={"email": "Ana@Exemplo.com", "redirect_to": "https://app.exemplo.com/entrar"})
    assert ok.status_code == 200
    assert calls[0][1] == "/auth/v1/otp" and calls[0][2]["redirect_to"] == "https://app.exemplo.com/entrar"
    bad = c.post("/conta/entrar", json={"email": "ana@exemplo.com", "redirect_to": "https://malicioso.com/entrar"})
    assert bad.status_code == 400


def test_data_round_trip_requires_valid_token():
    store, calls = {}, []
    c = client(store, calls)
    assert c.get("/conta/dados").status_code == 401
    assert c.get("/conta/dados", headers={"Authorization": "Bearer ruim"}).status_code == 401
    h = {"Authorization": "Bearer token-bom"}
    assert c.get("/conta/dados", headers=h).json() == {"email": USER["email"], "data": {}, "updated_at": None}
    payload = {"data": {"aivesting.alerts": "[]"}, "updated_at": "2026-10-29T01:00:00Z"}
    assert c.put("/conta/dados", headers=h, json=payload).status_code == 200
    assert c.get("/conta/dados", headers=h).json()["data"] == {"aivesting.alerts": "[]"}
    # O token é conferido uma vez e fica em cache.
    assert sum(1 for m, p, _ in calls if p == "/auth/v1/user" and m == "GET") == 2  # o ruim e o bom


def test_without_database_login_is_off():
    c = TestClient(create_app(Settings(_env_file=None, demo_mode=True), start_scheduler=False))
    assert c.post("/conta/entrar", json={"email": "a@b.com", "redirect_to": "http://localhost:3000"}).status_code == 503
