# app/state.py
"""
Store de sesiones por usuario.
 
Reemplaza el antiguo dict TOKENS global (compartido entre todos los browsers)
por un store keyed por session_id. Cada usuario tiene su propio token de Brightspace.
 
Estructura:
  SESSION_STORE[session_id] = {
      "access_token":  str,
      "refresh_token": str | None,
      "expires_at":    float (epoch),   # calculado al recibir expires_in
      "user_id":       str | None,      # sub del whoami de Brightspace
      "user_name":     str | None,
      "user_email":    str | None,
      "iat":           float,           # timestamp de creación de la sesión
  }
 
Compatibilidad hacia atrás:
  TOKENS sigue exportado para que el código legacy no falle en import.
  Apunta a un dict vacío; el código que lo use recibirá un 401 apropiado.
"""
import time
import threading
from typing import Any, Dict, Optional
 
# ── Por sesión (nuevo) ────────────────────────────────────────────────────────
SESSION_STORE: Dict[str, Dict[str, Any]] = {}
_STORE_LOCK = threading.Lock()
 
SESSION_TTL = 60 * 60 * 8   # 8 horas — igual que la cookie
CLEANUP_EVERY = 300          # limpiar entradas expiradas cada 5 min
_last_cleanup = 0.0
 
 
def _maybe_cleanup() -> None:
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < CLEANUP_EVERY:
        return
    _last_cleanup = now
    with _STORE_LOCK:
        dead = [sid for sid, s in SESSION_STORE.items()
                if now - float(s.get("iat", 0)) > SESSION_TTL]
        for sid in dead:
            SESSION_STORE.pop(sid, None)
 
 
def save_session(session_id: str, token_data: Dict[str, Any]) -> None:
    """
    Guarda o actualiza el token de un usuario.
    token_data debe contener al menos 'access_token'.
    """
    _maybe_cleanup()
    now = time.time()
    expires_in = int(token_data.get("expires_in") or 3600)
    entry = {
        "access_token":  token_data.get("access_token", ""),
        "refresh_token": token_data.get("refresh_token"),
        "token_type":    token_data.get("token_type", "Bearer"),
        "scope":         token_data.get("scope", ""),
        "expires_at":    now + expires_in,
        "user_id":       token_data.get("user_id"),
        "user_name":     token_data.get("user_name"),
        "user_email":    token_data.get("user_email"),
        "iat":           now,
    }
    with _STORE_LOCK:
        SESSION_STORE[session_id] = entry
 
 
def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retorna la sesión si existe y no expiró, o None."""
    _maybe_cleanup()
    with _STORE_LOCK:
        s = SESSION_STORE.get(session_id)
    if not s:
        return None
    if time.time() > float(s.get("expires_at", 0)):
        with _STORE_LOCK:
            SESSION_STORE.pop(session_id, None)
        return None
    return s
 
 
def delete_session(session_id: str) -> None:
    with _STORE_LOCK:
        SESSION_STORE.pop(session_id, None)
 
 
def get_access_token(session_id: str) -> Optional[str]:
    """Atajo: devuelve solo el access_token de la sesión, o None."""
    s = get_session(session_id)
    return s.get("access_token") if s else None
 
 
# ── Compatibilidad hacia atrás ────────────────────────────────────────────────
# El dict global ya no se usa para autenticación real.
# Se mantiene vacío para que los imports legacy no rompan.
TOKENS: Dict[str, Any] = {}