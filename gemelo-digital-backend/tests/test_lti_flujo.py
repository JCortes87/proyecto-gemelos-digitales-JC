"""Flujo LTI 1.3 completo: /lti/login (OIDC initiation) arma el redirect de
autorización con un state firmado; /lti/launch rechaza replays, states
vencidos, nonce distinto y deployment_id incorrecto; /lti/session lee la
cookie que deja el launch. (RS256 vs HS256 y el ocultamiento del detalle de
errores JWT ya están en test_auth_security.py.)"""
import json
import time
import urllib.parse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm

from app.api import lti

ISS = "https://plataforma.test"
CLIENT = "client-123"
KID = "kid-1"
AUTH_ENDPOINT = "https://plataforma.test/d2l/lti/authenticate"
DEPLOY_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id"


@pytest.fixture
def lti_env(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})

    async def fake_jwks(force=False):
        return {"keys": [jwk]}

    monkeypatch.setattr(lti, "_get_platform_jwks", fake_jwks)
    monkeypatch.setattr(lti, "TOOL_BASE_URL", "https://tool.test")
    monkeypatch.setattr(lti, "LTI_CLIENT_ID", CLIENT)
    monkeypatch.setattr(lti, "LTI_ISSUER", ISS)
    monkeypatch.setattr(lti, "LTI_AUTH_ENDPOINT", AUTH_ENDPOINT)
    monkeypatch.setattr(lti, "LTI_DEPLOYMENT_ID", "")
    lti.STATE_STORE.clear()
    lti.CONSUMED_STATES.clear()

    app = FastAPI()
    app.include_router(lti.router)
    yield TestClient(app, base_url="https://testserver"), private_key
    lti.STATE_STORE.clear()
    lti.CONSUMED_STATES.clear()


def _claims(nonce, **extra):
    now = int(time.time())
    c = {
        "iss": ISS, "aud": CLIENT, "sub": "u1", "nonce": nonce,
        "iat": now, "exp": now + 300,
        "name": "Ana Pérez", "email": "ana@cesa.edu.co",
        "https://purl.imsglobal.org/spec/lti/claim/context": {"id": "777", "title": "Finanzas"},
        "https://purl.imsglobal.org/spec/lti/claim/roles": [
            "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
        ],
    }
    c.update(extra)
    return c


def _token(key, claims):
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": KID})


def _state(nonce, ts=None):
    return lti._make_state({"nonce": nonce, "ts": ts or int(time.time()), "client_id": CLIENT})


def _launch(client, id_token, state):
    return client.post("/lti/launch", data={"id_token": id_token, "state": state},
                       follow_redirects=False)


