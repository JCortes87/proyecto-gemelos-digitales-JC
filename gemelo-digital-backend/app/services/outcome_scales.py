# app/services/outcome_scales.py
"""BETA — Escalas de logro (Achievement Scales) de los conjuntos de RA.

Brightspace 20.26.07+ permite a los administradores asociar una escala de logro
a cada conjunto de resultados de aprendizaje (OutcomeSet). Desde LE 1.98 cada
OutcomeSet trae `ScaleId` y `AchievementThresholdLevelId`; la escala se lee con
`GET /d2l/api/le/(v)/lo/outcomeScales/(scaleId)` (scope outcomes:scales:read).

Este módulo:
  * lee las escalas usadas por los conjuntos de RA del curso (con caché de 10 min
    y fallback de versión ante 404, porque la documentación es inconsistente
    sobre la versión mínima);
  * propone umbrales de riesgo (crítico / observación) a partir de la escala más
    usada — función pura `suggest_thresholds`, probada en tests.

Nunca lanza por errores de Brightspace: devuelve `{"available": False, ...}` con
un mensaje en español para el docente/administrador.
"""
from __future__ import annotations

import logging
import time
import unicodedata
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("uvicorn.error")

CACHE_TTL_SECONDS = 600
# scaleId -> (timestamp, escala normalizada)
_SCALE_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}

FALLBACK_VERSIONS = ("1.98", "1.97")

ACHIEVEMENT_NAME_HINTS = (
    "logrado", "alcanzado", "competente", "satisfactorio",
    "achieved", "proficient", "meets",
)

NEGATION_WORDS = {"no", "not", "sin", "nunca", "below", "partially", "parcialmente"}

SCOPE_SCALES = "outcomes:scales:read"
SCOPE_SETS = "outcomes:sets:read"

MSG_MISSING_SCOPE_SCALES = (
    "Brightspace rechazó la lectura de escalas de logro (403). Un administrador "
    f"debe agregar el scope '{SCOPE_SCALES}' a la aplicación OAuth registrada en "
    "Brightspace y a la variable BRIGHTSPACE_SCOPE del servidor; luego los "
    "docentes deben volver a iniciar sesión."
)
MSG_MISSING_SCOPE_SETS = (
    "Brightspace rechazó la lectura de los conjuntos de resultados de aprendizaje "
    f"(403). Un administrador debe verificar que la aplicación OAuth tenga el scope "
    f"'{SCOPE_SETS}'."
)
MSG_UNAUTHORIZED = (
    "La sesión con Brightspace no es válida o expiró (401). Vuelve a iniciar sesión."
)
MSG_NOT_SUPPORTED = (
    "Esta instancia de Brightspace no expone la API de escalas de logro "
    "(lo/outcomeScales). Requiere Brightspace 20.26.07 o superior."
)
MSG_NO_SCALE = (
    "Ningún conjunto de resultados de aprendizaje de este curso tiene una escala "
    "de logro asociada. Un administrador puede configurarla en Brightspace "
    "(Resultados de aprendizaje → conjunto → Escala de logro)."
)
MSG_UPSTREAM = (
    "Brightspace no respondió correctamente al leer las escalas de logro. "
    "Intenta de nuevo más tarde."
)


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades puras
# ─────────────────────────────────────────────────────────────────────────────

def _norm_text(s: Any) -> str:
    """Minúsculas y sin tildes, para comparar nombres de niveles."""
    txt = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(c for c in txt if not unicodedata.combining(c)).lower().strip()


def _to_float(v: Any) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _same_id(a: Any, b: Any) -> bool:
    return a is not None and b is not None and str(a) == str(b)


