import os
import secrets
import urllib.parse
from datetime import datetime, timezone
 
import httpx
import logging
 
from fastapi import FastAPI, Request, Query, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
 
from app.state import (
    TOKENS,               # dict vacío — solo para imports legacy
    save_session,
    get_session,
    delete_session,
    get_access_token,
)
from app.api.gemelo import router as gemelo_router
from app.api.lti_keys import get_jwks
from app.api import lti
 
logger = logging.getLogger("uvicorn.error")
 
# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Gemelo Digital - Backend")
 
app.include_router(lti.router)
app.include_router(gemelo_router)
 
# ──────────────────────────────────────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGIN_REGEX = (
    r"^https:\/\/(.*\.)?cesa\.edu\.co$"
    r"|^http:\/\/localhost(:\d+)?$"
    r"|^http:\/\/127\.0\.0\.1(:\d+)?$"
)
 
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
# ──────────────────────────────────────────────────────────────────────────────
# Configuración Brightspace OAuth
# ──────────────────────────────────────────────────────────────────────────────
BRIGHTSPACE_BASE_URL  = (os.getenv("BRIGHTSPACE_BASE_URL",  "") or "").rstrip("/")
LP_VERSION            = os.getenv("BRIGHTSPACE_LP_VERSION", "1.50")
LE_VERSION            = os.getenv("BRIGHTSPACE_LE_VERSION",  "1.92")
 
BRIGHTSPACE_AUTH_URL  = os.getenv("BRIGHTSPACE_AUTH_URL",  "https://auth.brightspace.com/oauth2/auth")
BRIGHTSPACE_TOKEN_URL = os.getenv("BRIGHTSPACE_TOKEN_URL", "https://auth.brightspace.com/core/connect/token")
 
CLIENT_ID     = os.getenv("BRIGHTSPACE_CLIENT_ID",     "")
CLIENT_SECRET = os.getenv("BRIGHTSPACE_CLIENT_SECRET", "")
REDIRECT_URI  = os.getenv("BRIGHTSPACE_REDIRECT_URI",  "")
SCOPE         = os.getenv("BRIGHTSPACE_SCOPE",         "core:*:* enrollment:orgunit:read users:profile:read")
FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL",         "").rstrip("/")
 
# Cookie config
SESSION_COOKIE   = "gemelo_session_id"
SESSION_MAX_AGE  = 60 * 60 * 8     # 8 horas
_tool_is_https   = lambda: (os.getenv("TOOL_BASE_URL", "") or "").lower().startswith("https://")
 
# ──────────────────────────────────────────────────────────────────────────────
# Static frontend
# ──────────────────────────────────────────────────────────────────────────────
FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend_dist")
)
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
 
 
# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────
def _get_session_id(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)
 
 
def _require_session(request: Request):
    """
    Dependency FastAPI: extrae y valida la sesión del usuario.
    Lanza 401 si no está autenticado.
    """
    sid = _get_session_id(request)
    if not sid:
        raise HTTPException(
            status_code=401,
            detail="No autenticado. Inicia sesión en /auth/brightspace/login",
        )
    session = get_session(sid)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Sesión expirada o inválida. Vuelve a iniciar sesión.",
        )
    return session
 
 
def _require_token_from_request(request: Request) -> tuple[str, JSONResponse | None]:
    """
    Versión legacy-compatible: devuelve (token, None) o (None, JSONResponse 401).
    Mantiene la firma que usan los endpoints de main.py existentes.
    """
    sid = _get_session_id(request)
    if sid:
        token = get_access_token(sid)
        if token:
            return token, None
 
    return None, JSONResponse(
        status_code=401,
        content={
            "error": (
                "No autenticado. "
                "Inicia sesión en /auth/brightspace/login "
                "o accede desde Brightspace mediante LTI."
            )
        },
    )
 
 
def _auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}
 
 
async def _bs_get(
    url: str,
    headers: dict,
    params: dict | None = None,
    timeout: int = 30,
) -> tuple[int, dict | list]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(url, headers=headers, params=params or {})
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    return r.status_code, body
 
 
async def _get_whoami_id(headers: dict) -> tuple[str | None, JSONResponse | None]:
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    status, data = await _bs_get(url, headers)
    if status != 200:
        return None, JSONResponse(
            status_code=502,
            content={"error": "whoami falló", "status": status, "detail": data},
        )
    uid = data.get("Identifier") or data.get("UserId") or data.get("userId")
    if not uid:
        return None, JSONResponse(
            status_code=502,
            content={"error": "whoami no devolvió Identifier", "data": data},
        )
    return str(uid), None
 
 
