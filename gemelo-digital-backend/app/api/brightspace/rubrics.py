"""Proxy Brightspace: evaluaciones de rúbrica y endpoint legacy de
asignación del gemelo."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.deps import (
    BRIGHTSPACE_BASE_URL,
    LE_VERSION,
    _require_token_from_request,
    _auth_headers,
    _bs_get,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get("/brightspace/course/{org_unit_id}/assignment/{assignment_id}/rubric/student/{user_id}")
async def brightspace_rubric_evaluation(
    request: Request, org_unit_id: int, assignment_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
    params = {
        "assessmentType": "Rubric",
        "objectType":     "Dropbox",
        "objectId":       str(assignment_id),
        "userId":         str(user_id),
    }
    status, data = await _bs_get(url, _auth_headers(token), params)
    return JSONResponse(status_code=status, content=data)


@router.get(
    "/brightspace/course/{org_unit_id}/dropbox/{folder_id}/rubric/{rubric_id}/assessment/user/{user_id}"
)
async def brightspace_rubric_assessment_dropbox_user(
    request: Request,
    org_unit_id: int,
    folder_id:   int,
    rubric_id:   int,
    user_id:     int,
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
    params = {
        "assessmentType": "Rubric",
        "objectType":     "Dropbox",
        "objectId":       str(folder_id),
        "rubricId":       str(rubric_id),
        "userId":         str(user_id),
    }
    status, data = await _bs_get(url, _auth_headers(token), params)
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/assessment/{user_id}")
async def brightspace_dropbox_assessment(
    request: Request, org_unit_id: int, folder_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    # Primero obtener el rubricId del folder
    folder_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    _, folder_data = await _bs_get(folder_url, _auth_headers(token))
    rubrics = (folder_data.get("Assessment") or {}).get("Rubrics") or []
    if not rubrics:
        return JSONResponse({"rubrics": [], "assessment": None, "folder": folder_data})

    rubric_id = rubrics[0].get("RubricId")
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
    params = {
        "assessmentType": "Rubric",
        "objectType":     "Dropbox",
        "objectId":       str(folder_id),
        "rubricId":       str(rubric_id),
        "userId":         str(user_id),
    }
    status, data = await _bs_get(url, _auth_headers(token), params)
    return JSONResponse(
        status_code=status,
        content={"rubricId": rubric_id, "assessment": data},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Gemelo assignment endpoint (legacy en main.py)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/gemelo/course/{org_unit_id}/assignment/{folder_id}/student/{user_id}")
async def gemelo_assignment(request: Request, org_unit_id: int, folder_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    folder_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    rubric_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
        f"/submissions/"
    )
    import asyncio
    (_, folder_data), (_, subs_data) = await asyncio.gather(
        _bs_get(folder_url, headers),
        _bs_get(rubric_url, headers),
    )

    rubrics = (folder_data.get("Assessment") or {}).get("Rubrics") or []
    rubric_id = rubrics[0].get("RubricId") if rubrics else None

    assessment = None
    if rubric_id:
        url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
        params = {
            "assessmentType": "Rubric",
            "objectType":     "Dropbox",
            "objectId":       str(folder_id),
            "rubricId":       str(rubric_id),
            "userId":         str(user_id),
        }
        _, assessment = await _bs_get(url, headers, params)

    subs_list = subs_data if isinstance(subs_data, list) else (
        subs_data.get("Items") or subs_data.get("items") or []
    )
    user_subs = [
        s for s in subs_list
        if str(s.get("EntityId") or s.get("UserId") or "") == str(user_id)
    ]

    return {
        "orgUnitId":  org_unit_id,
        "folderId":   folder_id,
        "userId":     user_id,
        "folder":     folder_data,
        "rubricId":   rubric_id,
        "assessment": assessment,
        "submissions": user_subs,
    }
