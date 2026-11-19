"""Config compartida y helpers de sesion/proxy Brightspace (extraidos de main.py)."""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import time

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.state import get_session, get_access_token

# ──────────────────────────────────────────────────────────────────────────────
# Configuración Brightspace OAuth
# ──────────────────────────────────────────────────────────────────────────────
# (valores desde app/config.py; las constantes de módulo se conservan
# porque otros módulos y los tests las importan/monkeypatchean)
BRIGHTSPACE_BASE_URL  = (settings.brightspace_base_url or "").rstrip("/")
LP_VERSION            = settings.brightspace_lp_version
LE_VERSION            = settings.brightspace_le_version

BRIGHTSPACE_AUTH_URL  = settings.brightspace_auth_url
BRIGHTSPACE_TOKEN_URL = settings.brightspace_token_url

CLIENT_ID     = settings.brightspace_client_id
CLIENT_SECRET = settings.brightspace_client_secret
REDIRECT_URI  = settings.brightspace_redirect_uri
SCOPE         = settings.brightspace_scope
FRONTEND_BASE = (settings.frontend_base_url or "").rstrip("/")

# Cookie config
SESSION_COOKIE   = "gemelo_session_id"
SESSION_MAX_AGE  = 60 * 60 * 8     # 8 horas
_tool_is_https   = lambda: (settings.tool_base_url or "").lower().startswith("https://")


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────
def _get_session_id(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)


def _require_session(request: Request):
    """
    Dependency FastAPI: extrae y valida la sesión del usuario.
    Lanza 401 si no está autenticado.
    """
    sid = _get_session_id(request)
    if not sid:
        raise HTTPException(
            status_code=401,
            detail="No autenticado. Inicia sesión en /auth/brightspace/login",
        )
    session = get_session(sid)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Sesión expirada o inválida. Vuelve a iniciar sesión.",
        )
    return session


def _require_token_from_request(request: Request) -> tuple[str, JSONResponse | None]:
    """
    Versión legacy-compatible: devuelve (token, None) o (None, JSONResponse 401).
    Acepta sesión via:
    1. Authorization: Bearer <session_id> header
    2. Cookie gemelo_session_id

    NOTA seguridad: ya NO se acepta ?sid= en query string — un token en la URL
    queda expuesto en historial del navegador, logs y headers Referer. Las
    descargas del frontend usan fetch + Authorization (apiDownload en api.js).
    """
    # 1. Header Authorization: Bearer <session_id>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        sid_from_header = auth_header[7:].strip()
        if sid_from_header:
            token = get_access_token(sid_from_header)
            if token:
                return token, None

    # 2. Cookie
    sid = _get_session_id(request)
    if sid:
        token = get_access_token(sid)
        if token:
            return token, None

    return None, JSONResponse(
        status_code=401,
        content={
            "error": (
                "No autenticado. "
                "Inicia sesión en /auth/brightspace/login "
                "o accede desde Brightspace mediante LTI."
            )
        },
    )


def _auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


_BS_GET_RETRIES = 3
_RETRYABLE_STATUS = {429, 502, 503, 504}


def _retry_delay(attempt: int, response: httpx.Response | None) -> float:
    """Backoff exponencial (0.5s, 1s, …); respeta Retry-After (máx. 5s)."""
    if response is not None:
        try:
            return min(float(response.headers.get("Retry-After", "")), 5.0)
        except ValueError:
            pass
    return 0.5 * (2 ** attempt)


async def _bs_get(
    url: str,
    headers: dict,
    params: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | list]:
    # Cliente compartido (pool de conexiones) + reintentos ante fallos
    # transitorios: 429 (rate limit), 502/503/504 y errores de red.
    from app.services.brightspace_client import get_http_client
    client = get_http_client()
    for attempt in range(_BS_GET_RETRIES):
        last = attempt == _BS_GET_RETRIES - 1
        try:
            r = await client.get(url, headers=headers, params=params or {}, timeout=timeout)
        except httpx.TransportError:
            if last:
                raise
            await asyncio.sleep(_retry_delay(attempt, None))
            continue
        if r.status_code in _RETRYABLE_STATUS and not last:
            await asyncio.sleep(_retry_delay(attempt, r))
            continue
        break
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    return r.status_code, body


# ──────────────────────────────────────────────────────────────────────────────
# Caché TTL corta para GETs repetidos a Brightspace (#11)
#
# Cada refresh del dashboard repetía llamadas idénticas (whoami, enrollments,
# orgstructure/semestres). Estos datos cambian muy poco → una caché en memoria
# de 5 minutos elimina la mayoría de round-trips a Brightspace.
#
# - La clave incluye un hash del token: cada usuario tiene su propia entrada
#   (nunca se filtra la respuesta de un usuario a otro).
# - Solo se cachean respuestas 200. Los errores siempre se re-consultan.
# - Se devuelve una copia profunda para que los handlers puedan mutar el
#   resultado sin corromper la entrada cacheada.
# - Uso EXPLÍCITO (opt-in): solo los endpoints estables llaman _bs_get_cached;
#   notas, entregas y datos "vivos" siguen usando _bs_get directo.
# ──────────────────────────────────────────────────────────────────────────────
_BS_CACHE: dict[str, tuple[float, int, object]] = {}
_BS_CACHE_MAX = 1000
BS_CACHE_TTL_S = 300.0  # 5 minutos


def _bs_cache_key(url: str, headers: dict, params: dict | None) -> str:
    tok = str(headers.get("Authorization", ""))
    tok_hash = hashlib.sha256(tok.encode("utf-8")).hexdigest()[:16]
    return f"{tok_hash}|{url}|{json.dumps(params or {}, sort_keys=True, default=str)}"


async def _bs_get_cached(
    url: str,
    headers: dict,
    params: dict | None = None,
    ttl: float = BS_CACHE_TTL_S,
    timeout: int = 30,
) -> tuple[int, dict | list]:
    key = _bs_cache_key(url, headers, params)
    now = time.monotonic()
    hit = _BS_CACHE.get(key)
    if hit and (now - hit[0]) < ttl:
        return hit[1], copy.deepcopy(hit[2])

    status, body = await _bs_get(url, headers, params, timeout)
    if status == 200:
        if len(_BS_CACHE) >= _BS_CACHE_MAX:
            # Purga de expirados; si sigue llena (tráfico inusual), se vacía.
            expired = [k for k, v in _BS_CACHE.items() if (now - v[0]) >= ttl]
            for k in expired:
                _BS_CACHE.pop(k, None)
            if len(_BS_CACHE) >= _BS_CACHE_MAX:
                _BS_CACHE.clear()
        _BS_CACHE[key] = (now, status, copy.deepcopy(body))
    return status, body


async def _get_whoami_id(headers: dict) -> tuple[str | None, JSONResponse | None]:
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    # whoami es estable durante la vida del token → cacheable 5 min
    status, data = await _bs_get_cached(url, headers)
    if status != 200:
        return None, JSONResponse(
            status_code=502,
            content={"error": "whoami falló", "status": status, "detail": data},
        )
    uid = data.get("Identifier") or data.get("UserId") or data.get("userId")
    if not uid:
        return None, JSONResponse(
            status_code=502,
            content={"error": "whoami no devolvió Identifier", "data": data},
        )
    return str(uid), None

