# app/services/grade_scheme.py
"""
Esquema de calificación del curso (Brightspace grades/schemes).

Permite mostrar un porcentaje en la escala REAL del curso (p. ej. 0–5 con
aprobación en 3.0) en vez de la conversión propia de Gemelo, para que la app
y Brightspace digan lo mismo.

Fuentes, en orden:
  1) GET /d2l/api/le/(v)/(ou)/grades/schemes/default   (LE 1.98+, 20.26.09)
  2) GET /d2l/api/le/(v)/(ou)/grades/setup/  → DefaultGradeSchemeId
     GET /d2l/api/le/(v)/(ou)/grades/schemes/(id)      (versiones anteriores)
Scopes: grades:gradeschemes:read y grades:gradesettings:read.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional, Tuple

_CACHE: Dict[int, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 600
_STATUS_RE = re.compile(r"Brightspace error (\d{3})")


def _status_of(err: Exception) -> Optional[int]:
    m = _STATUS_RE.search(str(err))
    return int(m.group(1)) if m else None


def _num(v: Any) -> Optional[float]:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def normalize_scheme(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """GradeScheme de Brightspace → forma compacta con rangos ordenados por
    PercentStart ascendente. None si no trae rangos utilizables."""
    if not isinstance(raw, dict):
        return None
    ranges: List[Dict[str, Any]] = []
    for r in raw.get("Ranges") or []:
        if not isinstance(r, dict):
            continue
        start = _num(r.get("PercentStart"))
        if start is None:
            continue
        ranges.append({
            "start": start,
            "symbol": str(r.get("Symbol") or "").strip(),
            "assignedValue": _num(r.get("AssignedValue")),
            "color": r.get("Colour") or r.get("Color") or None,
        })
    if not ranges:
        return None
    ranges.sort(key=lambda x: x["start"])
    # Un esquema "Percentage" genérico (sin símbolos y con valor = % de inicio)
    # no aporta nada sobre el porcentaje que ya muestra la app.
    informative = any(
        r["symbol"] or (r["assignedValue"] is not None and r["assignedValue"] != r["start"])
        for r in ranges
    )
    return {
        "id": raw.get("Id"),
        "name": raw.get("Name") or "",
        "shortName": raw.get("ShortName") or "",
        "informative": informative,
        "ranges": ranges,
    }


def range_for_pct(scheme: Optional[Dict[str, Any]], pct: Any) -> Optional[Dict[str, Any]]:
    """Rango del esquema que corresponde a un porcentaje (el de mayor
    PercentStart <= pct). None si no hay esquema o pct no es numérico."""
    p = _num(pct)
    if not scheme or p is None:
        return None
    match = None
    for r in scheme.get("ranges") or []:
        if p >= r["start"]:
            match = r
        else:
            break
    return match or (scheme["ranges"][0] if scheme.get("ranges") else None)


async def fetch_course_grade_scheme(bs, org_unit_id: int, *, use_cache: bool = True) -> Dict[str, Any]:
    """Devuelve {"available": bool, "source": "default"|"setup"|None,
    "scheme": {...}|None, "reason"?: str}. Nunca lanza por errores de
    Brightspace: el dashboard funciona igual sin esquema."""
    now = time.monotonic()
    hit = _CACHE.get(org_unit_id)
    if use_cache and hit and now - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]

    base = f"{bs.base_url}/d2l/api/le/{bs.grade_version}/{org_unit_id}/grades"
    result: Dict[str, Any] = {"available": False, "source": None, "scheme": None}

    try:
        scheme = normalize_scheme(await bs._request_json("GET", f"{base}/schemes/default"))
        if scheme:
            result = {"available": True, "source": "default", "scheme": scheme}
    except Exception as e:
        status = _status_of(e)
        if status == 403:
            result["reason"] = "forbidden"
        elif status not in (404, 400, None):
            result["reason"] = f"error_{status}"

    if not result["available"] and result.get("reason") != "forbidden":
        try:
            setup = await bs._request_json("GET", f"{base}/setup/")
            sid = (setup or {}).get("DefaultGradeSchemeId") if isinstance(setup, dict) else None
            if sid:
                scheme = normalize_scheme(await bs._request_json("GET", f"{base}/schemes/{sid}"))
                if scheme:
                    result = {"available": True, "source": "setup", "scheme": scheme}
            if not result["available"]:
                result.setdefault("reason", "no_scheme")
        except Exception as e:
            status = _status_of(e)
            result["reason"] = "forbidden" if status == 403 else (result.get("reason") or "no_scheme")

    _CACHE[org_unit_id] = (now, result)
    return result