# ──────────────────────────────────────────────────────────────────────────
# /lti/login
# ──────────────────────────────────────────────────────────────────────────
def test_login_arma_redirect_oidc_con_state_firmado(lti_env):
    client, _ = lti_env
    r = client.post("/lti/login", data={
        "iss": ISS + "/", "login_hint": "hint-1", "lti_message_hint": "msg-1",
        "target_link_uri": "https://tool.test/lti/launch", "lti_storage_target": "_parent",
    }, follow_redirects=False)
    assert r.status_code == 302
    url = urllib.parse.urlsplit(r.headers["location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == AUTH_ENDPOINT
    q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
    assert q["scope"] == "openid"
    assert q["response_type"] == "id_token"
    assert q["response_mode"] == "form_post"
    assert q["prompt"] == "none"
    assert q["client_id"] == CLIENT
    assert q["redirect_uri"] == "https://tool.test/lti/launch"
    assert q["login_hint"] == "hint-1"
    assert q["lti_message_hint"] == "msg-1"
    assert q["lti_storage_target"] == "_parent"

    payload = lti._read_state(q["state"])
    assert payload is not None, "el state debe ir firmado con LTI_STATE_SECRET"
    assert payload["nonce"] == q["nonce"]
    assert payload["client_id"] == CLIENT and payload["iss"] == ISS
    assert q["state"] in lti.STATE_STORE


def test_login_por_get_usa_client_id_por_defecto(lti_env):
    client, _ = lti_env
    r = client.get("/lti/login?login_hint=h", follow_redirects=False)
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(r.headers["location"]).query)
    assert q["client_id"] == [CLIENT]
    assert q["target_link_uri"] == ["https://tool.test/lti/launch"]
    assert "lti_message_hint" not in q


def test_login_state_alterado_no_valida(lti_env):
    client, _ = lti_env
    r = client.get("/lti/login?login_hint=h", follow_redirects=False)
    state = urllib.parse.parse_qs(urllib.parse.urlsplit(r.headers["location"]).query)["state"][0]
    token, sig = state.split(".", 1)
    assert lti._read_state(token + "." + sig[::-1]) is None


def test_login_rechaza_issuer_ajeno(lti_env):
    client, _ = lti_env
    r = client.post("/lti/login", data={"iss": "https://otra.test", "login_hint": "h"},
                    follow_redirects=False)
    assert r.status_code == 400
    assert "issuer" in r.json()["detail"]


def test_login_sin_login_hint(lti_env):
    client, _ = lti_env
    r = client.post("/lti/login", data={"iss": ISS}, follow_redirects=False)
    assert r.status_code == 400
    assert r.json()["detail"] == "missing login_hint"


def test_login_sin_configuracion(lti_env, monkeypatch):
    client, _ = lti_env
    monkeypatch.setattr(lti, "LTI_CLIENT_ID", "")
    assert client.get("/lti/login?login_hint=h").status_code == 500


# ──────────────────────────────────────────────────────────────────────────
# /lti/launch
# ──────────────────────────────────────────────────────────────────────────
def test_flujo_completo_login_launch_session(lti_env):
    client, key = lti_env
    r = client.get("/lti/login?login_hint=h", follow_redirects=False)
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(r.headers["location"]).query)
    state, nonce = q["state"][0], q["nonce"][0]

    r = _launch(client, _token(key, _claims(nonce)), state)
    assert r.status_code == 302
    assert r.headers["location"] == "https://tool.test/auth/brightspace/login?org_unit_id=777"
    assert state in lti.CONSUMED_STATES and state not in lti.STATE_STORE

    # La cookie de sesión LTI queda en el cliente y /lti/session la lee.
    assert client.cookies.get(lti.LTI_SESSION_COOKIE)
    s = client.get("/lti/session").json()
    assert s["authenticated"] is True
    ses = s["session"]
    assert ses["orgUnitId"] == "777"
    assert ses["contextTitle"] == "Finanzas"
    assert ses["isInstructor"] is True
    assert ses["userSub"] == "u1"
    assert ses["name"] == "Ana Pérez"
    assert ses["aud"] == CLIENT and ses["iss"] == ISS


def test_launch_replay_rechazado(lti_env):
    client, key = lti_env
    state = _state("n1")
    token = _token(key, _claims("n1"))
    assert _launch(client, token, state).status_code == 302
    r = _launch(client, token, state)
    assert r.status_code == 400
    assert r.json()["detail"] == "state already used"


def test_launch_fallido_no_consume_el_state(lti_env):
    client, key = lti_env
    state = _state("n1")
    assert _launch(client, _token(key, _claims("otro-nonce")), state).status_code == 401
    assert state not in lti.CONSUMED_STATES
    # Un launch válido posterior con el mismo state sí funciona.
    assert _launch(client, _token(key, _claims("n1")), state).status_code == 302


def test_launch_nonce_distinto(lti_env):
    client, key = lti_env
    r = _launch(client, _token(key, _claims("nonce-atacante")), _state("nonce-real"))
    assert r.status_code == 401
    assert r.json()["detail"] == "nonce mismatch"


def test_launch_state_vencido(lti_env):
    client, key = lti_env
    viejo = int(time.time()) - lti.STATE_TTL_SECONDS - 5
    r = _launch(client, _token(key, _claims("n1")), _state("n1", ts=viejo))
    assert r.status_code == 400
    assert r.json()["detail"] == "state expired"


