"""
Utilidades genericas: coercion numerica, parsing de datetimes,
normalizacion a dict.

Este modulo guarda funciones que no pertenecen a un dominio especifico
(gradebook, riesgo, roles) sino que son utilidades de bajo nivel para
trabajar con datos heterogeneos que llegan de la API de Brightspace o
de Pydantic models del config bundle.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional


#|---------- Coercion numerica defensiva ----------|
def _num(x: Any, default: float = 0.0) -> float:
    """
    Convierte cualquier valor a float, retornando `default` ante
    cualquier error (None, str no parseable, objeto raro).

    Casos tipicos: campos de Brightspace que pueden venir None, str
    "82.5" o ya como float dependiendo del endpoint.
    """
    try:
        if x is None:
            return float(default)
        return float(x)
    except Exception:
        return float(default)


#|---------- Parsing de datetimes ISO 8601 ----------|
def _parse_iso_dt(value: Any) -> Optional[datetime]:
    """
    Parsea un string ISO 8601 a datetime, retorna None si falla.

    Acepta el formato "...Z" (UTC) convirtiendolo a "+00:00" para
    que `datetime.fromisoformat` lo procese (en versiones < Python 3.11
    fromisoformat no acepta "Z" directamente).
    """
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_due_datetime(raw: Any) -> Optional[datetime]:
    """
    Variante semantica para due dates de assignments. Identica
    implementacion a `_parse_iso_dt` pero se mantiene como alias
    porque hace el call site mas legible
    (`_parse_due_datetime(grade_item.due_date)`).
    """
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None


#|---------- Coercion a dict (para Pydantic / dataclass / objetos raros) ----------|
def _as_dict(obj: Any) -> Dict[str, Any]:
    """
    Convierte cualquier cosa razonable a un dict, defensivamente.

    Cubre los casos que aparecen en el config bundle (mezcla de
    Pydantic v1, Pydantic v2 y dicts crudos):

    - None o Ellipsis (`...`) -> {}.
    - Tipos primitivos (str, int, list, etc) -> {} (no son objetos
      con campos).
    - dict -> filtra valores Ellipsis.
    - Pydantic v2 (`model_dump`) -> dict.
    - Pydantic v1 (`.dict()`) -> dict.
    - Objeto generico con __dict__ -> filtra atributos privados y
      Ellipsis.

    El comportamiento defensivo es necesario porque
    `load_course_bundle` retorna formas distintas dependiendo del
    archivo de config y de la version de pydantic activa.
    """
    if obj is None or obj is ...:
        return {}

    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if v is not ...}

    if isinstance(obj, (str, int, float, bool, list, tuple, set)):
        return {}

    # Pydantic v2
    if hasattr(obj, "model_dump"):
        try:
            result = obj.model_dump()
            if isinstance(result, dict):
                return {k: v for k, v in result.items() if v is not ...}
        except Exception:
            pass

    # Pydantic v1
    if hasattr(obj, "dict"):
        try:
            result = obj.dict()
            if isinstance(result, dict):
                return {k: v for k, v in result.items() if v is not ...}
        except Exception:
            pass

    # Fallback: cualquier objeto con __dict__
    try:
        return {
            k: v for k, v in vars(obj).items()
            if not k.startswith("_") and v is not ...
        }
    except TypeError:
        return {}
