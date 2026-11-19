"""Proxy Brightspace: calificaciones (grade items, valores, evidencias)."""
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
from app.services.brightspace.grades import student_grade_evidence

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get("/brightspace/course/{org_unit_id}/grades/items")
async def brightspace_grade_items(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/student/{user_id}")
async def brightspace_grade_values(request: Request, org_unit_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/values/{user_id}/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/{grade_object_id}/student/{user_id}")
async def brightspace_grade_value_by_item(
    request: Request, org_unit_id: int, grade_object_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/grades/{grade_object_id}/values/{user_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/gradeitem/{grade_object_id}")
async def brightspace_gradeitem_detail(request: Request, org_unit_id: int, grade_object_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/grades/{grade_object_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/student/{user_id}/evidence")
async def brightspace_student_evidence(request: Request, org_unit_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    return await student_grade_evidence(headers, org_unit_id, user_id)
