"""Middleware de refresh: un endpoint que lee el token de forma síncrona
(get_access_token) debe ver un token vigente aunque el de la sesión hubiera
vencido, siempre que haya refresh_token."""
import time

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app import state
from app.services import brightspace_client as bc
from app.token_refresh import TokenRefreshMiddleware


@pytest.fixture
def app_y_mint(monkeypatch):
    state.SESSION_STORE.clear()
    llamadas = []
    resultado = {"valor": {"access_token": "tok-nuevo", "expires_at": time.time() + 3600}}

    async def fake_mint(refresh_token, timeout=15):
        llamadas.append(refresh_token)
        return resultado["valor"]

    monkeypatch.setattr(bc, "mint_access_token_from_refresh", fake_mint)

    app = FastAPI()
    app.add_middleware(TokenRefreshMiddleware)

    @app.get("/gemelo/token")
    def token(request: Request):
        sid = request.headers["authorization"][7:]
        return {"token": state.get_access_token(sid)}

    yield TestClient(app), llamadas, resultado
    state.SESSION_STORE.clear()


def _sesion(expira_en, refresh="ref-1"):
    state.save_session("sid-1", {"access_token": "tok-viejo", "refresh_token": refresh,
                                 "expires_in": 3600})
    state.SESSION_STORE["sid-1"]["expires_at"] = time.time() + expira_en


def test_token_vencido_se_refresca_antes_del_handler(app_y_mint):
    client, llamadas, _ = app_y_mint
    _sesion(-60)
    r = client.get("/gemelo/token", headers={"Authorization": "Bearer sid-1"})
    assert r.json() == {"token": "tok-nuevo"}
    assert llamadas == ["ref-1"]


def test_token_vigente_no_se_refresca(app_y_mint):
    client, llamadas, _ = app_y_mint
    _sesion(3000)
    r = client.get("/gemelo/token", headers={"Authorization": "Bearer sid-1"})
    assert r.json() == {"token": "tok-viejo"}
    assert llamadas == []


def test_si_el_refresh_falla_el_token_vencido_no_se_usa(app_y_mint):
    client, llamadas, resultado = app_y_mint
    resultado["valor"] = None
    _sesion(-60)
    r = client.get("/gemelo/token", headers={"Authorization": "Bearer sid-1"})
    assert r.json() == {"token": None}
    assert llamadas == ["ref-1"]


def test_rutas_publicas_no_disparan_refresh(app_y_mint):
    client, llamadas, _ = app_y_mint
    _sesion(-60)

    client.app.get("/health")(lambda: {"ok": True})
    client.get("/health", headers={"Authorization": "Bearer sid-1"})
    assert llamadas == []
