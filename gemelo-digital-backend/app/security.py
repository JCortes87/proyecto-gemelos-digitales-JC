# app/security.py
# Carga estricta de secretos y guards de seguridad compartidos.

import logging
import secrets as _secrets

from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger("uvicorn.error")

# TOOL_BASE_URL en https:// es el indicador de despliegue productivo.
_IS_PRODUCTION = settings.is_production


def _load_secret(name: str, raw: str | None) -> str:
    val = (raw or "").strip()
    if val and val != "change-me":
        return val
    if _IS_PRODUCTION:
        raise RuntimeError(
            f"La variable de entorno {name} no está definida (o usa el default "
            "inseguro 'change-me'). Define un secreto fuerte antes de desplegar."
        )
    # En dev: secreto aleatorio por proceso. Los blobs firmados no sobreviven
    # un reinicio, igual que el SESSION_STORE en memoria.
    logger.warning(
        "%s no definido; usando secreto aleatorio efímero (solo desarrollo).", name
    )
    return _secrets.token_urlsafe(32)


LTI_STATE_SECRET = _load_secret("LTI_STATE_SECRET", settings.lti_state_secret)
SESSION_SECRET = _load_secret("SESSION_SECRET", settings.session_secret)

DEBUG_ENDPOINTS_ENABLED = (
    (settings.debug_endpoints_enabled or "").strip().lower()
    in ("1", "true", "yes")
)


def require_debug_enabled():
    """Dependency FastAPI: oculta los endpoints /debug salvo que se habiliten por env."""
    if not DEBUG_ENDPOINTS_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")
