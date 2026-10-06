"""Callback OAuth de Brightspace de punta a punta con un transporte falso
(httpx.MockTransport) que simula token + whoami + endpoints de rol:
creación de sesión con el rol detectado, redirect con el hash #gemelo:,
borrado de la cookie nonce y protección contra open-redirect en `next`.
(Los casos de state inválido / nonce distinto / logout ya están en
test_auth_security.py.)"""
import json
import urllib.parse

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import auth_routes as ar
from app.services import usage_tracking, user_registry

BS = "https://bs.test"
TOKEN_URL = "https://auth.test/core/connect/token"
FRONT = "https://front.test"


class BrightspaceFalso:
    """Enruta por path; cada test ajusta las respuestas en `self.rutas`."""

    def __init__(self):
        lp = ar.LP_VERSION
        self.rutas = {
            ("POST", "/core/connect/token"): (200, {
                "access_token": "AT-1", "refresh_token": "RT-1",
                "expires_in": 3600, "token_type": "Bearer", "scope": "core:*:*",
            }),
            ("GET", f"/d2l/api/lp/{lp}/users/whoami"): (200, {
                "Identifier": "42", "FirstName": "Ana", "LastName": "Pérez",
                "UniqueName": "ana@cesa.edu.co",
            }),
            ("GET", f"/d2l/api/lp/{lp}/organization/info"): (200, {"Identifier": "6606"}),
            ("GET", f"/d2l/api/lp/{lp}/enrollments/orgUnits/6606/users/42"): (200, {"RoleId": 116}),
        }
        self.llamadas = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        clave = (request.method, request.url.path)
        self.llamadas.append((clave, request))
        status, body = self.rutas.get(clave, (404, {"error": "no encontrado"}))
        if isinstance(body, Exception):
            raise body
        return httpx.Response(status, json=body)


@pytest.fixture
def entorno(monkeypatch):
    bs = BrightspaceFalso()
    client = httpx.AsyncClient(transport=httpx.MockTransport(bs))
    monkeypatch.setattr(ar, "get_http_client", lambda: client)
    monkeypatch.setattr(ar, "CLIENT_ID", "cid")
    monkeypatch.setattr(ar, "CLIENT_SECRET", "csecret")
    monkeypatch.setattr(ar, "REDIRECT_URI", "https://tool.test/auth/brightspace/callback")
    monkeypatch.setattr(ar, "BRIGHTSPACE_BASE_URL", BS)
    monkeypatch.setattr(ar, "BRIGHTSPACE_TOKEN_URL", TOKEN_URL)
    monkeypatch.setattr(ar, "FRONTEND_BASE", FRONT)

    sesiones = {}
    monkeypatch.setattr(ar, "save_session", lambda sid, data: sesiones.__setitem__(sid, data))
    registrados = []
    monkeypatch.setattr(user_registry, "record_user", lambda *a, **k: registrados.append(a))
    monkeypatch.setattr(usage_tracking, "record_login", lambda *a, **k: registrados.append(a))

    app = FastAPI()
    app.include_router(ar.router)
    tc = TestClient(app, base_url="https://testserver")
    return tc, bs, sesiones, registrados


def _callback(tc, next_url="", ou="", nonce="nonce-1", con_cookie=True):
    state = ar._make_oauth_state(nonce, next_url, ou)
    if con_cookie:
        tc.cookies.set(ar.OAUTH_NONCE_COOKIE, nonce)
    q = urllib.parse.urlencode({"code": "codigo-1", "state": state})
    return tc.get(f"/auth/brightspace/callback?{q}", follow_redirects=False)


def _hash(location):
    assert "#gemelo:" in location
    _, frag = location.split("#", 1)
    partes = frag.split(":")
    assert partes[0] == "gemelo" and len(partes) == 4
    return partes[1], partes[2], partes[3]


