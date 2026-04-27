"""
Utilidades para decidir si un payload servido desde Postgres aún es lo
suficientemente reciente para evitar la llamada a Brightspace.

Convención: los modelos del fork usan `datetime.utcnow` (naive UTC) como
default. Tratamos cualquier datetime sin tzinfo como UTC para comparar
sin sorpresas con `datetime.now(timezone.utc)`.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional


def is_fresh(last_sync_at_iso: Optional[str], max_age_minutes: int = 30) -> bool:
    """
    True si `last_sync_at_iso` (ISO 8601) está dentro de la ventana
    `max_age_minutes` minutos respecto al ahora UTC.

    Casos donde retorna False:
    - last_sync_at_iso es None o cadena vacía.
    - La cadena no parsea como ISO datetime.
    - La fecha es más vieja que la ventana.
    - max_age_minutes <= 0 (interpretado como "nunca usar caché").
    """
    if not last_sync_at_iso or max_age_minutes <= 0:
        return False

    try:
        # Soporta tanto "2026-04-27T12:34:56" (naive) como
        # "2026-04-27T12:34:56+00:00" o terminado en "Z".
        cleaned = last_sync_at_iso.replace("Z", "+00:00")
        last_sync = datetime.fromisoformat(cleaned)
    except (ValueError, TypeError):
        return False

    if last_sync.tzinfo is None:
        last_sync = last_sync.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    age = now - last_sync
    return age < timedelta(minutes=max_age_minutes)
