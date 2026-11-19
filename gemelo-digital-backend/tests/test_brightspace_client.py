"""BrightspaceClient con transporte falso (httpx.MockTransport): reintentos y
backoff ante 429/5xx/errores de red, no-reintento en 4xx y POST, propagación
del 401, resolución del token y refresh proactivo cuando el access_token está
por vencer. También mint_access_token_from_refresh (brightspace_auth)."""
import time

import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app import state
from app.services import brightspace_auth as ba
from app.services import brightspace_client as bc

BASE = "https://bs.test"


class Transporte:
    """Responde en orden con la lista dada y guarda cada request recibida."""

    def __init__(self, respuestas):
        self.respuestas = list(respuestas)
        self.requests = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        r = self.respuestas.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _json(status, body=None, headers=None):
    return httpx.Response(status, json=body if body is not None else {}, headers=headers)


@pytest.fixture
def entorno(monkeypatch):
    """Instala el transporte falso y desactiva las esperas reales."""
    monkeypatch.setattr(bc.settings, "brightspace_base_url", BASE)
    monkeypatch.setattr(bc, "MAX_RETRIES", 3)
    monkeypatch.setattr(bc.random, "uniform", lambda a, b: 0.0)
    esperas = []

    async def no_sleep(s):
        esperas.append(s)

    monkeypatch.setattr(bc.asyncio, "sleep", no_sleep)
    holder = {}

    def instalar(respuestas):
        t = Transporte(respuestas)
        holder["client"] = httpx.AsyncClient(transport=httpx.MockTransport(t))
        monkeypatch.setattr(bc, "get_http_client", lambda: holder["client"])
        return t

    state.SESSION_STORE.clear()
    yield instalar, esperas
    state.SESSION_STORE.clear()


def _cliente(**kw):
    kw.setdefault("tokens", {"access_token": "tok-fijo"})
    return bc.BrightspaceClient(**kw)


def _request_con_bearer(sid):
    return Request({
        "type": "http", "method": "GET", "path": "/", "query_string": b"",
        "headers": [(b"authorization", f"Bearer {sid}".encode())],
    })


# ──────────────────────────────────────────────────────────────────────────
# Reintentos
# ──────────────────────────────────────────────────────────────────────────
async def test_reintenta_429_respetando_retry_after(entorno):
    instalar, esperas = entorno
    t = instalar([_json(429, headers={"Retry-After": "2"}), _json(200, {"ok": 1})])
    data = await _cliente()._request_json("GET", f"{BASE}/x")
    assert data == {"ok": 1}
    assert len(t.requests) == 2
    assert esperas == [2.0]  # max(backoff 0.5, Retry-After 2)


async def test_retry_after_invalido_usa_backoff(entorno):
    instalar, esperas = entorno
    instalar([_json(429, headers={"Retry-After": "luego"}), _json(200, {})])
    await _cliente()._request_json("GET", f"{BASE}/x")
    assert esperas == [0.5]


async def test_backoff_exponencial_en_5xx(entorno):
    instalar, esperas = entorno
    t = instalar([_json(503), _json(502), _json(200, [1, 2])])
    assert await _cliente()._request_json("GET", f"{BASE}/x") == [1, 2]
    assert len(t.requests) == 3
    assert esperas == [0.5, 1.0]


async def test_agota_reintentos_y_lanza_con_el_ultimo_status(entorno):
    instalar, esperas = entorno
    t = instalar([_json(500)] * 3)
    with pytest.raises(RuntimeError, match="Brightspace error 500"):
        await _cliente()._request_json("GET", f"{BASE}/x")
    assert len(t.requests) == 3
    assert len(esperas) == 2  # no espera después del último intento


async def test_reintenta_errores_de_red(entorno):
    instalar, _ = entorno
    t = instalar([httpx.ConnectError("boom"), httpx.ReadTimeout("lento"), _json(200, {"a": 1})])
    assert await _cliente()._request_json("GET", f"{BASE}/x") == {"a": 1}
    assert len(t.requests) == 3


async def test_red_caida_en_todos_los_intentos(entorno):
    instalar, _ = entorno
    instalar([httpx.ConnectError("boom")] * 3)
    with pytest.raises(RuntimeError, match="no respondio tras 3 intentos"):
        await _cliente()._request_json("GET", f"{BASE}/x")