def test_callback_feliz_crea_sesion_con_rol_y_redirige(entorno):
    tc, bs, sesiones, registrados = entorno
    r = _callback(tc, next_url="/dashboard", ou="777")
    assert r.status_code == 302

    loc = r.headers["location"]
    assert loc.startswith(f"{FRONT}/dashboard#gemelo:")
    sid, ou, primero = _hash(loc)
    assert (ou, primero) == ("777", "1")

    # Sesión guardada con el rol detectado por RoleId 116.
    assert list(sesiones) == [sid]
    s = sesiones[sid]
    assert s["access_token"] == "AT-1" and s["refresh_token"] == "RT-1"
    assert s["user_id"] == "42"
    assert s["user_name"] == "Ana Pérez"
    assert s["user_email"] == "ana@cesa.edu.co"
    assert s["role"] == "Administrator"
    assert s["all_roles"] == ["Administrator"]
    assert len(registrados) == 2  # record_user + record_login

    # Intercambio del code con las credenciales del cliente.
    (_, token_req) = bs.llamadas[0]
    body = urllib.parse.parse_qs(token_req.content.decode())
    assert body["grant_type"] == ["authorization_code"]
    assert body["code"] == ["codigo-1"]
    assert body["client_secret"] == ["csecret"]
    # whoami con el access_token recién obtenido
    assert bs.llamadas[1][1].headers["authorization"] == "Bearer AT-1"

    # Cookie de sesión emitida y cookie nonce borrada.
    cookies = r.headers.get_list("set-cookie")
    sesion = [c for c in cookies if c.startswith(f"{ar.SESSION_COOKIE}=")]
    assert sesion and sid in sesion[0] and "HttpOnly" in sesion[0] and "Secure" in sesion[0]
    nonce = [c for c in cookies if c.startswith(f"{ar.OAUTH_NONCE_COOKIE}=")]
    assert nonce and "Max-Age=0" in nonce[0] and "Path=/auth/brightspace" in nonce[0]


def test_callback_sin_cookie_nonce_acepta_state_firmado(entorno):
    # Dentro del iframe LTI la cookie de terceros puede no llegar.
    tc, _, sesiones, _ = entorno
    r = _callback(tc, ou="888", con_cookie=False)
    assert r.status_code == 302
    sid, ou, _ = _hash(r.headers["location"])
    assert ou == "888" and sid in sesiones


def test_sin_next_redirige_a_la_raiz_del_front(entorno):
    tc, _, _, _ = entorno
    r = _callback(tc)
    assert r.headers["location"].startswith(f"{FRONT}/#gemelo:")
    _, ou, _ = _hash(r.headers["location"])
    assert ou == ""


@pytest.mark.parametrize(
    "next_url",
    ["//evil.com", "//evil.com/dashboard", "https://evil.com/x", "http://evil.com",
     "javascript:alert(1)", "evil.com"],
)
def test_next_url_no_permite_open_redirect(entorno, next_url):
    tc, _, _, _ = entorno
    r = _callback(tc, next_url=next_url, ou="777")
    loc = r.headers["location"]
    assert loc.startswith(f"{FRONT}/#gemelo:")
    assert "evil.com" not in loc and "javascript" not in loc


def test_next_con_backslash_no_escapa_del_origen_sin_frontend_base(entorno, monkeypatch):
    """Si FRONTEND_BASE está vacío el Location es relativo: '/\\evil.com' lo
    normalizarían los navegadores a '//evil.com'. Starlette lo percent-encodea
    (%5C) y queda como path del mismo origen."""
    tc, _, _, _ = entorno
    monkeypatch.setattr(ar, "FRONTEND_BASE", "")
    r = _callback(tc, next_url="/\\evil.com")
    loc = r.headers["location"]
    assert not loc.startswith("//")
    assert "\\" not in loc
    assert loc.startswith("/%5Cevil.com#gemelo:")


@pytest.mark.parametrize(
    "rutas_extra, rol",
    [
        # RoleId 105 → Super Administrator (fast-path)
        ({"enroll": (200, {"RoleId": 105})}, "Super Administrator"),
        # RoleId propio del tenant → se resuelve por nombre
        ({"enroll": (200, {"RoleId": 900}), "role900": (200, {"DisplayName": "Super Admin CESA"})},
         "Super Administrator"),
        ({"enroll": (200, {"RoleId": 901}), "role901": (200, {"DisplayName": "Administrator - Sede"})},
         "Administrator"),
        # Estudiante: sin rol de sistema
        ({"enroll": (200, {"RoleId": 110}), "role110": (200, {"DisplayName": "Student"})}, None),
        # Matrícula raíz falla → fallback a /users/{uid}
        ({"enroll": (404, {}), "user": (200, {"RoleId": 116})}, "Administrator"),
        # Nada responde → sin rol, pero el login no falla
        ({"enroll": (500, {})}, None),
    ],
)
def test_deteccion_de_rol_de_sistema(entorno, rutas_extra, rol):
    tc, bs, sesiones, _ = entorno
    lp = ar.LP_VERSION
    mapa = {
        "enroll": ("GET", f"/d2l/api/lp/{lp}/enrollments/orgUnits/6606/users/42"),
        "user": ("GET", f"/d2l/api/lp/{lp}/users/42"),
    }
    for k, v in rutas_extra.items():
        if k.startswith("role"):
            bs.rutas[("GET", f"/d2l/api/lp/{lp}/roles/{k[4:]}")] = v
        else:
            bs.rutas[mapa[k]] = v
    r = _callback(tc)
    assert r.status_code == 302
    s = next(iter(sesiones.values()))
    assert s["role"] == rol
    assert s["all_roles"] == ([rol] if rol else [])