def normalize_scale(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Convierte el JSON de Brightspace (OutcomeScale) a un dict estable."""
    levels_raw = raw.get("Levels") if isinstance(raw, dict) else None
    levels: List[Dict[str, Any]] = []
    for lv in levels_raw if isinstance(levels_raw, list) else []:
        if not isinstance(lv, dict):
            continue
        levels.append({
            "id": lv.get("LevelId"),
            "name": str(lv.get("Name") or ""),
            "color": lv.get("Color"),
            "percentThreshold": _to_float(lv.get("PercentThreshold")),
        })
    return {
        "scaleId": raw.get("ScaleId"),
        "name": str(raw.get("Name") or ""),
        "usesPercentages": bool(raw.get("UsesPercentages")),
        "achievementThresholdLevelId": raw.get("AchievementThresholdLevelId"),
        "levels": levels,
    }


def _achievement_index(
    scale: Dict[str, Any], set_threshold_id: Any = None,
) -> Tuple[Optional[int], str]:
    """Índice del nivel de logro y explicación de cómo se eligió."""
    levels = scale.get("levels") or []
    if not levels:
        return None, ""
    for source_id, how in (
        (scale.get("achievementThresholdLevelId"), "el umbral de logro definido en la escala"),
        (set_threshold_id, "el umbral de logro definido en el conjunto de RA"),
    ):
        if source_id is None:
            continue
        for i, lv in enumerate(levels):
            if _same_id(lv.get("id"), source_id):
                return i, how
    for i, lv in enumerate(levels):
        name = _norm_text(lv.get("name"))
        # "No logrado" / "Not achieved" / "Aún no alcanzado" NO son el nivel de logro.
        words = set(name.replace("-", " ").split())
        if words & NEGATION_WORDS:
            continue
        if any(h in name for h in ACHIEVEMENT_NAME_HINTS):
            return i, f"el primer nivel cuyo nombre sugiere logro («{lv.get('name')}»)"
    return len(levels) // 2, "el nivel intermedio de la escala (no hay umbral de logro definido)"


def pick_main_scale(
    outcome_sets: List[Dict[str, Any]],
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Escala usada por más conjuntos de RA (empate → la primera que aparece).

    Devuelve (scaleId, primer outcome set que la usa)."""
    ids = [str(s.get("ScaleId")) for s in outcome_sets if s.get("ScaleId") is not None]
    if not ids:
        return None, None
    counts = Counter(ids)
    best = max(counts.values())
    main_id = next(i for i in ids if counts[i] == best)
    first_set = next(s for s in outcome_sets if str(s.get("ScaleId")) == main_id)
    return main_id, first_set


def suggest_thresholds(
    scale: Optional[Dict[str, Any]], set_threshold_id: Any = None,
) -> Dict[str, Any]:
    """Umbrales sugeridos (crítico / observación) a partir de una escala normalizada.

    Devuelve siempre `{"suggested": {...} | None, "basis": str}`.
    Regla:
      * watch   = % del nivel de logro (umbral de la escala, si no el del
                  conjunto, si no el primer nivel con nombre de logro, si no el
                  nivel mediano);
      * critical = % del nivel inmediatamente inferior; si es 0 o no existe,
                  max(0, watch - 20).
    Se exige 0 ≤ critical < watch ≤ 100.
    """
    if not scale:
        return {"suggested": None, "basis": "No hay escala de logro disponible."}
    name = scale.get("name") or "sin nombre"
    if not scale.get("usesPercentages"):
        return {
            "suggested": None,
            "basis": (
                f"La escala «{name}» no usa porcentajes, así que no se pueden "
                "derivar umbrales numéricos de riesgo."
            ),
        }
    levels = scale.get("levels") or []
    if not levels:
        return {"suggested": None, "basis": f"La escala «{name}» no tiene niveles."}

    pcts = [lv.get("percentThreshold") for lv in levels]
    if any(p is None for p in pcts):
        return {
            "suggested": None,
            "basis": f"La escala «{name}» tiene niveles sin porcentaje definido.",
        }
    if any(b <= a for a, b in zip(pcts, pcts[1:])):
        return {
            "suggested": None,
            "basis": (
                f"Los porcentajes de la escala «{name}» no están en orden creciente; "
                "no se puede sugerir un umbral confiable."
            ),
        }

    idx, how = _achievement_index(scale, set_threshold_id)
    if idx is None:
        return {"suggested": None, "basis": f"La escala «{name}» no tiene niveles."}
    ach = levels[idx]
    watch = float(ach["percentThreshold"])

    below = levels[idx - 1]["percentThreshold"] if idx > 0 else None
    if below is None or float(below) == 0:
        critical = max(0.0, watch - 20)
        crit_how = f"{watch:g} − 20 puntos (el nivel inferior empieza en 0 % o no existe)"
    else:
        critical = float(below)
        crit_how = f"el nivel inmediatamente inferior («{levels[idx - 1]['name']}», {critical:g} %)"

    watch = min(100.0, max(0.0, watch))
    critical = min(100.0, max(0.0, critical))
    if not critical < watch:
        return {
            "suggested": None,
            "basis": (
                f"Con la escala «{name}» el umbral crítico ({critical:g} %) no queda "
                f"por debajo del de observación ({watch:g} %); no se sugiere un valor."
            ),
        }
    basis = (
        f"Escala «{name}»: observación = «{ach['name']}» ({watch:g} %), según {how}; "
        f"crítico = {crit_how}."
    )
    return {"suggested": {"critical": critical, "watch": watch}, "basis": basis}


# ─────────────────────────────────────────────────────────────────────────────
# Acceso a Brightspace
# ─────────────────────────────────────────────────────────────────────────────

def _versions(configured: Any) -> List[str]:
    out: List[str] = []
    for v in (str(configured or "").strip(), *FALLBACK_VERSIONS):
        if v and v not in out:
            out.append(v)
    return out


def _unavailable(reason: str, detail: str) -> Dict[str, Any]:
    return {"available": False, "beta": True, "reason": reason, "detail": detail}


def clear_cache() -> None:
    _SCALE_CACHE.clear()


async def _get_with_fallback(bs: Any, path_tpl: str) -> Tuple[Optional[int], Any]:
    """GET probando la versión configurada y luego 1.98 → 1.97 ante 404.

    Devuelve (status, json). status None = error de red."""
    status: Optional[int] = None
    for ver in _versions(getattr(bs, "lo_version", None)):
        url = f"{bs.base_url}/d2l/api/le/{ver}{path_tpl}"
        res = await bs._raw_request("GET", url)
        status = res.get("status")
        if status == 404:
            continue
        return status, res.get("json")
    return status, None


async def fetch_scale(bs: Any, scale_id: str) -> Tuple[Optional[int], Optional[Dict[str, Any]]]:
    """Lee una escala (cacheada 10 min). Devuelve (status, escala normalizada)."""
    key = str(scale_id)
    hit = _SCALE_CACHE.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_SECONDS:
        return 200, hit[1]
    status, data = await _get_with_fallback(bs, f"/lo/outcomeScales/{key}")
    if status == 200 and isinstance(data, dict):
        scale = normalize_scale(data)
        if scale.get("scaleId") is None:
            scale["scaleId"] = scale_id
        _SCALE_CACHE[key] = (time.monotonic(), scale)
        return 200, scale
    return status, None


def _status_to_unavailable(status: Optional[int], *, sets: bool = False) -> Dict[str, Any]:
    if status == 401:
        return _unavailable("unauthorized", MSG_UNAUTHORIZED)
    if status == 403:
        return _unavailable("missing_scope", MSG_MISSING_SCOPE_SETS if sets else MSG_MISSING_SCOPE_SCALES)
    if status == 404:
        return _unavailable("not_supported", MSG_NOT_SUPPORTED)
    return _unavailable("upstream_error", MSG_UPSTREAM)


def _as_list(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("Items", "items", "Objects", "objects"):
            v = data.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


async def build_outcome_scales(bs: Any, org_unit_id: int) -> Dict[str, Any]:
    """Respuesta completa del endpoint /gemelo/course/{ou}/outcome-scales."""
    status, data = await _get_with_fallback(bs, f"/{int(org_unit_id)}/lo/outcomeSets/")
    if status != 200:
        logger.info("outcome-scales %s: outcomeSets status=%s", org_unit_id, status)
        if status == 404:
            # El curso no expone conjuntos de RA: no hay escala que leer.
            return _unavailable("no_scale", MSG_NO_SCALE)
        return _status_to_unavailable(status, sets=True)

    sets = _as_list(data)
    with_scale = [s for s in sets if s.get("ScaleId") is not None]
    if not with_scale:
        return _unavailable("no_scale", MSG_NO_SCALE)

    scales_out: List[Dict[str, Any]] = []
    by_id: Dict[str, Dict[str, Any]] = {}
    first_error: Optional[int] = None
    failed: set = set()
    for s in with_scale:
        sid = str(s.get("ScaleId"))
        if sid in failed:
            continue
        if sid not in by_id:
            st, scale = await fetch_scale(bs, sid)
            if scale is None:
                failed.add(sid)
                if first_error is None:
                    first_error = st if st is not None else -1
                continue
            by_id[sid] = scale
        scale = by_id[sid]
        ach_idx, _ = _achievement_index(scale, s.get("AchievementThresholdLevelId"))
        has_explicit = scale.get("achievementThresholdLevelId") is not None or s.get(
            "AchievementThresholdLevelId") is not None
        scales_out.append({
            "outcomeSetId": s.get("OutcomeSetId", s.get("Id")),
            "outcomeSetName": s.get("Name"),
            "scaleId": scale.get("scaleId"),
            "scaleName": scale.get("name"),
            "usesPercentages": scale.get("usesPercentages"),
            "levels": [
                {
                    "id": lv.get("id"),
                    "name": lv.get("name"),
                    "color": lv.get("color"),
                    "percentThreshold": lv.get("percentThreshold") if scale.get("usesPercentages") else None,
                    "isAchievementThreshold": bool(has_explicit and i == ach_idx),
                }
                for i, lv in enumerate(scale.get("levels") or [])
            ],
        })

    if not scales_out:
        return _status_to_unavailable(first_error if first_error and first_error > 0 else None)

    main_id, main_set = pick_main_scale(
        [s for s in with_scale if str(s.get("ScaleId")) in by_id]
    )
    sug = suggest_thresholds(
        by_id.get(main_id), (main_set or {}).get("AchievementThresholdLevelId"),
    )
    suggested = None
    if sug["suggested"]:
        suggested = {**sug["suggested"], "basis": sug["basis"]}
    return {
        "available": True,
        "beta": True,
        "scales": scales_out,
        "suggestedThresholds": suggested,
        "suggestionNote": None if suggested else sug["basis"],
    }