def test_launch_state_con_firma_invalida(lti_env):
    client, key = lti_env
    falso = lti._make_signed_blob({"nonce": "n1", "ts": int(time.time())}, "otro-secreto")
    r = _launch(client, _token(key, _claims("n1")), falso)
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid state signature"


def test_launch_sin_id_token_o_state(lti_env):
    client, _ = lti_env
    r = client.post("/lti/launch", data={"state": "x"}, follow_redirects=False)
    assert r.status_code == 400 and r.json()["detail"] == "missing id_token"
    r = client.post("/lti/launch", data={"id_token": "x"}, follow_redirects=False)
    assert r.status_code == 400 and r.json()["detail"] == "missing state"


def test_launch_token_sin_kid(lti_env):
    client, key = lti_env
    token = jwt.encode(_claims("n1"), key, algorithm="RS256")
    r = _launch(client, token, _state("n1"))
    assert r.status_code == 400
    assert r.json()["detail"] == "missing kid in jwt header"


def test_launch_token_vencido(lti_env):
    client, key = lti_env
    now = int(time.time())
    token = _token(key, _claims("n1", iat=now - 1000, exp=now - 600))  # fuera del leeway de 120 s
    r = _launch(client, token, _state("n1"))
    assert r.status_code == 401


class TestDeploymentId:
    @pytest.fixture(autouse=True)
    def _con_deployment(self, lti_env, monkeypatch):
        # Depende de lti_env para aplicarse DESPUÉS de su LTI_DEPLOYMENT_ID="".
        monkeypatch.setattr(lti, "LTI_DEPLOYMENT_ID", "dep-1")

    def test_deployment_correcto(self, lti_env):
        client, key = lti_env
        r = _launch(client, _token(key, _claims("n1", **{DEPLOY_CLAIM: "dep-1"})), _state("n1"))
        assert r.status_code == 302

    def test_deployment_distinto(self, lti_env):
        client, key = lti_env
        r = _launch(client, _token(key, _claims("n1", **{DEPLOY_CLAIM: "dep-otro"})), _state("n1"))
        assert r.status_code == 401
        assert r.json()["detail"] == "deployment_id mismatch"

    def test_deployment_ausente(self, lti_env):
        client, key = lti_env
        r = _launch(client, _token(key, _claims("n1")), _state("n1"))
        assert r.status_code == 401
        assert r.json()["detail"] == "deployment_id mismatch"


def test_sin_deployment_configurado_no_se_exige(lti_env):
    client, key = lti_env
    r = _launch(client, _token(key, _claims("n1", **{DEPLOY_CLAIM: "cualquiera"})), _state("n1"))
    assert r.status_code == 302


def test_launch_sin_contexto_redirige_al_login_sin_org(lti_env):
    client, key = lti_env
    claims = _claims("n1")
    del claims["https://purl.imsglobal.org/spec/lti/claim/context"]
    claims["https://purl.imsglobal.org/spec/lti/claim/roles"] = ["Learner"]
    r = _launch(client, _token(key, claims), _state("n1"))
    assert r.headers["location"] == "https://tool.test/auth/brightspace/login"
    assert client.get("/lti/session").json()["session"]["isInstructor"] is False


# ──────────────────────────────────────────────────────────────────────────
# /lti/session
# ──────────────────────────────────────────────────────────────────────────
def test_session_sin_cookie_o_alterada(lti_env):
    client, _ = lti_env
    assert client.get("/lti/session").json() == {"authenticated": False}
    falsa = lti._make_signed_blob({"orgUnitId": "1"}, "otro-secreto")
    client.cookies.set(lti.LTI_SESSION_COOKIE, falsa)
    assert client.get("/lti/session").json() == {"authenticated": False}


@pytest.mark.parametrize(
    "roles, esperado",
    [
        (["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"], True),
        (["TeachingAssistant"], True),
        (["urn:lti:instrole:ims/lis/Faculty"], True),
        (["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"], False),
        ([], False),
    ],
)
def test_is_instructor(roles, esperado):
    assert lti._is_instructor(roles) is esperado
