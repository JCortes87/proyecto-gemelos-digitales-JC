# app/api/gemelo_rubrics.py
"""BETA — Generación de rúbricas alineadas a RA (rubrics API, LE 1.97+).
Se monta bajo el router principal de gemelo (prefix /gemelo).

Flujo seguro: GET de los RA del curso → POST /preview (dry run, sin escribir
en Brightspace) → POST /rubrics con confirm=true (crea la rúbrica como
borrador por defecto y alinea cada criterio a su RA).

Autorización: profesor del curso o super-admin (`require_course_staff`
incluye al super-admin).
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.rate_limit import limiter
from app.services.gemelo_service import GemeloService
from app.api.gemelo_shared import get_service, _http500
from app.api.course_auth import require_course_staff
from app.services import rubric_builder as rb

router = APIRouter()


class RubricLevelIn(BaseModel):
    name: str = ""
    points: Optional[float] = None


class RubricCellIn(BaseModel):
    outcomeId: str
    levelIndex: int
    description: str = ""


class RubricRequestIn(BaseModel):
    name: str = ""
    outcomeIds: List[str] = []
    levels: List[RubricLevelIn] = []
    publish: bool = False
    # Descripciones editadas en la vista previa (opcional).
    cells: Optional[List[RubricCellIn]] = None
    # Solo para la creación: debe ser True explícitamente.
    confirm: bool = False


async def _course_outcomes(svc: GemeloService, org_unit_id: int) -> List[Dict[str, Any]]:
    raw = await svc.bs.list_outcome_sets(org_unit_id)
    return rb.extract_course_outcomes(raw)


async def _prepare(svc: GemeloService, org_unit_id: int, payload: RubricRequestIn) -> Dict[str, Any]:
    # Validación barata primero (sin red): nombre, RA y niveles.
    try:
        rb.normalize_name(payload.name)
        rb.normalize_outcome_ids(payload.outcomeIds)
        rb.normalize_levels(payload.levels)
    except rb.RubricValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        outcomes = await _course_outcomes(svc, org_unit_id)
    except Exception as e:
        _http500(e, "rubrics_prepare_outcomes", orgUnitId=org_unit_id)
    try:
        return rb.prepare_rubric(
            name=payload.name,
            outcome_ids=payload.outcomeIds,
            levels=payload.levels,
            publish=bool(payload.publish),
            cells=payload.cells,
            course_outcomes=outcomes,
        )
    except rb.RubricValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/course/{orgUnitId}/rubrics/outcomes")
@limiter.limit("30/minute")
async def rubric_course_outcomes(
    orgUnitId: int,
    request: Request,
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """RA del curso (lista plana) + niveles por defecto para el generador."""
    try:
        outcomes = await _course_outcomes(svc, orgUnitId)
    except Exception as e:
        _http500(e, "rubric_course_outcomes", orgUnitId=orgUnitId)
    return {
        "orgUnitId": orgUnitId,
        "outcomes": outcomes,
        "defaultLevels": rb.DEFAULT_LEVELS,
        "limits": {
            "minOutcomes": rb.MIN_OUTCOMES, "maxOutcomes": rb.MAX_OUTCOMES,
            "minLevels": rb.MIN_LEVELS, "maxLevels": rb.MAX_LEVELS,
        },
        "beta": True,
    }


@router.post("/course/{orgUnitId}/rubrics/preview")
@limiter.limit("30/minute")
async def rubric_preview(
    orgUnitId: int,
    payload: RubricRequestIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """Dry run: devuelve el RubricInput EXACTO que se enviaría y el mapeo
    criterio → RA. No escribe nada en Brightspace (solo lee los RA)."""
    prepared = await _prepare(svc, orgUnitId, payload)
    return {
        "orgUnitId": orgUnitId,
        "dryRun": True,
        "beta": True,
        **prepared,
    }


@router.post("/course/{orgUnitId}/rubrics")
@limiter.limit("5/minute")
async def rubric_create(
    orgUnitId: int,
    payload: RubricRequestIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """Crea la rúbrica en Brightspace y alinea cada criterio a su RA.

    Requiere `confirm: true`. Respuestas de error con detail
    {reason, message, brightspaceStatus}: 403 missing_scope, 400
    invalid_request, 404 not_supported, 502 otros errores de Brightspace.
    Si la rúbrica se crea pero alguna alineación falla, responde 200 con
    `partial: true` y el error por criterio (la rúbrica NO se borra).
    """
    if payload.confirm is not True:
        raise HTTPException(
            status_code=400,
            detail="Falta la confirmación explícita (confirm: true) para crear la rúbrica.",
        )
    prepared = await _prepare(svc, orgUnitId, payload)
    try:
        result = await rb.create_rubric_with_alignments(
            svc.bs, orgUnitId, prepared, le_version=settings.brightspace_le_version,
        )
    except rb.RubricCreateError as e:
        code = {"missing_scope": 403, "invalid_request": 400, "not_supported": 404,
                "unauthorized": 401}.get(e.reason, 502)
        raise HTTPException(
            status_code=code,
            detail={"reason": e.reason, "message": e.message, "brightspaceStatus": e.status},
        )
    except HTTPException:
        raise
    except Exception as e:
        _http500(e, "rubric_create", orgUnitId=orgUnitId)

    # Las alineaciones cambiaron: invalidar la caché de RA del curso.
    try:
        from app.services.auto_lo_config import invalidate_cache
        invalidate_cache(orgUnitId)
    except Exception:
        pass

    return {"orgUnitId": orgUnitId, "beta": True, **result}
