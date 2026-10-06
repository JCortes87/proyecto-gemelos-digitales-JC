# app/api/gemelo_gradescheme.py
"""Esquema de calificación del curso (grades/schemes): muestra notas en la escala real de Brightspace.
Se monta bajo el router principal de gemelo (prefix /gemelo).
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request

from app.api.course_auth import require_course_member
from app.api.gemelo_shared import get_service
from app.rate_limit import limiter
from app.services.gemelo_service import GemeloService
from app.services.grade_scheme import fetch_course_grade_scheme

router = APIRouter()


@router.get("/course/{orgUnitId}/grade-scheme")
@limiter.limit("60/minute")
async def gemelo_course_grade_scheme(
    request: Request,
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_member),
):
    """Esquema de calificación por defecto del curso: rangos (PercentStart),
    símbolo y valor asignado (p. ej. 0–5). Lo usan docentes y estudiantes para
    ver la nota en la misma escala que Brightspace. Si el curso no tiene
    esquema o falta permiso, devuelve available=false (no es un error)."""
    return await fetch_course_grade_scheme(svc.bs, orgUnitId)
