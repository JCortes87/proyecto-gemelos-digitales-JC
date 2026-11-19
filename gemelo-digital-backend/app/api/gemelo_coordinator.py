# app/api/gemelo_coordinator.py
"""Vista de coordinador: resumen de actividad docente por curso.
Se monta bajo el router principal de gemelo (prefix /gemelo).

- GET  /gemelo/coordinator/course/{orgUnitId}/summary  (profesor del curso o superadmin)
- GET  /gemelo/coordinator/courses?semesterId=  cursos de un semestre real
  (estructura organizacional de Brightspace), limitados a los cursos donde el
  usuario es profesor/coordinador; el superadmin ve todos los del semestre.
- POST /gemelo/coordinator/summary/batch  {orgUnitIds: [int]} (máx. 60)
  Reemplaza las N llamadas a /overview que hacía el navegador. Los cursos
  que el usuario no puede ver devuelven {"error": "forbidden"}.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.rate_limit import limiter
from app.services.gemelo_service import GemeloService
from app.services.coordinator_summary import (
    BATCH_MAX,
    BrightspaceSummarySource,
    build_summaries_batch,
    get_course_summary,
)
from app.api.deps import _auth_headers, _get_whoami_id, _require_token_from_request
from app.services.brightspace.enrollments import (
    _collect_semesters,
    enrollment_role_name,
    fetch_semester_course_offerings,
    merged_own_enrollments,
)
from app.services.role_utils import _is_student_role
from app.api.gemelo_shared import get_service, _http500
from app.api.course_auth import (
    _is_super_admin_session,
    _session_from_request,
    get_course_access,
    require_course_staff,
)

router = APIRouter()


class CoordinatorBatchIn(BaseModel):
    orgUnitIds: List[int]
    # True = ignorar la caché de 10 min y recalcular (botón "Actualizar todo").
    refresh: bool = False


def _source_for(request: Request, svc: GemeloService) -> BrightspaceSummarySource:
    token, err = _require_token_from_request(request)
    if err:
        raise HTTPException(
            status_code=401,
            detail="No autenticado. Inicia sesión en /auth/brightspace/login",
        )
    return BrightspaceSummarySource(svc.bs, _auth_headers(token), svc)


def _own_staff_roles(enrollments: List[Dict[str, Any]]) -> Dict[str, str]:
    """{orgUnitId: rolName} de las matrículas propias que NO son de estudiante."""
    out: Dict[str, str] = {}
    for it in enrollments:
        ou = it.get("OrgUnit") or {}
        ou_id = ou.get("Id") or ou.get("id")
        if ou_id is None:
            continue
        role = (
            (it.get("Access") or {}).get("ClasslistRoleName")
            or (it.get("Role") or {}).get("Name")
            or enrollment_role_name((it.get("Role") or {}).get("Id"))
            or ""
        )
        if role and not _is_student_role(role):
            out[str(ou_id)] = role
    return out


@router.get("/coordinator/courses")
@limiter.limit("30/minute")
async def coordinator_semester_courses(
    request: Request,
    semesterId: int = Query(..., description="Id de la unidad organizativa del semestre"),
):
    """Cursos de un semestre según la estructura de Brightspace (los nombres
    de los cursos actuales no traen el código del período). Un coordinador o
    profesor solo recibe los cursos donde tiene una matrícula de staff; el
    superadmin recibe todos los del semestre."""
    token, err = _require_token_from_request(request)
    if err:
        raise HTTPException(status_code=401, detail="No autenticado. Inicia sesión en /auth/brightspace/login")
    headers = _auth_headers(token)
    try:
        semesters: List[Dict[str, Any]] = []
        await _collect_semesters(headers, semesters)
        sem = next(
            (s for s in semesters if str(s.get("Identifier") or s.get("Id") or "") == str(semesterId)),
            None,
        )
        if sem is None:
            raise HTTPException(status_code=404, detail="Semestre no encontrado")
        offerings = await fetch_semester_course_offerings(headers, sem)

        if _is_super_admin_session(_session_from_request(request) or {}):
            items = [{**o, "roleName": "Super Administrator"} for o in offerings]
        else:
            auth_user_id, err_uid = await _get_whoami_id(headers)
            _, _, merged = await merged_own_enrollments(headers, auth_user_id, err_uid, limit=5000)
            staff = _own_staff_roles(merged)
            items = [{**o, "roleName": staff[str(o["id"])]} for o in offerings if str(o["id"]) in staff]

        items.sort(key=lambda c: str(c.get("name") or "").lower())
        return {
            "semester": {
                "id": semesterId,
                "code": str(sem.get("Code") or ""),
                "name": str(sem.get("Name") or ""),
            },
            "count": len(items),
            "items": items,
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        _http500(e, "coordinator_semester_courses", semesterId=semesterId)


@router.get("/coordinator/course/{orgUnitId}/summary")
@limiter.limit("60/minute")
async def coordinator_course_summary(
    request: Request,
    orgUnitId: int,
    refresh: bool = Query(False, description="Ignora la caché de 10 minutos."),
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """Resumen de actividad docente del curso: profesores, reporte de notas
    por corte, contenido, actividades, backlog de calificación y riesgo.
    Cada sección falla de forma aislada ({"error": "..."})."""
    src = _source_for(request, svc)
    try:
        return await get_course_summary(src, orgUnitId, refresh=refresh)
    except Exception as e:
        _http500(e, "coordinator_course_summary", orgUnitId=orgUnitId)


@router.post("/coordinator/summary/batch")
@limiter.limit("20/minute")
async def coordinator_summary_batch(
    request: Request,
    body: CoordinatorBatchIn,
    svc: GemeloService = Depends(get_service),
):
    """Resúmenes de hasta 60 cursos (concurrencia 4)."""
    ids = list(dict.fromkeys(int(x) for x in (body.orgUnitIds or [])))
    if not ids:
        raise HTTPException(status_code=400, detail="orgUnitIds no puede estar vacío.")
    if len(ids) > BATCH_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {BATCH_MAX} cursos por solicitud.",
        )
    src = _source_for(request, svc)

    async def _authorize(ou: int) -> bool:
        access = await get_course_access(request, ou)
        return bool(access.get("isInstructor"))

    async def _summarize(ou: int) -> Dict[str, Any]:
        return await get_course_summary(src, ou, refresh=body.refresh)

    try:
        return await build_summaries_batch(ids, authorize=_authorize, summarize=_summarize)
    except Exception as e:
        _http500(e, "coordinator_summary_batch", count=len(ids))