def test_org_info_falla_usa_raiz_por_defecto(entorno):
    tc, bs, sesiones, _ = entorno
    lp = ar.LP_VERSION
    bs.rutas[("GET", f"/d2l/api/lp/{lp}/organization/info")] = (503, {})
    _callback(tc)
    assert next(iter(sesiones.values()))["role"] == "Administrator"  # usó 6606


def test_whoami_falla_crea_sesion_sin_usuario_ni_rol(entorno):
    tc, bs, sesiones, _ = entorno
    bs.rutas[("GET", f"/d2l/api/lp/{ar.LP_VERSION}/users/whoami")] = (500, {})
    r = _callback(tc)
    assert r.status_code == 302
    s = next(iter(sesiones.values()))
    assert s["user_id"] is None and s["role"] is None
    # Sin uid no se consulta ningún endpoint de rol.
    paths = [c[0][1] for c in bs.llamadas]
    assert not any("enrollments" in p or "/roles/" in p for p in paths)


def test_token_exchange_fallido_no_crea_sesion(entorno):
    tc, bs, sesiones, _ = entorno
    bs.rutas[("POST", "/core/connect/token")] = (400, {"error": "invalid_grant"})
    r = _callback(tc)
    assert r.status_code == 400
    assert r.json()["error"] == "Token exchange falló"
    assert sesiones == {}


def test_token_sin_access_token_responde_500(entorno):
    tc, bs, sesiones, _ = entorno
    bs.rutas[("POST", "/core/connect/token")] = (200, {"token_type": "Bearer"})
    r = _callback(tc)
    assert r.status_code == 500
    assert sesiones == {}


def test_error_de_brightspace_y_falta_de_code(entorno):
    tc, _, sesiones, _ = entorno
    r = tc.get("/auth/brightspace/callback?error=access_denied&error_description=no",
               follow_redirects=False)
    assert r.status_code == 400 and r.json()["error"] == "access_denied"
    r = tc.get("/auth/brightspace/callback?state=x", follow_redirects=False)
    assert r.status_code == 400
    assert sesiones == {}


def test_login_redirige_a_brightspace_con_parametros(entorno):
    tc, _, _, _ = entorno
    r = tc.get("/auth/brightspace/login?next=/portal&org_unit_id=321", follow_redirects=False)
    assert r.status_code == 307
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(r.headers["location"]).query)
    assert q["client_id"] == ["cid"]
    assert q["response_type"] == ["code"]
    assert q["redirect_uri"] == ["https://tool.test/auth/brightspace/callback"]
    assert "prompt" not in q
    payload = ar._read_oauth_state(q["state"][0])
    assert (payload["next"], payload["ou"]) == ("/portal", "321")


def test_auth_me_con_bearer_devuelve_rol(entorno, monkeypatch):
    tc, _, _, _ = entorno
    ses = {"user_id": "42", "user_name": "Ana", "role": "Administrator",
           "all_roles": ["Administrator"], "iat": 1}
    monkeypatch.setattr(ar, "get_session", lambda sid: ses if sid == "sid-ok" else None)
    r = tc.get("/auth/me", headers={"Authorization": "Bearer sid-ok"})
    assert r.json()["authenticated"] is True
    assert r.json()["role"] == "Administrator"
    assert r.json()["auth_method"] == "bearer"
    r = tc.get("/auth/me", headers={"Authorization": "Bearer otro"})
    assert r.json() == {"authenticated": False}
    # Sanity: la respuesta nunca incluye tokens.
    assert "access_token" not in json.dumps(r.json())
