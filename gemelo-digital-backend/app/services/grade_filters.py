"""
Filtros y predicados sobre grade values de Brightspace.

Los grade values de Brightspace son dicts con varios campos
(PointsNumerator, PointsDenominator, DisplayedGrade, LastModified,
WeightedNumerator, WeightedDenominator, etc.) que pueden venir nulos
o ausentes dependiendo del estado del item. Estas funciones
encapsulan los chequeos defensivos para clasificar un value como
"calificado", "cero", etc. sin que el codigo de logica tenga que
tener if-spaghetti.
"""
from __future__ import annotations

from typing import Any, Dict


#|---------- Detectar si un grade value cuenta como calificado ----------|
def _is_graded_value(v: Dict[str, Any]) -> bool:
    """
    Define si un grade value cuenta como 'calificado' para cobertura.

    Reglas (en orden de preferencia):
    1. Si hay PointsDenominator > 0  -> calificado.
    2. Si hay WeightedDenominator > 0 -> calificado (item con peso).
    3. Fallback: tiene DisplayedGrade o LastModified -> publicado.
    4. dict vacio {} -> NO calificado (proteccion contra grade items
       que llegaron sin data).
    """
    if not isinstance(v, dict) or not v:
        return False

    pn = v.get("PointsNumerator")
    pd = v.get("PointsDenominator")

    if pn is not None and pd is not None:
        try:
            return float(pd) > 0
        except Exception:
            return False

    # Fallback: WeightedNumerator/WeightedDenominator también indica calificado
    wn = v.get("WeightedNumerator")
    wd = v.get("WeightedDenominator")
    if wn is not None and wd is not None:
        try:
            return float(wd) > 0
        except Exception:
            return False

    return bool(v.get("DisplayedGrade") or v.get("LastModified"))


#|---------- Detectar si un grade es exactamente 0 (no entrega / nota minima) ----------|
def _is_grade_zero(points_num: Any, displayed: Any) -> bool:
    """
    True si el grade value representa 0 puntos.

    Usado para detectar "no entrega" cuando el docente puso 0/X. Mira
    primero el numerico (PointsNumerator == 0) y como fallback la
    representacion textual ("0%", "0").
    """
    try:
        if points_num is not None and float(points_num) == 0.0:
            return True
    except Exception:
        pass

    disp = str(displayed or "").strip().lower()
    return disp in {"0%", "0.0%", "0"}


#|---------- Variante de _is_graded_value usando solo points_num/points_den ----------|
def _is_graded(points_num: Any, points_den: Any) -> bool:
    """
    Version simplificada que recibe los dos puntos directamente
    (no el dict completo).

    True si points_num != None y points_den > 0. Util cuando ya
    extrajimos los pares de un grade item.
    """
    try:
        return (
            points_num is not None
            and points_den is not None
            and float(points_den) > 0
        )
    except Exception:
        return False
