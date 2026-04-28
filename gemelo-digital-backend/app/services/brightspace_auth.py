"""
Helpers de autenticación con Brightspace OAuth.

Hoy el backend recibe un `access_token` (válido ~1h) y un `refresh_token`
(válido ~1 año) cuando un usuario completa el login. El access_token se
usa para llamar la API de Brightspace, el refresh_token sirve para
mintear nuevos access_token cuando el viejo expira sin obligar al
usuario a relogearse.

Este módulo encapsula esa operación de mintada para que pueda ser
reutilizada desde:
  - sesiones de usuario (BrightspaceClient cuando el access_token de
    SESSION_STORE está por expirar).
  - tareas programadas de sincronización automática que usan un
    refresh_token de cuenta de servicio almacenado en env.
"""
from __future__ import annotations

import os
import logging
import time
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("uvicorn.error")


#|------- Configuracion de Brightspace OAuth (lectura unica desde env) -------|
# Mismas vars que main.py — leídas en demand para soportar cambios runtime
# en testing y para que este modulo no falle al import si el env no esta
# completo (ej. tooling estatico).
def _bs_token_url() -> str:
    return os.getenv(
        "BRIGHTSPACE_TOKEN_URL",
        "https://auth.brightspace.com/core/connect/token",
    )

def _bs_client_id() -> str:
    return os.getenv("BRIGHTSPACE_CLIENT_ID", "")

def _bs_client_secret() -> str:
    return os.getenv("BRIGHTSPACE_CLIENT_SECRET", "")


#|---------- Helper publico: mintar access_token desde refresh_token ----------|
async def mint_access_token_from_refresh(
    refresh_token: str,
    timeout: int = 15,
) -> Optional[Dict[str, Any]]:
    """
    Intercambia un refresh_token de Brightspace por un nuevo bundle de
    tokens (access_token nuevo + posiblemente refresh_token rotado).

    Brightspace (D2L) usa el flujo OAuth 2.0 estandar: POST a
    BRIGHTSPACE_TOKEN_URL con grant_type=refresh_token. La respuesta
    incluye:
      - access_token: el nuevo token bearer (valido ~1h)
      - refresh_token: puede venir rotado (Brightspace lo cambia a veces)
      - expires_in: segundos de vida del access_token nuevo
      - token_type: "Bearer"
      - scope: alcance otorgado

    Args:
        refresh_token: el refresh_token actual del usuario o cuenta de servicio.
        timeout: timeout HTTP en segundos.

    Returns:
        Dict con los campos del response de Brightspace mas un campo
        derivado `expires_at` (epoch segundos) calculado al recibir.
        None si la llamada fallo (refresh_token revocado/invalido,
        red, Brightspace caido, etc.).

    Side effects:
        - Loggea warning si la llamada falla (no lanza, retorna None
          para que el caller decida que hacer).

    Security:
        - El refresh_token nunca se loggea ni en error.
        - La llamada va via HTTPS al endpoint oficial de Brightspace.
    """
    if not refresh_token:
        return None

    client_id = _bs_client_id()
    client_secret = _bs_client_secret()
    token_url = _bs_token_url()

    if not client_id or not client_secret:
        logger.warning(
            "mint_access_token_from_refresh: faltan BRIGHTSPACE_CLIENT_ID/SECRET en env"
        )
        return None

    #|-------- Construir el POST de refresh segun OAuth 2.0 ----------|
    data = {
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,
        "client_id":     client_id,
        "client_secret": client_secret,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(token_url, data=data)
    except httpx.RequestError as e:
        logger.warning(
            "mint_access_token_from_refresh: error de red contactando Brightspace: %s",
            e,
        )
        return None

    if r.status_code != 200:
        # Sin loggear el cuerpo: puede contener pistas del refresh_token
        logger.warning(
            "mint_access_token_from_refresh: Brightspace respondio %s (refresh probablemente revocado)",
            r.status_code,
        )
        return None

    try:
        body = r.json()
    except Exception:
        logger.warning(
            "mint_access_token_from_refresh: respuesta no-JSON de Brightspace"
        )
        return None

    new_access = body.get("access_token")
    if not new_access:
        logger.warning(
            "mint_access_token_from_refresh: response sin access_token (status 200 pero body raro)"
        )
        return None

    #|-------- Anadir expires_at (epoch segundos) para que el caller no calcule ----------|
    expires_in = int(body.get("expires_in") or 3600)
    body["expires_at"] = time.time() + expires_in

    return body
