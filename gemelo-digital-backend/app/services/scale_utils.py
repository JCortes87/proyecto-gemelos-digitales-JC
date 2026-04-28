"""
Helpers de escalas y umbrales para clasificar performance.

Cada curso configura su propia escala y umbrales:
- thresholds: porcentajes que separan critico / observacion / solido.
- scale: tipo de conversion (level_points o criterion_max_points) y
  parametros derivados (maxLevelPoints).

Estas funciones leen el config bundle (Pydantic o dict crudo) y
retornan los valores normalizados con defaults institucionales si
no estan definidos.

Tambien incluye lookups sobre la estructura de rubricas que devuelve
Brightspace (CriteriaGroups -> Levels / Criteria -> Cells), porque
esos lookups son tipicamente para convertir un score parcial a un
porcentaje sobre la escala total.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from app.services.common_utils import _as_dict


#|---------- Clasificacion de un % en bandas (critico/observacion/solido) ----------|
def status_from_pct(pct: Any, thresholds: Dict[str, float]) -> str:
    """
    Convierte un porcentaje a una etiqueta de status:
    - 'critico'    si pct < thresholds.critical (default 50).
    - 'observacion' si critical <= pct < watch (default 70).
    - 'solido'     si pct >= watch.
    - 'pending'    si pct viene None / no parseable (sin evidencia).

    Es el mapping uniforme usado en todo el dashboard para colorear
    badges, agrupar estudiantes en bandas, etc.
    """
    try:
        if pct is None:
            return "pending"
        p = float(pct)
    except Exception:
        return "pending"

    if p < float(thresholds.get("critical", 50.0)):
        return "critico"
    if p < float(thresholds.get("watch", 70.0)):
        return "observacion"
    return "solido"


#|---------- Lectura de thresholds desde el config bundle ----------|
def _get_thresholds(course_cfg: Any, legacy_cfg: Any) -> Dict[str, float]:
    """
    Devuelve los thresholds (critical / watch) leidos del config del
    curso, con fallback a defaults institucionales (50 / 70).

    Se prueba tanto course_cfg como legacy_cfg porque la estructura
    del config bundle ha evolucionado y ambos pueden coexistir
    (CourseInstitutionConfig vs CourseConfig). Cualquiera que tenga
    los thresholds gana.
    """
    defaults = {"critical": 50.0, "watch": 70.0}

    for cfg in (course_cfg, legacy_cfg):
        if cfg is None or cfg is ...:
            continue

        # Intento 1: lectura via getattr (objetos Pydantic)
        try:
            scale = getattr(cfg, "scale", None)
            if scale is not None and scale is not ...:
                thr = getattr(scale, "thresholds", None)
                if thr is not None and thr is not ...:
                    result = dict(thr) if not isinstance(thr, dict) else thr
                    if result:
                        return result
        except Exception:
            pass

        # Intento 2: coercion a dict y lookup por clave
        try:
            d = _as_dict(cfg)
            sc = d.get("scale")
            if isinstance(sc, dict):
                thr = sc.get("thresholds")
                if isinstance(thr, dict) and thr:
                    return thr
        except Exception:
            pass

    return defaults


#|---------- Lectura del tipo y parametros de la escala ----------|
def _get_scale_settings(legacy_cfg: Any) -> Tuple[str, float]:
    """
    Devuelve (scale_type, max_level_points) leidos del config.

    scale_type:
        - 'level_points': los niveles de la rubrica tienen un valor
          fijo (ej. niveles 1-4) y el % se calcula contra max_level_points.
        - 'criterion_max_points': cada criterio tiene su propio puntaje
          maximo y el % se calcula por criterio individual.

    max_level_points: solo aplica cuando scale_type == 'level_points'.

    Defaults: ('level_points', 4.0) — la convencion institucional CESA.
    """
    scale_type = "level_points"
    max_level_points = 4.0

    if legacy_cfg is None or legacy_cfg is ...:
        return scale_type, max_level_points

    # Intento 1: getattr (Pydantic)
    try:
        scale = getattr(legacy_cfg, "scale", None)
        if scale is not None and scale is not ...:
            st = getattr(scale, "type", None)
            if st is not None and st is not ...:
                scale_type = str(st)
            mlp = getattr(scale, "maxLevelPoints", None)
            if mlp is not None and mlp is not ...:
                try:
                    max_level_points = float(mlp)
                except Exception:
                    pass
            return scale_type, max_level_points
    except Exception:
        pass

    # Intento 2: coercion a dict
    try:
        d = _as_dict(legacy_cfg)
        sc = d.get("scale", {})
        if isinstance(sc, dict):
            st = sc.get("type")
            if st is not None:
                scale_type = str(st)
            mlp = sc.get("maxLevelPoints")
            if mlp is not None:
                try:
                    max_level_points = float(mlp)
                except Exception:
                    pass
    except Exception:
        pass

    return scale_type, max_level_points


#|---------- Lookups dentro de la estructura de rubricas Brightspace ----------|
def _lookup_level_points(
    rubric_detail: Dict[str, Any],
    level_id: Any,
) -> Optional[float]:
    """
    Dado el detail de una rubrica (response de Brightspace) y un
    level_id, retorna los Points asignados a ese nivel.

    Estructura Brightspace:
        rubric_detail.CriteriaGroups[0].Levels[*].{Id, Points}

    Solo mira el primer CriteriaGroup porque las rubricas de CESA usan
    un solo grupo. Si en el futuro hay multi-grupo, ampliar.
    """
    if level_id is None:
        return None
    try:
        level_id = int(level_id)
    except Exception:
        return None

    criteria_groups = rubric_detail.get("CriteriaGroups") or []
    if not criteria_groups:
        return None

    levels = criteria_groups[0].get("Levels") or []
    for lv in levels:
        try:
            if int(lv.get("Id")) == level_id:
                pts = lv.get("Points")
                return float(pts) if pts is not None else None
        except Exception:
            continue
    return None


def _lookup_criterion_max_points(
    rubric_detail: Dict[str, Any],
    criterion_id: Any,
) -> Optional[float]:
    """
    Dado el detail de una rubrica y un criterion_id, retorna el
    Points maximo de las celdas (Cells) de ese criterio.

    Estructura Brightspace:
        rubric_detail.CriteriaGroups[0].Criteria[*].{Id, Cells[*].Points}

    Esto se usa cuando la escala es `criterion_max_points`: cada
    criterio puede tener un puntaje maximo distinto y el % de
    desempeno se calcula contra ese maximo individual.
    """
    if criterion_id is None:
        return None
    try:
        criterion_id = int(criterion_id)
    except Exception:
        return None

    criteria_groups = rubric_detail.get("CriteriaGroups") or []
    if not criteria_groups:
        return None

    criteria = criteria_groups[0].get("Criteria") or []
    for c in criteria:
        try:
            if int(c.get("Id")) == criterion_id:
                pts = [
                    float(cell.get("Points"))
                    for cell in (c.get("Cells") or [])
                    if cell.get("Points") is not None
                ]
                return max(pts) if pts else None
        except Exception:
            continue
    return None
