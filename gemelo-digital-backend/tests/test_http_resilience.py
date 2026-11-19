"""Cliente HTTP compartido con reintentos (_bs_get) e IP del rate limit."""
import httpx
import pytest

from app.api import deps
from app.rate_limit import client_ip
from app.services import brightspace_client as bc


class _FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    async def get(self, url, headers=None, params=None, timeout=None):
        self.calls += 1
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture
def fake_client(monkeypatch):
    holder = {}

    def install(responses):
        holder["c"] = _FakeClient(responses)
        monkeypatch.setattr(bc, "get_http_client", lambda: holder["c"])
        return holder["c"]

    async def no_sleep(_):
        return None

    monkeypatch.setattr(deps.asyncio, "sleep", no_sleep)
    return install


def _resp(status, body=None, headers=None):
    return httpx.Response(status, json=body if body is not None else {}, headers=headers)


async def test_reintenta_429_y_luego_ok(fake_client):
    c = fake_client([_resp(429, headers={"Retry-After": "1"}), _resp(200, {"ok": True})])
    status, body = await deps._bs_get("https://bs/x", {})
    assert (status, body, c.calls) == (200, {"ok": True}, 2)


async def test_reintenta_error_de_red(fake_client):
    c = fake_client([httpx.ConnectError("boom"), _resp(200, {"a": 1})])
    status, _ = await deps._bs_get("https://bs/x", {})
    assert status == 200 and c.calls == 2


async def test_no_reintenta_4xx_definitivos(fake_client):
    c = fake_client([_resp(403, {"err": 1})])
    status, _ = await deps._bs_get("https://bs/x", {})
    assert status == 403 and c.calls == 1


async def test_devuelve_el_ultimo_503_tras_agotar_reintentos(fake_client):
    c = fake_client([_resp(503)] * deps._BS_GET_RETRIES)
    status, _ = await deps._bs_get("https://bs/x", {})
    assert status == 503 and c.calls == deps._BS_GET_RETRIES


class _Req:
    def __init__(self, xff=None, peer="10.0.0.1"):
        self.headers = {"x-forwarded-for": xff} if xff else {}
        self.client = type("C", (), {"host": peer})()
        self.scope = {"client": (peer, 0)}


def test_ip_rate_limit_ignora_valores_falsificados_por_el_cliente():
    # El cliente manda "1.1.1.1"; el ALB añade la IP real al final.
    assert client_ip(_Req("1.1.1.1, 203.0.113.7")) == "203.0.113.7"


def test_ip_rate_limit_sin_xff_usa_el_peer():
    assert client_ip(_Req()) == "10.0.0.1"