# ──────────────────────────────────────────────────────────────────────────────
# Health / Debug
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}
 
 
@app.get("/debug/runtime")
def debug_runtime():
    from app.state import SESSION_STORE
    return {
        "brightspace_base_url": BRIGHTSPACE_BASE_URL,
        "lp_version":  LP_VERSION,
        "le_version":  LE_VERSION,
        "active_sessions": len(SESSION_STORE),
        "has_client_id": bool(CLIENT_ID),
        "has_client_secret": bool(CLIENT_SECRET),
        "redirect_uri": REDIRECT_URI,
    }
 
 
@app.get("/debug/tokens")
def debug_tokens(request: Request):
    """Solo para debugging — nunca exponer en producción info sensible."""
    sid = _get_session_id(request)
    from app.state import get_session as _gs
    s = _gs(sid) if sid else None
    return {
        "has_session_cookie": bool(sid),
        "session_valid": bool(s),
        "user_id":   s.get("user_id")    if s else None,
        "user_name": s.get("user_name")  if s else None,
        "scope":     s.get("scope")      if s else None,
    }
 
 
# ──────────────────────────────────────────────────────────────────────────────
# JWKS (LTI)
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/.well-known/jwks.json")
def well_known_jwks():
    return get_jwks()
 
 
# ──────────────────────────────────────────────────────────────────────────────
# Error handler
# ──────────────────────────────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )
 
 
# ──────────────────────────────────────────────────────────────────────────────
# OAuth 2.0 — Login por usuario (Microsoft → Brightspace)
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/auth/brightspace/login")
def brightspace_login(
    next: str | None = Query(default=None, description="URL de retorno tras login"),
    org_unit_id: str | None = Query(default=None, description="Curso a preseleccionar"),
):
    """
    Inicia el flujo OAuth 2.0 (PKCE-less, authorization_code).
    Microsoft SSO está configurado en Brightspace como IdP, así que
    Brightspace redirige automáticamente a Microsoft si la sesión no está activa.
    """
    if not CLIENT_ID or not REDIRECT_URI:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Faltan BRIGHTSPACE_CLIENT_ID y/o BRIGHTSPACE_REDIRECT_URI"
            },
        )
 
    # Codificar estado para retornar tras el callback
    state_payload = secrets.token_urlsafe(24)
    # Guardamos next y org_unit_id en un mini-state firmado
    import json, base64, hmac, hashlib
    secret = os.getenv("SESSION_SECRET", "change-me")
    raw = json.dumps({"s": state_payload, "next": next or "", "ou": org_unit_id or ""})
    sig = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()[:16]
    state = base64.urlsafe_b64encode(f"{raw}|||{sig}".encode()).decode().rstrip("=")
 
    params = {
        "client_id":     CLIENT_ID,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         SCOPE,
        "state":         state,
    }
    url = f"{BRIGHTSPACE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)
 
 
