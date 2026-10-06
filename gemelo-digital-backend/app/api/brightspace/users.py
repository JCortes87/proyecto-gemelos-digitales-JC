"""Proxy Brightspace: usuarios, foto de perfil, classlist e instructores."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.services.brightspace_client import get_http_client
from app.api.deps import (
    BRIGHTSPACE_BASE_URL,
    LP_VERSION,
    LE_VERSION,
    _require_token_from_request,
    _auth_headers,
    _bs_get,
)
from app.services.brightspace.content import list_course_instructors

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get("/brightspace/user/{user_id}/image")
async def brightspace_user_image(request: Request, user_id: str):
    """Proxy the user's profile image from Brightspace.
    Returns the image bytes with appropriate content-type.
    Requires scope: users:profile:read"""
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/profile/user/{user_id}/image"
    try:
        res = await get_http_client().get(url, headers=_auth_headers(token), timeout=10.0)
        if res.status_code != 200:
            return JSONResponse(status_code=404, content={"error": "image_not_available"})
        from fastapi.responses import Response
        ct = res.headers.get("content-type", "image/jpeg")
        return Response(
            content=res.content,
            media_type=ct,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception as e:
        logger.warning("user_image fetch failed user=%s err=%s", user_id, str(e)[:200])
        return JSONResponse(status_code=404, content={"error": "image_fetch_failed"})


@router.get("/brightspace/course/{org_unit_id}/classlist")
async def brightspace_classlist(
    request: Request,
    org_unit_id: int,
    role_name: str | None = Query(default=None),
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/classlist/"
    status, data = await _bs_get(url, _auth_headers(token))
    if status != 200:
        return JSONResponse(status_code=status, content=data)
    items = data if isinstance(data, list) else (data.get("Items") or data.get("items") or [])
    if role_name:
        rn = role_name.lower()
        items = [
            i for i in items
            if rn in (i.get("RoleName") or i.get("roleName") or "").lower()
        ]
    return {"count": len(items), "items": items}


@router.get("/brightspace/course/{org_unit_id}/instructors")
async def brightspace_course_instructors(request: Request, org_unit_id: int):
    """Usuarios del curso con rol de profesor/instructor (LP enrollments,
    que a diferencia del classlist sí trae el nombre del rol).

    Devuelve {items: [{Identifier, DisplayName, RoleName}]}.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    return await list_course_instructors(headers, org_unit_id)


@router.get("/brightspace/users/{user_id}")
async def brightspace_user(request: Request, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/{user_id}"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
