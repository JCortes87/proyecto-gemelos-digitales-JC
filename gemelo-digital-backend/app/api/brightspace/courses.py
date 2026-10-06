"""Proxy Brightspace: identidad, semestres, cursos y matrículas."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from app.api.deps import (
    BRIGHTSPACE_BASE_URL,
    LP_VERSION,
    _get_session_id,
    _require_token_from_request,
    _auth_headers,
    _bs_get,
    _bs_get_cached,
    _get_whoami_id,
)
from app.services.brightspace.common import UpstreamError
from app.services.brightspace.enrollments import (
    ROLE_PRIORITY,
    _collect_semesters,
    _fetch_all_enrollments,
    _normalize_offering,
    enrolled_courses_for_target,
    merged_own_enrollments,
    search_course_offerings,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get("/brightspace/whoami")
async def brightspace_whoami(request: Request):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    status, data = await _bs_get_cached(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/semesters")
async def brightspace_semesters(
    request: Request,
    min_year: int = Query(default=2025),
):
    """List all semesters (orgUnitType=5) with code >= min_year.
    Used for the period dropdown in SuperAdmin / CoordinatorDashboard.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    semesters = []
    try:
        await _collect_semesters(headers, semesters)
    except Exception as e:
        logger.warning("semesters fetch failed: %s", str(e)[:200])

    # Normalize and filter by min_year
    out = []
    for s in semesters:
        code = str(s.get("Code") or "").strip()
        name = str(s.get("Name") or "").strip()
        sem_id = s.get("Identifier") or s.get("Id") or s.get("id")
        if not code and not name:
            continue
        # Filter by year prefix in code (YYYYTT format)
        try:
            if code[:4].isdigit() and int(code[:4]) >= min_year:
                out.append({"id": sem_id, "code": code, "name": name})
        except Exception:
            pass

    # Sort newest first: by code descending (202610 > 202520 > 202510)
    out.sort(key=lambda s: s["code"], reverse=True)
    return {"count": len(out), "items": out}


@router.get("/brightspace/all-courses")
async def brightspace_all_courses_search(
    request:     Request,
    search:      str | None = Query(default=None, description="Filtro por nombre o ID"),
    active_only: bool       = Query(default=False),
    limit:       int        = Query(default=50),
):
    """
    Lista TODOS los Course Offerings del sistema usando el endpoint orgstructure.
    Solo para super-admin: enumerar todos los cursos del tenant no es algo
    que un usuario normal deba poder hacer (Brightspace igual suele negar el
    orgstructure a no-admins, pero no dependemos de eso).
    """
    from app.api.gemelo_admin import _require_super_admin
    _require_super_admin(request)
    token, err = _require_token_from_request(request)
    if err:
        return err

    headers = _auth_headers(token)

    try:
        return await search_course_offerings(headers, search, active_only, limit)
    except UpstreamError as e:
        return JSONResponse(status_code=e.status, content=e.content)