@app.get("/auth/brightspace/callback")
async def brightspace_callback(request: Request):
    """
    Callback de Brightspace OAuth.
    - Intercambia el código por un access_token.
    - Guarda el token en SESSION_STORE keyed por un session_id único.
    - Establece cookie httponly con el session_id.
    - Redirige al frontend con ?orgUnitId= si venía de LTI.
    """
    code   = request.query_params.get("code")
    state  = request.query_params.get("state")
    error  = request.query_params.get("error")
    error_desc = request.query_params.get("error_description")
 
    if error:
        return JSONResponse(
            status_code=400,
            content={"error": error, "description": error_desc},
        )
    if not code:
        return JSONResponse(status_code=400, content={"error": "Falta code en callback"})
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        return JSONResponse(
            status_code=500,
            content={"error": "Configuración OAuth incompleta en el servidor"},
        )
 
    # Decodificar state para recuperar next/org_unit_id
    next_url = ""
    org_unit_id = ""
    if state:
        try:
            import json, base64
            pad = "=" * ((4 - len(state) % 4) % 4)
            raw_full = base64.urlsafe_b64decode(state + pad).decode()
            raw, _ = raw_full.rsplit("|||", 1)
            payload = json.loads(raw)
            next_url    = payload.get("next", "")
            org_unit_id = payload.get("ou", "")
        except Exception:
            pass
 
    # Intercambiar code por token
    data = {
        "grant_type":    "authorization_code",
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri":  REDIRECT_URI,
        "code":          code,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(BRIGHTSPACE_TOKEN_URL, data=data)
 
    if resp.status_code != 200:
        return JSONResponse(
            status_code=resp.status_code,
            content={"error": "Token exchange falló", "detail": resp.text[:500]},
        )
 
    token_json = resp.json()
    access_token = token_json.get("access_token")
    if not access_token:
        return JSONResponse(
            status_code=500,
            content={"error": "Brightspace no devolvió access_token"},
        )
 
    # Obtener info del usuario para enriquecer la sesión
    headers = {"Authorization": f"Bearer {access_token}"}
    uid, user_name, user_email = None, None, None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami",
                headers=headers,
            )
            if r.status_code == 200:
                w = r.json()
                uid        = str(w.get("Identifier") or w.get("UserId") or "")
                user_name  = w.get("FirstName", "") + " " + w.get("LastName", "")
                user_email = w.get("UniqueName") or w.get("EmailAddress") or ""
    except Exception as e:
        logger.warning("whoami falló al crear sesión: %s", e)
 
    # Crear sesión
    session_id = secrets.token_urlsafe(32)
    save_session(session_id, {
        **token_json,
        "user_id":    uid,
        "user_name":  (user_name or "").strip(),
        "user_email": user_email,
    })
    logger.info("Sesión creada para user_id=%s name=%s", uid, user_name)
 
    # Construir redirect al frontend
    front = FRONTEND_BASE or ""
    if next_url and next_url.startswith("/"):
        redirect_to = f"{front}{next_url}"
    elif org_unit_id:
        redirect_to = f"{front}/?orgUnitId={org_unit_id}"
    else:
        redirect_to = f"{front}/"
 
    response = RedirectResponse(url=redirect_to, status_code=302)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        httponly=True,
        secure=_tool_is_https(),
        samesite="lax",      # "lax" funciona mejor que "none" fuera de iframes
        max_age=SESSION_MAX_AGE,
        path="/",
    )
    return response
 
 
@app.get("/auth/me")
async def auth_me(request: Request):
    """
    Devuelve la identidad del usuario autenticado.
    El frontend lo llama al montar para saber si mostrar login o dashboard.
    """
    sid = _get_session_id(request)
    if not sid:
        return JSONResponse({"authenticated": False})
    session = get_session(sid)
    if not session:
        return JSONResponse({"authenticated": False})
    return JSONResponse({
        "authenticated": True,
        "user_id":    session.get("user_id"),
        "user_name":  session.get("user_name"),
        "user_email": session.get("user_email"),
        "iat":        session.get("iat"),
    })
 
 
@app.post("/auth/logout")
async def auth_logout(request: Request):
    """Cierra la sesión del usuario y limpia la cookie."""
    sid = _get_session_id(request)
    if sid:
        delete_session(sid)
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
 
 
# ──────────────────────────────────────────────────────────────────────────────
# Brightspace proxy endpoints (protegidos por sesión)
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/brightspace/whoami")
async def brightspace_whoami(request: Request):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
async def _fetch_all_enrollments(
    headers: dict,
    user_id: str,
    org_unit_type_id: int = 3,
    limit: int = 500,
) -> list:
    all_items = []
    bookmark = None
    fetched = 0
 
    while fetched < limit:
        params: dict = {"orgUnitTypeId": org_unit_type_id}
        if bookmark:
            params["bookmark"] = bookmark
 
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
            f"/enrollments/users/{user_id}/orgUnits/"
        )
        status, data = await _bs_get(url, headers, params)
        if status != 200:
            break
 
        items = data.get("Items") or data.get("items") or []
        if not items:
            break
 
        all_items.extend(items)
        fetched += len(items)
 
        paging = data.get("PagingInfo") or data.get("pagingInfo") or {}
        if not paging.get("HasMoreItems") and not paging.get("hasMoreItems"):
            break
        bookmark = paging.get("Bookmark") or paging.get("bookmark")
        if not bookmark:
            break
 
    return all_items
 
 
def _normalize_offering(ou: dict) -> dict:
    from datetime import date
    today = date.today().isoformat()
    end_raw = ou.get("EndDate") or ou.get("endDate") or ""
    is_active = True
    if end_raw:
        try:
            is_active = end_raw[:10] >= today
        except Exception:
            pass
    return {
        "id":        ou.get("Id") or ou.get("id"),
        "name":      ou.get("Name") or ou.get("name") or "",
        "code":      ou.get("Code") or ou.get("code") or "",
        "startDate": ou.get("StartDate") or ou.get("startDate"),
        "endDate":   end_raw or None,
        "isActive":  is_active,
    }
 
 
