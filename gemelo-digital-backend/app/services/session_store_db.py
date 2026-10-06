# app/services/session_store_db.py
"""
Respaldo de sesiones en Postgres (tabla app_sessions).

app/state.py mantiene el store en memoria como fast-path y hace write-through
aquí. Al reiniciar/redesplegar el backend, get_session() hace fallback a esta
tabla y rehidrata la memoria — los usuarios ya NO pierden la sesión en cada
deploy.

Principios:
- 100 % best-effort: ningún error de BD debe romper el flujo de autenticación.
- Circuit breaker: si la BD no responde (p. ej. dev local sin acceso a RDS),
  se marca como caída y no se reintenta durante _RETRY_AFTER segundos, para
  no pagar el connect_timeout en cada request.
- Las escrituras van a UN hilo de fondo con cola ordenada (no bloquean el
  event loop y se aplican en el orden en que llegaron: un logout nunca queda
  "pisado" por un upsert anterior que terminó después).
- Protección en reposo: la PK es el SHA-256 del session id (un volcado de la
  tabla no entrega ids de sesión utilizables) y `data` (que incluye los
  tokens de Brightspace) va cifrado con Fernet.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger("uvicorn.error")

_RETRY_AFTER = 60.0          # segundos sin reintentar tras un fallo de BD
_db_down_until = 0.0
_down_lock = threading.Lock()

# Un solo worker = escrituras serializadas en orden de llegada.
_WRITER = ThreadPoolExecutor(max_workers=1, thread_name_prefix="session-db")

_ENC_PREFIX = "enc:v1:"


def _build_fernet() -> Fernet:
    """Llave de cifrado: SESSION_ENC_KEY (clave Fernet) si está definida; si
    no, derivada de SESSION_SECRET. Cambiar cualquiera de las dos invalida
    las sesiones guardadas (los usuarios vuelven a iniciar sesión)."""
    explicit = (settings.session_enc_key or "").strip()
    if explicit:
        return Fernet(explicit.encode("utf-8"))
    from app.security import SESSION_SECRET
    digest = hashlib.sha256(b"gemelo-session-store:" + SESSION_SECRET.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


_FERNET = _build_fernet()


def _key(session_id: str) -> str:
    """PK en BD: SHA-256 hex (64 chars, cabe en String(64))."""
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()


def _encrypt(entry: Dict[str, Any]) -> str:
    raw = json.dumps(entry, ensure_ascii=False).encode("utf-8")
    return _ENC_PREFIX + _FERNET.encrypt(raw).decode("ascii")


def _decrypt(data: str) -> Optional[Dict[str, Any]]:
    if not data:
        return None
    if data.startswith(_ENC_PREFIX):
        try:
            raw = _FERNET.decrypt(data[len(_ENC_PREFIX):].encode("ascii"))
        except InvalidToken:
            # Llave rotada o dato corrupto: equivale a "no hay sesión".
            return None
        parsed = json.loads(raw)
    else:
        # Filas legacy (anteriores al cifrado) en JSON plano.
        parsed = json.loads(data)
    return parsed if isinstance(parsed, dict) else None


def _db_available() -> bool:
    return time.time() >= _db_down_until


def _mark_db_down(err: Exception) -> None:
    global _db_down_until
    with _down_lock:
        _db_down_until = time.time() + _RETRY_AFTER
    logger.warning(
        "session_store_db: BD no disponible (%s). Sesiones solo en memoria por %ds.",
        str(err)[:150], int(_RETRY_AFTER),
    )


def _utc_from_epoch(epoch: float) -> datetime:
    # naive UTC — consistente con el resto de modelos
    return datetime.utcfromtimestamp(float(epoch))


def _row_values(session_id: str, entry: Dict[str, Any], session_ttl: int) -> Dict[str, Any]:
    now = time.time()
    expires_at = float(entry.get("expires_at") or now)
    iat = float(entry.get("iat") or now)
    return {
        "session_id": _key(session_id),
        "data": _encrypt(entry),
        "expires_at": _utc_from_epoch(expires_at),
        "purge_after": _utc_from_epoch(iat + session_ttl),
        "updated_at": _utc_from_epoch(now),
    }


def _run_db(op_name: str, fn) -> None:
    """Ejecuta una operación de escritura con manejo uniforme de errores."""
    from app.db.session import SessionLocal
    db = None
    try:
        db = SessionLocal()
        fn(db)
        db.commit()
    except Exception as e:
        logger.debug("session_store_db.%s falló", op_name, exc_info=True)
        _mark_db_down(e)
        try:
            if db:
                db.rollback()
        except Exception:
            pass
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def _upsert_sync(session_id: str, entry: Dict[str, Any], session_ttl: int) -> None:
    from sqlalchemy import select
    from app.db.models import AppSession

    vals = _row_values(session_id, entry, session_ttl)

    def _op(db) -> None:
        row = db.execute(
            select(AppSession).where(AppSession.session_id == vals["session_id"])
        ).scalar_one_or_none()
        if row is None:
            db.add(AppSession(**vals))
        else:
            row.data = vals["data"]
            row.expires_at = vals["expires_at"]
            row.purge_after = vals["purge_after"]
            row.updated_at = vals["updated_at"]
        # Si existía la fila legacy (PK = sid en claro) se elimina al migrar.
        db.query(AppSession).filter(AppSession.session_id == session_id).delete()

    _run_db("upsert", _op)


def _delete_sync(session_id: str) -> None:
    from app.db.models import AppSession

    def _op(db) -> None:
        db.query(AppSession).filter(
            AppSession.session_id.in_([_key(session_id), session_id])
        ).delete(synchronize_session=False)

    _run_db("delete", _op)


def _purge_sync() -> None:
    from app.db.models import AppSession

    def _op(db) -> None:
        n = (
            db.query(AppSession)
            .filter(AppSession.purge_after < datetime.utcnow() - timedelta(minutes=5))
            .delete()
        )
        if n:
            logger.info("session_store_db: purgadas %d sesiones expiradas", n)

    _run_db("purge", _op)


def _submit(fn, *args) -> None:
    try:
        _WRITER.submit(fn, *args)
    except RuntimeError:
        # Executor cerrado (apagado del proceso): se descarta, es best-effort.
        pass


def upsert_async(session_id: str, entry: Dict[str, Any], session_ttl: int) -> None:
    """Persiste (crea/actualiza) la sesión en segundo plano. Best-effort."""
    if not session_id or not _db_available():
        return
    _submit(_upsert_sync, session_id, dict(entry), session_ttl)


def delete_async(session_id: str) -> None:
    """Elimina la sesión de la BD en segundo plano. Best-effort.
    Siempre se encola (aunque la BD esté marcada caída) para no dejar viva
    en BD una sesión cerrada si la BD vuelve antes de que expire."""
    if not session_id:
        return
    _submit(_delete_sync, session_id)


def flush(timeout: float = 5.0) -> None:
    """Espera a que se apliquen las escrituras encoladas (tests/apagado)."""
    try:
        _WRITER.submit(lambda: None).result(timeout=timeout)
    except Exception:
        pass


def fetch(session_id: str, include_expired: bool = False) -> Optional[Dict[str, Any]]:
    """Busca la sesión en BD (fallback tras un reinicio). Devuelve el dict de
    sesión si existe y su access_token no ha expirado; None en caso contrario.
    Con include_expired=True también devuelve sesiones con el access_token
    vencido (para poder refrescarlas), siempre dentro del techo purge_after.
    Síncrono (el llamador solo llega aquí en un miss de memoria)."""
    if not session_id or not _db_available():
        return None
    from sqlalchemy import select
    from app.db.models import AppSession
    from app.db.session import SessionLocal
    db = None
    try:
        db = SessionLocal()
        row = db.execute(
            select(AppSession).where(AppSession.session_id == _key(session_id))
        ).scalar_one_or_none()
        if row is None:
            # Compatibilidad: filas guardadas antes del hash de la PK.
            row = db.execute(
                select(AppSession).where(AppSession.session_id == session_id)
            ).scalar_one_or_none()
        if row is None:
            return None
        now = datetime.utcnow()
        if not include_expired and row.expires_at and now > row.expires_at:
            return None
        if row.purge_after and now > row.purge_after:
            return None
        data = _decrypt(row.data or "")
        return data if data and data.get("access_token") else None
    except Exception as e:
        _mark_db_down(e)
        return None
    finally:
        try:
            if db:
                db.close()
        except Exception:
            pass


def purge_expired_async() -> None:
    """Borra filas cuya vida útil máxima (purge_after) ya pasó. Best-effort."""
    if not _db_available():
        return
    _submit(_purge_sync)
