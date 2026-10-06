# app/token_refresh.py
# Refresco del access_token de Brightspace ANTES de atender cada request.
#
# Muchos endpoints (proxy de Brightspace, course_auth) leen el token de forma
# síncrona con get_access_token(); si el token ya venció devolvían 401 y el
# usuario tenía que volver a iniciar sesión aunque la sesión tuviera
# refresh_token. Este middleware renueva el token (si está por vencer o ya
# venció) para que esos caminos vean siempre uno vigente.

import logging

from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("uvicorn.error")

SESSION_COOKIE = "gemelo_session_id"
# Rutas que nunca necesitan token de Brightspace.
_SKIP_PREFIXES = ("/health", "/assets", "/.well-known", "/lti/", "/auth/brightspace/")


def _session_id_from_scope(scope: Scope) -> str | None:
    cookie_header = ""
    for name, value in scope.get("headers") or []:
        if name == b"authorization":
            raw = value.decode("latin-1")
            if raw.startswith("Bearer "):
                sid = raw[7:].strip()
                if sid:
                    return sid
        elif name == b"cookie":
            cookie_header = value.decode("latin-1")
    for part in cookie_header.split(";"):
        key, _, val = part.strip().partition("=")
        if key == SESSION_COOKIE and val:
            return val
    return None


class TokenRefreshMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not scope.get("path", "").startswith(_SKIP_PREFIXES):
            sid = _session_id_from_scope(scope)
            if sid:
                try:
                    from app.services.brightspace_client import ensure_fresh_session_token
                    await ensure_fresh_session_token(sid)
                except Exception:
                    # Best-effort: si falla, el endpoint responde como antes
                    # (401 si el token ya no sirve).
                    logger.warning("token_refresh: no se pudo refrescar la sesión", exc_info=True)
        await self.app(scope, receive, send)
