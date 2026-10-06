"""Proxy Brightspace: dropbox / asignaciones (carpetas, entregas, estado,
descargas y feedback)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.services.brightspace_client import BrightspaceClient, get_brightspace_client, get_http_client
from app.api.deps import (
    BRIGHTSPACE_BASE_URL,
    LE_VERSION,
    _require_token_from_request,
    _auth_headers,
    _bs_get,
)
from app.services.brightspace.common import UpstreamError
from app.services.brightspace.dropbox import course_grading_status, student_dropbox_status
from app.services.brightspace.feedback import build_dropbox_feedback

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get("/brightspace/course/{org_unit_id}/dropbox/folders")
async def brightspace_dropbox_folders(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}")
async def brightspace_dropbox_folder(request: Request, org_unit_id: int, folder_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/submissions")
async def brightspace_dropbox_submissions(
    request: Request, org_unit_id: int, folder_id: int
):
    """List all submissions for a dropbox folder. Returns array of submissions
    with files, submitted dates, and entity (user/group) info."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/submissions/"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/student/{user_id}/status")
async def brightspace_dropbox_student_status(
    request: Request, org_unit_id: int, user_id: int
):
    """Estado de las asignaciones (dropbox) para UN estudiante: cuáles entregó
    (tiene submission) y cuáles ya tienen feedback/calificación del docente.

    Devuelve por asignación publicada: id, nombre, fecha de entrega,
    hasSubmission, submittedAt, isGraded y gradeItemId (para que el frontend
    pueda emparejar la nota del gradebook). Las carpetas cuya lista de
    submissions no se pudo leer quedan con hasSubmission=None y el response
    marca partial=True."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    try:
        return await student_dropbox_status(headers, org_unit_id, user_id)
    except UpstreamError as e:
        return JSONResponse(status_code=e.status, content=e.content)


@router.get("/brightspace/course/{org_unit_id}/dropbox/grading-status")
async def brightspace_dropbox_grading_status(request: Request, org_unit_id: int):
    """Estado de entregas y calificación por asignación para TODO el curso.

    Por cada asignación publicada devuelve: quiénes entregaron
    (submittedIds) y quiénes tienen la entrega SIN feedback del docente
    (pendingGrading, con nombre). Alimenta dos vistas del dashboard:
    - "Evaluación y Feedback": entregadas pendientes de calificar y de quién.
    - "Estudiantes prioritarios": vencidas sin entrega por estudiante
      (complemento de submittedIds en asignaciones con fecha pasada).
    En carpetas de entrega GRUPAL no se expanden los grupos a estudiantes:
    se marca isGroup=True y los ids/nombres son de la entidad grupo (se
    excluyen del cálculo por-estudiante en el frontend)."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    try:
        return await course_grading_status(headers, org_unit_id)
    except UpstreamError as e:
        return JSONResponse(status_code=e.status, content=e.content)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/student/{user_id}/download")
async def brightspace_dropbox_download(
    request: Request, org_unit_id: int, folder_id: int, user_id: int
):
    """Download all files submitted by a student to a dropbox folder.
    Returns a ZIP file (Brightspace native behavior).
    Requires scope: dropbox:folders:read"""
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/submissions/{user_id}/download"
    )
    try:
        res = await get_http_client().get(url, headers=_auth_headers(token), timeout=60.0)
        if res.status_code != 200:
            return JSONResponse(
                status_code=res.status_code,
                content={"error": "download_failed", "status": res.status_code},
            )
        from fastapi.responses import Response
        ct = res.headers.get("content-type", "application/zip")
        # Try to extract filename from Content-Disposition header
        cd = res.headers.get("content-disposition", "")
        filename = f"submission_{folder_id}_{user_id}.zip"
        if "filename=" in cd:
            try:
                filename = cd.split("filename=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
        return Response(
            content=res.content,
            media_type=ct,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        logger.warning("dropbox download failed folder=%s user=%s err=%s", folder_id, user_id, str(e)[:200])
        return JSONResponse(status_code=500, content={"error": "download_exception"})


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/student/{user_id}/feedback")
async def brightspace_dropbox_feedback(
    request: Request, org_unit_id: int, folder_id: int, user_id: int,
    bs: BrightspaceClient = Depends(get_brightspace_client),
):
    """Get the teacher's feedback for a student's dropbox submission,
    including the rubric assessment (per-criterion levels + comments) when
    the dropbox has rubrics associated.

    Returns:
        {
            feedback: {Score, Feedback{Text,Html}, Files, IsGraded, ...},
            folderName: str,
            rubrics: [
                {rubricId, name, outOf, score, level, criteria: [
                    {name, level, points, comment}
                ]}
            ],
        }
    Requires scope: dropbox:folders:read + rubrics:assessments:read
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    return JSONResponse(
        content=await build_dropbox_feedback(bs, headers, org_unit_id, folder_id, user_id)
    )


@router.get("/brightspace/course/{org_unit_id}/assignments/{assignment_id}")
async def brightspace_assignment(request: Request, org_unit_id: int, assignment_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{assignment_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/{folder_id}/feedback/user/{user_id}")
async def brightspace_dropbox_feedback_user(
    request: Request, org_unit_id: int, folder_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/feedback/{user_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
