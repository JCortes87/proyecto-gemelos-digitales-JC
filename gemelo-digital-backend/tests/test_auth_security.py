"""Tests de los endurecimientos de autenticación:
- LTI: el id_token solo se acepta firmado con RS256 (nunca el alg del header).
- OAuth: el state debe ser auténtico, vigente y coincidir con la cookie nonce.
- Logout: invalida la sesión enviada por Bearer además de la cookie.
"""
import base64
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm

from app.api import auth_routes as ar
from app.api import lti


# ──────────────────────────────────────────────────────────────────────────
# LTI launch
# ──────────────────────────────────────────────────────────────────────────
ISS = "https://plataforma.test"
CLIENT = "client-123"
KID = "kid-1"


@pytest.fixture
def lti_client(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})

    async def fake_jwks(force=False):
        return {"keys": [jwk]}

    monkeypatch.setattr(lti, "_get_platform_jwks", fake_jwks)
    monkeypatch.setattr(lti, "TOOL_BASE_URL", "https://tool.test")
    monkeypatch.setattr(lti, "LTI_CLIENT_ID", CLIENT)
    monkeypatch.setattr(lti, "LTI_ISSUER", ISS)
    monkeypatch.setattr(lti, "LTI_DEPLOYMENT_ID", "")

    app = FastAPI()
    app.include_router(lti.router)
    return TestClient(app), private_key


def _launch(client, id_token, nonce):
    state = lti._make_state({"nonce": nonce, "ts": int(time.time()), "client_id": CLIENT})
    return client.post(
        "/lti/launch",
        data={"id_token": id_token, "state": state},
        follow_redirects=False,
    )


def _claims(nonce):
    now = int(time.time())
    return {
        "iss": ISS, "aud": CLIENT, "sub": "u1", "nonce": nonce,
        "iat": now, "exp": now + 300,
        "https://purl.imsglobal.org/spec/lti/claim/context": {"id": "777"},
    }


def test_lti_acepta_rs256_valido(lti_client):
    client, key = lti_client
    token = jwt.encode(_claims("n1"), key, algorithm="RS256", headers={"kid": KID})
    r = _launch(client, token, "n1")
    assert r.status_code == 302
    assert "org_unit_id=777" in r.headers["location"]


def test_lti_rechaza_alg_distinto_de_rs256(lti_client):
    client, _ = lti_client
    # Ataque clásico: firmar con HS256 y declarar ese alg en el header.
    token = jwt.encode(_claims("n2"), "secreto-cualquiera-de-al-menos-32-bytes", algorithm="HS256", headers={"kid": KID})
    r = _launch(client, token, "n2")
    assert r.status_code == 400
    assert r.json()["detail"] == "unsupported jwt alg"


def test_lti_no_filtra_detalle_del_error(lti_client):
    client, key = lti_client
    claims = _claims("n3")
    claims["aud"] = "otro-cliente"
    token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": KID})
    r = _launch(client, token, "n3")
    assert r.status_code == 401
    assert r.json() == {"detail": "jwt validation failed"}


# ──────────────────────────────────────────────────────────────────────────
# OAuth state
# ──────────────────────────────────────────────────────────────────────────
class TestOAuthState:
    def test_roundtrip(self):
        state = ar._make_oauth_state("nonce-1", "/dashboard", "123")
        payload = ar._read_oauth_state(state)
        assert payload["s"] == "nonce-1"
        assert payload["next"] == "/dashboard"
        assert payload["ou"] == "123"

    def test_rechaza_ausente_o_basura(self):
        assert ar._read_oauth_state(None) is None
        assert ar._read_oauth_state("") is None
        assert ar._read_oauth_state("no-es-base64!!") is None

    def test_rechaza_firma_alterada(self):
        state = ar._make_oauth_state("n", "", "")
        pad = "=" * ((4 - len(state) % 4) % 4)
        raw, sig = base64.urlsafe_b64decode(state + pad).decode().rsplit("|||", 1)
        tampered_raw = raw.replace('"ou": ""', '"ou": "999"')
        forged = base64.urlsafe_b64encode(f"{tampered_raw}|||{sig}".encode()).decode().rstrip("=")
        assert ar._read_oauth_state(forged) is None

    def test_rechaza_expirado(self, monkeypatch):
        state = ar._make_oauth_state("n", "", "")
        real_time = time.time
        monkeypatch.setattr(ar.time, "time", lambda: real_time() + ar.OAUTH_STATE_TTL_SECONDS + 5)
        assert ar._read_oauth_state(state) is None


@pytest.fixture
def auth_client(monkeypatch):
    monkeypatch.setattr(ar, "CLIENT_ID", "cid")
    monkeypatch.setattr(ar, "CLIENT_SECRET", "csecret")
    monkeypatch.setattr(ar, "REDIRECT_URI", "https://tool.test/auth/brightspace/callback")
    app = FastAPI()
    app.include_router(ar.router)
    return TestClient(app, base_url="https://testserver")


def test_login_emite_cookie_nonce_ligada_al_state(auth_client):
    r = auth_client.get("/auth/brightspace/login", follow_redirects=False)
    assert r.status_code == 307
    nonce = r.cookies.get(ar.OAUTH_NONCE_COOKIE)
    assert nonce
    state = r.headers["location"].split("state=")[1].split("&")[0]
    assert ar._read_oauth_state(state)["s"] == nonce


def test_callback_sin_state_valido_responde_400(auth_client):
    r = auth_client.get("/auth/brightspace/callback?code=abc&state=falso")
    assert r.status_code == 400


def test_callback_con_cookie_que_no_coincide_responde_400(auth_client):
    state = ar._make_oauth_state("nonce-real", "", "")
    auth_client.cookies.set(ar.OAUTH_NONCE_COOKIE, "nonce-del-atacante")
    r = auth_client.get(f"/auth/brightspace/callback?code=abc&state={state}")
    assert r.status_code == 400


# ──────────────────────────────────────────────────────────────────────────
# Logout
# ──────────────────────────────────────────────────────────────────────────
def test_logout_invalida_sesion_bearer_y_cookie(auth_client, monkeypatch):
    deleted = []
    monkeypatch.setattr(ar, "delete_session", deleted.append)
    auth_client.cookies.set(ar.SESSION_COOKIE, "sid-cookie")
    r = auth_client.post("/auth/logout", headers={"Authorization": "Bearer sid-bearer"})
    assert r.status_code == 200
    assert sorted(deleted) == ["sid-bearer", "sid-cookie"]


def test_logout_sin_sesion_no_falla(auth_client, monkeypatch):
    deleted = []
    monkeypatch.setattr(ar, "delete_session", deleted.append)
    r = auth_client.post("/auth/logout")
    assert r.status_code == 200
    assert deleted == []