@app.get("/brightspace/my-courses")
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
    status, data = await _bs_get(url, headers, params)
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/my-course-offerings")
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
 
        # Filtrar solo donde el usuario es instructor (Access.ClasslistRoleName)
        access = item.get("Access") or {}
        role_name = (access.get("ClasslistRoleName") or "").lower()
        if role_name and "instructor" not in role_name and "faculty" not in role_name and "teaching" not in role_name:
            continue
 
        offering = _normalize_offering(ou)
        if active_only and not offering["isActive"]:
            continue
        if search and search.lower() not in offering["name"].lower():
            continue
        offerings.append(offering)
 
    offerings.sort(key=lambda x: (not x["isActive"], (x["name"] or "").lower()))
    return {"count": len(offerings), "active_only": active_only, "items": offerings}
 
 
@app.get("/brightspace/courses/enrolled")
async def brightspace_courses_enrolled(
    request: Request,
    active_only: bool = Query(default=True),
    limit:       int  = Query(default=200),
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
 
 
@app.get("/brightspace/courses/all")
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
 
 
@app.get("/brightspace/course/{org_unit_id}")
async def brightspace_course(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/courses/{org_unit_id}"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/course/{org_unit_id}/classlist")
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
 
 
@app.get("/brightspace/users/{user_id}")
async def brightspace_user(request: Request, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/{user_id}"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/course/{org_unit_id}/content/root")
async def brightspace_content_root(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/course/{org_unit_id}/grades/items")
async def brightspace_grade_items(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/course/{org_unit_id}/grades/student/{user_id}")
async def brightspace_grade_values(request: Request, org_unit_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/values/{user_id}/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/course/{org_unit_id}/grades/{grade_object_id}/student/{user_id}")
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
 
 
@app.get("/brightspace/course/{org_unit_id}/gradeitem/{grade_object_id}")
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
 
 
@app.get("/brightspace/course/{org_unit_id}/grades/student/{user_id}/evidence")
async def brightspace_student_evidence(request: Request, org_unit_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
 
    items_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/"
    _, items_data = await _bs_get(items_url, headers)
    grade_items = (
        items_data if isinstance(items_data, list)
        else items_data.get("Items") or items_data.get("items") or []
    )
 
    import asyncio
    async def _fetch_one(item):
        gid = item.get("Id") or item.get("id")
        if not gid:
            return None
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
            f"/{org_unit_id}/grades/{gid}/values/{user_id}"
        )
        s, d = await _bs_get(url, headers)
        if s != 200:
            return None
        return {
            "gradeObjectId": gid,
            "name":          item.get("Name") or item.get("name") or f"Ítem {gid}",
            "gradeType":     item.get("GradeType") or item.get("gradeType"),
            "maxPoints":     item.get("MaxPoints") or item.get("maxPoints"),
            "weight":        item.get("Weight") or item.get("weight"),
            "value":         d,
        }
 
    results = await asyncio.gather(*[_fetch_one(i) for i in grade_items[:50]])
    evidences = [r for r in results if r]
    return {"orgUnitId": org_unit_id, "userId": user_id, "evidences": evidences}
 
 
@app.get("/brightspace/course/{org_unit_id}/dropbox/folders")
async def brightspace_dropbox_folders(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)
 
 
@app.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}")
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
 
 
@app.get("/brightspace/course/{org_unit_id}/assignments/{assignment_id}")
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
 
 
@app.get("/brightspace/course/{org_unit_id}/assignment/{assignment_id}/rubric/student/{user_id}")
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
 
 
@app.get("/brightspace/course/{org_unit_id}/dropbox/{folder_id}/feedback/user/{user_id}")
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
 
 
@app.get(
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
 
 
@app.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/assessment/{user_id}")
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
@app.get("/gemelo/course/{org_unit_id}/assignment/{folder_id}/student/{user_id}")
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
 
 
# ──────────────────────────────────────────────────────────────────────────────
# SPA fallback
# ──────────────────────────────────────────────────────────────────────────────
if os.path.isdir(FRONTEND_DIST):
    @app.get("/")
    def serve_index():
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index) if os.path.exists(index) else JSONResponse({"status": "no index.html"})
 
    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index) if os.path.exists(index) else JSONResponse({"status": "no index.html"})