async def test_post_no_se_reintenta(entorno):
    instalar, esperas = entorno
    t = instalar([_json(503)])
    with pytest.raises(RuntimeError, match="503"):
        await _cliente()._request_json("POST", f"{BASE}/x", json_body={"a": 1})
    assert len(t.requests) == 1 and esperas == []


@pytest.mark.parametrize("status", [400, 403, 404])
async def test_4xx_definitivo_no_se_reintenta(entorno, status):
    instalar, esperas = entorno
    t = instalar([_json(status)])
    with pytest.raises(RuntimeError, match=f"Brightspace error {status}"):
        await _cliente()._request_json("GET", f"{BASE}/x")
    assert len(t.requests) == 1 and esperas == []


async def test_401_se_propaga_sin_reintentos(entorno):
    instalar, esperas = entorno
    t = instalar([httpx.Response(401, text="token expirado")])
    with pytest.raises(RuntimeError) as exc:
        await _cliente()._request_json("GET", f"{BASE}/x")
    assert "Brightspace error 401" in str(exc.value)
    assert "token expirado" in str(exc.value)
    assert len(t.requests) == 1 and esperas == []


async def test_respuesta_no_json(entorno):
    instalar, _ = entorno
    instalar([httpx.Response(200, text="<html>login</html>", headers={"content-type": "text/html"})])
    with pytest.raises(RuntimeError, match="no JSON"):
        await _cliente()._request_json("GET", f"{BASE}/x")


async def test_list_classlist_normaliza_items(entorno):
    instalar, _ = entorno
    t = instalar([_json(200, {"Items": [{"Identifier": "1"}, "basura", {"Identifier": "2"}]})])
    out = await _cliente().list_classlist(123)
    assert out == [{"Identifier": "1"}, {"Identifier": "2"}]
    assert t.requests[0].url.path.endswith("/123/classlist/")
    assert t.requests[0].headers["authorization"] == "Bearer tok-fijo"


async def test_get_course_info_devuelve_dict_vacio_si_falla(entorno):
    instalar, _ = entorno
    instalar([_json(403)])
    assert await _cliente().get_course_info(1) == {}


# ──────────────────────────────────────────────────────────────────────────
# Resolución del token y refresh
# ──────────────────────────────────────────────────────────────────────────
def test_sin_token_lanza_401(entorno):
    with pytest.raises(HTTPException) as exc:
        bc.BrightspaceClient()._auth_headers()
    assert exc.value.status_code == 401


def test_sin_base_url_falla_al_construir(monkeypatch):
    monkeypatch.setattr(bc.settings, "brightspace_base_url", "")
    with pytest.raises(RuntimeError, match="BRIGHTSPACE_BASE_URL"):
        bc.BrightspaceClient(tokens={"access_token": "x"})


def test_token_desde_sesion_bearer(entorno):
    state.save_session("sid-1", {"access_token": "tok-sesion", "expires_in": 3600})
    c = bc.BrightspaceClient(request=_request_con_bearer("sid-1"))
    assert c._auth_headers() == {"Authorization": "Bearer tok-sesion"}


@pytest.fixture
def mint(monkeypatch):
    llamadas = []
    resultado = {}

    async def fake(refresh_token, timeout=15):
        llamadas.append(refresh_token)
        return resultado.get("valor")

    monkeypatch.setattr(bc, "mint_access_token_from_refresh", fake)
    return llamadas, resultado


async def test_refresca_cuando_el_token_esta_por_vencer(entorno, mint):
    instalar, _ = entorno
    llamadas, resultado = mint
    resultado["valor"] = {"access_token": "tok-nuevo", "refresh_token": "ref-2",
                          "expires_at": time.time() + 3600}
    state.save_session("sid-1", {"access_token": "tok-viejo", "refresh_token": "ref-1",
                                 "expires_in": 120})  # < REFRESH_THRESHOLD (300 s)
    t = instalar([_json(200, {})])
    await bc.BrightspaceClient(request=_request_con_bearer("sid-1"))._request_json("GET", f"{BASE}/x")
    assert llamadas == ["ref-1"]
    assert t.requests[0].headers["authorization"] == "Bearer tok-nuevo"
    s = state.SESSION_STORE["sid-1"]
    assert (s["access_token"], s["refresh_token"]) == ("tok-nuevo", "ref-2")
    assert s["expires_at"] > time.time() + 3000


