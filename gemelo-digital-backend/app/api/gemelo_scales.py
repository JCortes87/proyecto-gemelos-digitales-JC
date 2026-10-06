# app/api/gemelo_scales.py
"""BETA — Escala de logro de los conjuntos de RA (lo/outcomeScales) como umbrales sugeridos.
Se monta bajo el router principal de gemelo (prefix /gemelo).
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request

from app.rate_limit import limiter
from app.services.gemelo_service import GemeloService
from app.services.outcome_scales import build_outcome_scales
from app.api.gemelo_shared import get_service, _http500
from app.api.course_auth import require_course_staff

router = APIRouter()


@router.get("/course/{orgUnitId}/outcome-scales")
@limiter.limit("30/minute")
async def gemelo_outcome_scales(
    request: Request,
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """Escalas de logro de los conjuntos de RA del curso y umbrales sugeridos.

    Errores de Brightspace (401/403/404/5xx) no se propagan: se responde
    `{"available": false, "reason", "detail"}` con un mensaje en español.
    """
    try:
        return await build_outcome_scales(svc.bs, orgUnitId)
    except Exception as e:
        _http500(e, "gemelo_outcome_scales", orgUnitId=orgUnitId)