@router.get("/brightspace/my-courses")
async def brightspace_my_courses(
    request: Request,
    bookmark: str | None = Query(default=None),
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    user_id, err = await _get_whoami_id(headers)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
        f"/enrollments/users/{user_id}/orgUnits/"
    )
    params: dict = {}
    if bookmark:
        params["bookmark"] = bookmark
    # Enrollments: cambian poco durante una sesión → caché 5 min (#11)
    status, data = await _bs_get_cached(url, headers, params)
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/my-course-offerings")
async def brightspace_my_course_offerings(
    request:     Request,
    active_only: bool       = Query(default=True),
    search:      str | None = Query(default=None),
    limit:       int        = Query(default=500),
):
    """
    Devuelve los Course Offerings donde el usuario autenticado es instructor.
    Filtra por active_only y/o search si se pasan.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    user_id, err = await _get_whoami_id(headers)
    if err:
        return err

    all_items = await _fetch_all_enrollments(headers, user_id, org_unit_type_id=3, limit=limit)

    offerings = []
    for item in all_items:
        ou = item.get("OrgUnit") or {}
        ou_type_id = (ou.get("Type") or {}).get("Id")
        if ou_type_id != 3:
            continue

        # Roles exactos de Brightspace CESA:
        #   "Estudiante EF"             → estudiante   (excluir en vista docente)
        #   "Instructor"                → docente      (incluir)
        #   "Coordinador Administrativo"→ coordinador  (incluir — futura vista coordinador)
        #   "Super Administrator"       → admin        (incluir — acceso total)
        access = item.get("Access") or {}
        role_name = (access.get("ClasslistRoleName") or "")

        ROLES_DOCENTE = {
            "Instructor",
            "Coordinador Administrativo",
            "Super Administrator",
        }
        ROLES_ESTUDIANTE = {
            "Estudiante EF",
        }

        # Si el rol es exclusivamente de estudiante, no incluir en vista docente
        if role_name in ROLES_ESTUDIANTE:
            continue

        # Si el rol no está en ninguna lista conocida pero tampoco es estudiante,
        # incluirlo por seguridad (rol personalizado o futuro)
        _ = ROLES_DOCENTE  # referencia para linting

        offering = _normalize_offering(ou)
        if active_only and not offering["isActive"]:
            continue
        if search and search.lower() not in offering["name"].lower():
            continue
        offerings.append(offering)

    offerings.sort(key=lambda x: (not x["isActive"], (x["name"] or "").lower()))

    # Guardar el rol más alto encontrado en la sesión para uso futuro
    # (vista coordinador, vista estudiante, etc.)
    detected_roles = set()
    for item in all_items:
        rn = (item.get("Access") or {}).get("ClasslistRoleName") or ""
        if rn:
            detected_roles.add(rn)
    for priority_role in ROLE_PRIORITY:
        if priority_role in detected_roles:
            sid = _get_session_id(request)
            if sid:
                from app.state import SESSION_STORE
                with __import__("threading").Lock():
                    if sid in SESSION_STORE:
                        SESSION_STORE[sid]["role"] = priority_role
                        SESSION_STORE[sid]["all_roles"] = list(detected_roles)
            break

    return {"count": len(offerings), "active_only": active_only, "items": offerings}


@router.get("/brightspace/courses/enrolled")
async def brightspace_courses_enrolled(
    request: Request,
    active_only: bool = Query(default=True),
    limit:       int  = Query(default=200),
    user_id:     int  = Query(default=None),
    period:      str  = Query(default=None, description="Filter by period code prefix, e.g. '202610'"),
):
    """Returns the authenticated user's enrollments merged from TWO endpoints:
    1. /enrollments/myenrollments/ (requires enrollment:own_enrollment:read)
       — returns courses where user is directly enrolled (student, instructor).
    2. /enrollments/users/{user_id}/orgUnits/ (requires enrollment:orgunit:read)
       — admin-level lookup that may return additional courses for Super Admins
       who have global access without explicit per-course enrollment.

    SuperAdmin case: When `user_id` query param is provided and differs from
    the auth user, Brightspace's own-enrollment endpoints silently return the
    auth user's data. We fall back to iterating over the SuperAdmin's accessible
    courses and checking each course's classlist for the target user."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    auth_user_id, err_uid = await _get_whoami_id(headers)

    # SuperAdmin querying ANOTHER user's enrollments — verificar que el
    # caller SEA super-admin: sin este check, cualquier usuario autenticado
    # podía pasar ?user_id=X y enumerar los cursos de otra persona.
    if user_id and auth_user_id and str(user_id) != str(auth_user_id):
        from app.api.gemelo_admin import _require_super_admin
        _require_super_admin(request)
        target_user_id = str(user_id)
        logger.info(
            "courses/enrolled: SuperAdmin %s querying user %s",
            auth_user_id, target_user_id,
        )
        return await enrolled_courses_for_target(
            headers, auth_user_id, target_user_id, period, limit, active_only,
        )

    # Default flow: auth user's own enrollments (merged from my + admin endpoints)
    items_my, items_admin, merged_items = await merged_own_enrollments(
        headers, auth_user_id, err_uid, limit,
    )


    offerings = []
    for i in merged_items:
        ou = i.get("OrgUnit") or {}
        offering = _normalize_offering(ou)
        # Include roleName from Access (present in both endpoints)
        access = i.get("Access") or {}
        offering["roleName"] = access.get("ClasslistRoleName") or ""
        offerings.append(offering)

    if active_only:
        offerings = [o for o in offerings if o["isActive"]]

    # Update session's all_roles from the detected roles
    detected_roles = {o["roleName"] for o in offerings if o.get("roleName")}
    if detected_roles:
        sid = _get_session_id(request)
        if sid:
            from app.state import SESSION_STORE
            import threading
            with threading.Lock():
                if sid in SESSION_STORE:
                    SESSION_STORE[sid]["all_roles"] = list(detected_roles)
                    # Set primary role if not already set
                    if not SESSION_STORE[sid].get("role"):
                        for pr in ROLE_PRIORITY:
                            if pr in detected_roles:
                                SESSION_STORE[sid]["role"] = pr
                                break

    logger.info(
        "courses/enrolled: myenrollments=%d admin=%d merged=%d final=%d",
        len(items_my), len(items_admin), len(merged_items), len(offerings),
    )

    return {"count": len(offerings), "items": offerings}


@router.get("/brightspace/courses/all")
async def brightspace_courses_all(
    request: Request,
    active_only: bool = Query(default=False),
    limit:       int  = Query(default=500),
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    user_id, err = await _get_whoami_id(headers)
    if err:
        return err
    items = await _fetch_all_enrollments(headers, user_id, org_unit_type_id=3, limit=limit)
    offerings = [_normalize_offering(i.get("OrgUnit") or {}) for i in items]
    if active_only:
        offerings = [o for o in offerings if o["isActive"]]
    return {"count": len(offerings), "items": offerings}


@router.get("/brightspace/course/{org_unit_id}")
async def brightspace_course(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/courses/{org_unit_id}"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