async def test_no_refresca_si_al_token_le_queda_vida(entorno, mint):
    instalar, _ = entorno
    llamadas, _ = mint
    state.save_session("sid-1", {"access_token": "tok-viejo", "refresh_token": "ref-1",
                                 "expires_in": 3600})
    t = instalar([_json(200, {})])
    await bc.BrightspaceClient(request=_request_con_bearer("sid-1"))._request_json("GET", f"{BASE}/x")
    assert llamadas == []
    assert t.requests[0].headers["authorization"] == "Bearer tok-viejo"


async def test_sin_refresh_token_no_intenta_refrescar(entorno, mint):
    instalar, _ = entorno
    llamadas, _ = mint
    state.save_session("sid-1", {"access_token": "tok-viejo", "expires_in": 60})
    t = instalar([_json(200, {})])
    await bc.BrightspaceClient(request=_request_con_bearer("sid-1"))._request_json("GET", f"{BASE}/x")
    assert llamadas == []
    assert t.requests[0].headers["authorization"] == "Bearer tok-viejo"


async def test_si_el_refresh_falla_usa_el_token_actual(entorno, mint):
    instalar, _ = entorno
    llamadas, resultado = mint
    resultado["valor"] = None
    state.save_session("sid-1", {"access_token": "tok-viejo", "refresh_token": "ref-1",
                                 "expires_in": 60})
    t = instalar([_json(200, {})])
    await bc.BrightspaceClient(request=_request_con_bearer("sid-1"))._request_json("GET", f"{BASE}/x")
    assert llamadas == ["ref-1"]
    assert t.requests[0].headers["authorization"] == "Bearer tok-viejo"
    assert state.SESSION_STORE["sid-1"]["access_token"] == "tok-viejo"


async def test_refresca_aunque_el_token_ya_haya_vencido(entorno, mint):
    instalar, _ = entorno
    llamadas, resultado = mint
    resultado["valor"] = {"access_token": "tok-nuevo", "expires_at": time.time() + 3600}
    state.save_session("sid-1", {"access_token": "tok-viejo", "refresh_token": "ref-1",
                                 "expires_in": 3600})
    state.SESSION_STORE["sid-1"]["expires_at"] = time.time() - 60
    t = instalar([_json(200, {})])
    await bc.BrightspaceClient(request=_request_con_bearer("sid-1"))._request_json("GET", f"{BASE}/x")
    assert llamadas == ["ref-1"]
    assert t.requests[0].headers["authorization"] == "Bearer tok-nuevo"


# ──────────────────────────────────────────────────────────────────────────
# mint_access_token_from_refresh
# ──────────────────────────────────────────────────────────────────────────
@pytest.fixture
def token_endpoint(monkeypatch):
    monkeypatch.setattr(ba.settings, "brightspace_client_id", "cid")
    monkeypatch.setattr(ba.settings, "brightspace_client_secret", "csecret")
    monkeypatch.setattr(ba.settings, "brightspace_token_url", "https://auth.test/token")
    original = httpx.AsyncClient
    holder = {}

    def instalar(respuestas):
        t = Transporte(respuestas)
        holder["t"] = t
        monkeypatch.setattr(
            ba.httpx, "AsyncClient",
            lambda **kw: original(transport=httpx.MockTransport(t)),
        )
        return t

    return instalar


async def test_mint_ok_agrega_expires_at(token_endpoint):
    t = token_endpoint([_json(200, {"access_token": "nuevo", "expires_in": 1800})])
    antes = time.time()
    out = await ba.mint_access_token_from_refresh("ref-1")
    assert out["access_token"] == "nuevo"
    assert antes + 1790 < out["expires_at"] < time.time() + 1810
    body = t.requests[0].content.decode()
    assert "grant_type=refresh_token" in body and "refresh_token=ref-1" in body
    assert str(t.requests[0].url) == "https://auth.test/token"


@pytest.mark.parametrize(
    "respuesta",
    [
        _json(400, {"error": "invalid_grant"}),
        _json(200, {"token_type": "Bearer"}),               # sin access_token
        httpx.Response(200, text="no-json"),
        httpx.ConnectError("sin red"),
    ],
)
async def test_mint_fallido_devuelve_none(token_endpoint, respuesta):
    token_endpoint([respuesta])
    assert await ba.mint_access_token_from_refresh("ref-1") is None


async def test_mint_sin_refresh_o_sin_credenciales(token_endpoint, monkeypatch):
    t = token_endpoint([])
    assert await ba.mint_access_token_from_refresh("") is None
    monkeypatch.setattr(ba.settings, "brightspace_client_secret", "")
    assert await ba.mint_access_token_from_refresh("ref-1") is None
    assert t.requests == []
