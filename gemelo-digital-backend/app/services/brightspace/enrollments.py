"""Matrículas, cursos (orgstructure) y semestres: helpers del proxy Brightspace."""
from __future__ import annotations

import asyncio
import logging

from app.api.deps import BRIGHTSPACE_BASE_URL, LP_VERSION, _bs_get_cached
from app.services.brightspace.common import UpstreamError

logger = logging.getLogger("uvicorn.error")

# Prioridad de roles del tenant CESA (de mayor a menor): el primero que
# aparezca entre los roles detectados del usuario es su rol principal.
ROLE_PRIORITY = ["Super Administrator", "Coordinador Administrativo", "Instructor", "Estudiante EF"]

# RoleId → nombre en el tenant CESA (respaldo cuando la API no trae Role.Name).
_ENROLLMENT_ROLE_NAMES = {
    105: "Super Administrator",
    109: "Instructor",
    110: "Estudiante EF",
    113: "Designer",
    116: "Administrator",
    120: "Profesor Asistente",
    126: "Diseñador Pedagógico",
    128: "Monitor",
    129: "Estudiante EC",
    130: "Coordinador Administrativo",
    131: "Diseñador Instruccional",
    133: "Tutor Virtual",
}


def enrollment_role_name(role_id) -> str:
    """Nombre del rol a partir del RoleId (respaldo cuando la API no trae
    Role.Name). "" si no hay RoleId."""
    return _ENROLLMENT_ROLE_NAMES.get(int(role_id), f"Role {role_id}") if role_id else ""


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
        # Enrollments: cambian poco durante una sesión → caché 5 min (#11)
        status, data = await _bs_get_cached(url, headers, params)
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


async def _fetch_my_enrollments(
    headers: dict,
    limit: int = 500,
) -> list:
    """Fetch the authenticated user's OWN enrollments via /enrollments/myenrollments/.
    Requires scope: enrollment:own_enrollment:read
    Returns ALL enrollments including where the user is a student (Estudiante EF)."""
    all_items = []
    bookmark = None
    fetched = 0

    while fetched < limit:
        params: dict = {"orgUnitTypeId": 3}
        if bookmark:
            params["bookmark"] = bookmark

        url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/enrollments/myenrollments/"
        # Enrollments propios: cambian poco durante una sesión → caché 5 min (#11)
        status, data = await _bs_get_cached(url, headers, params)
        if status != 200:
            logger.warning("myenrollments failed status=%s data=%s", status, str(data)[:200])
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


async def _collect_semesters(headers: dict, semesters: list, max_pages: int = 50) -> None:
    """Pagina /orgstructure/?orgUnitType=5 (semestres) agregando los items a
    `semesters` IN-PLACE: si una página lanza excepción, lo ya leído se
    conserva (el llamador decide cómo loguear el error)."""
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/orgstructure/"
    bookmark = None
    pages = 0
    while pages < max_pages:
        params: dict = {"orgUnitType": "5"}
        if bookmark:
            params["bookmark"] = bookmark
        # Estructura organizativa: casi estática → caché 5 min (#11)
        status, data = await _bs_get_cached(url, headers, params)
        if status != 200:
            break
        items = data if isinstance(data, list) else (data.get("Items") or data.get("items") or [])
        if not items:
            break
        semesters.extend(items)
        pages += 1
        paging = data.get("PagingInfo") if isinstance(data, dict) else None
        if not paging or not paging.get("HasMoreItems"):
            break
        new_bm = paging.get("Bookmark")
        if not new_bm or new_bm == bookmark:
            break
        bookmark = new_bm


async def fetch_semester_course_offerings(headers: dict, sem: dict, max_pages: int = 20) -> list:
    """Ofertas de curso (ouTypeId=3) que cuelgan de un semestre en la
    estructura organizacional de Brightspace. Cada item lleva el código y el
    nombre del semestre (los nombres de los cursos actuales NO lo incluyen)."""
    sem_id = sem.get("Identifier") or sem.get("Id") or sem.get("id")
    if not sem_id:
        return []
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
        f"/orgstructure/{sem_id}/descendants/"
    )
    out = []
    bm = None
    pg = 0
    while pg < max_pages:
        p: dict = {"ouTypeId": "3"}
        if bm:
            p["bookmark"] = bm
        # Descendientes de un semestre: casi estático → caché 5 min (#11)
        st, dt = await _bs_get_cached(url, headers, p)
        if st != 200:
            break
        items = dt if isinstance(dt, list) else (dt.get("Items") or dt.get("items") or [])
        if not items:
            break
        for it in items:
            ou_id = it.get("Identifier") or it.get("Id") or it.get("id")
            if ou_id:
                out.append({
                    "id": ou_id,
                    "name": it.get("Name", ""),
                    "code": it.get("Code", ""),
                    "semesterCode": str(sem.get("Code") or ""),
                    "semesterName": str(sem.get("Name") or ""),
                })
        pg += 1
        paging = dt.get("PagingInfo") if isinstance(dt, dict) else None
        if not paging or not paging.get("HasMoreItems"):
            break
        new_bm = paging.get("Bookmark")
        if not new_bm or new_bm == bm:
            break
        bm = new_bm
    return out


async def search_course_offerings(
    headers: dict, search: str | None, active_only: bool, limit: int
) -> dict:
    """Busca Course Offerings en /orgstructure/ por nombre, código e ID.
    Lanza UpstreamError si Brightspace niega el orgstructure."""
    # ── IMPORTANTE ───────────────────────────────────────────────────────
    # La API de Brightspace NO tiene un parámetro `search` genérico en
    # /orgstructure/: soporta `orgUnitName` y `orgUnitCode` (substring match)
    # además de `orgUnitType`. La versión anterior enviaba `search`,
    # Brightspace lo ignoraba y devolvía la primera página de TODOS los org
    # units (por eso el buscador "no filtraba" y siempre salían los cursos
    # demo #66xx). Ahora consultamos por nombre Y por código (y por ID exacto
    # si el término es numérico) y fusionamos los resultados sin duplicados.
    base_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/orgstructure/"
    limit = max(1, min(limit, 100))
    q = (search or "").strip()

    items_raw: list = []
    seen_ids: set = set()

    def _add_items(arr):
        for ou in arr or []:
            if not isinstance(ou, dict):
                continue
            oid = ou.get("Identifier") or ou.get("Id") or ou.get("id")
            key = str(oid) if oid is not None else None
            if not key or key in seen_ids:
                continue
            seen_ids.add(key)
            items_raw.append(ou)

    async def _collect(params: dict, max_pages: int = 3) -> int:
        """Recorre páginas (Bookmark) hasta llenar `limit` o agotar max_pages."""
        bookmark = None
        last_status = 200
        for _ in range(max_pages):
            p = dict(params)
            if bookmark:
                p["bookmark"] = bookmark
            # orgstructure: casi estático → caché 5 min (#11)
            last_status, data = await _bs_get_cached(base_url, headers, p)
            if last_status != 200:
                return last_status
            if isinstance(data, list):
                _add_items(data)
                return 200
            if not isinstance(data, dict):
                return 200
            _add_items(data.get("Items") or data.get("items") or [])
            if len(items_raw) >= limit:
                return 200
            paging = data.get("PagingInfo") or data.get("pagingInfo") or {}
            if not (paging.get("HasMoreItems") or paging.get("hasMoreItems")):
                return 200
            bookmark = paging.get("Bookmark") or paging.get("bookmark")
            if not bookmark:
                return 200
        return last_status

    if q:
        # 1) Por nombre (substring, case-insensitive en Brightspace)
        st_name = await _collect({"orgUnitType": "3", "orgUnitName": q})
        # 2) Por código (substring) — p.ej. "202620" suele vivir en el Code
        st_code = 200
        if len(items_raw) < limit:
            st_code = await _collect({"orgUnitType": "3", "orgUnitCode": q})
        # 3) ID exacto de org unit
        if q.isdigit() and q not in seen_ids:
            st_id, data_id = await _bs_get_cached(base_url + q, headers, {})
            if st_id == 200 and isinstance(data_id, dict):
                _add_items([data_id])
        if not items_raw and st_name != 200 and st_code != 200:
            raise UpstreamError(
                status=st_name,
                content={"error": "No se pudo acceder al orgstructure de Brightspace"},
            )
    else:
        st = await _collect({"orgUnitType": "3"}, max_pages=1)
        if st != 200 and not items_raw:
            raise UpstreamError(
                status=st,
                content={"error": "No se pudo acceder al orgstructure de Brightspace"},
            )

    from datetime import date
    today = date.today().isoformat()
    offerings = []
    for ou in items_raw:
        # Brightspace orgstructure devuelve {Identifier, Name, Code, Type, ...}
        ou_id   = ou.get("Identifier") or ou.get("Id") or ou.get("id")
        ou_name = ou.get("Name") or ou.get("name") or ""
        ou_code = ou.get("Code") or ou.get("code") or ""
        ou_type = (ou.get("Type") or {}).get("Code") or ""

        if not ou_id:
            continue

        # Solo Course Offerings
        if ou_type and ou_type not in ("Course Offering", "CourseOffering"):
            type_id = (ou.get("Type") or {}).get("Id")
            if type_id and type_id != 3:
                continue

        offerings.append({
            "id":        ou_id,
            "name":      ou_name,
            "code":      ou_code,
            "startDate": ou.get("StartDate"),
            "endDate":   ou.get("EndDate"),
            "isActive":  True,  # orgstructure no siempre tiene fechas
        })

    if active_only:
        offerings = [o for o in offerings if o["isActive"]]

    offerings.sort(key=lambda x: (x["name"] or "").lower())
    offerings = offerings[:limit]
    return {"count": len(offerings), "source": "orgstructure", "items": offerings}


async def enrolled_courses_for_target(
    headers: dict,
    auth_user_id: str,
    target_user_id: str,
    period: str | None,
    limit: int,
    active_only: bool,
) -> dict:
    """Cursos de OTRO usuario (vista SuperAdmin): arma el search space
    (matrículas del admin + cursos de los semestres relevantes) y lo cruza
    con las matrículas del usuario objetivo."""
    # Build a search space of course offerings. We combine:
    # 1. SuperAdmin's own enrollments (admin endpoint)
    # 2. orgstructure endpoint (ALL course offerings in the org)
    # Then deduplicate by OrgUnit ID.
    accessible_list: list = []
    try:
        admin_enrollments = await _fetch_all_enrollments(headers, auth_user_id, org_unit_type_id=3, limit=limit)
        for it in admin_enrollments:
            ou = it.get("OrgUnit") or {}
            ou_id = ou.get("Id") or ou.get("id")
            if ou_id:
                accessible_list.append({"id": ou_id, "name": ou.get("Name", ""), "code": ou.get("Code", "")})
    except Exception as _e:
        logger.warning("admin enrollments failed: %s", str(_e)[:200])

    # Use Brightspace semesters (orgUnitType=5) to efficiently scope the
    # search space. We fetch all semesters, filter them, then get the
    # descendant course offerings for each relevant semester.
    # This avoids scanning ALL courses in the system (historical unused
    # courses from pre-2025 have inconsistent metadata).
    try:
        semesters = []
        await _collect_semesters(headers, semesters)

        # Filter semesters. If user provided a period, match it as prefix
        # in code or name. Otherwise default to semesters from 2025+.
        def _sem_matches(sem):
            code = str(sem.get("Code") or "").strip()
            name = str(sem.get("Name") or "").strip()
            if period and period.strip():
                p = period.strip().lower()
                return p in code.lower() or p in name.lower()
            # Default: only semesters whose code starts with "2025" or later.
            # Semester codes follow "YYYYTT" format (e.g., 202510, 202610).
            if code[:4].isdigit():
                return int(code[:4]) >= 2025
            return False

        relevant_semesters = [s for s in semesters if _sem_matches(s)]
        logger.info(
            "courses/enrolled: %d total semesters, %d relevant%s",
            len(semesters), len(relevant_semesters),
            f" (period='{period}')" if period and period.strip() else " (default >= 2025)",
        )

        # For each relevant semester, get descendant course offerings
        async def _fetch_semester_courses(sem):
            return await fetch_semester_course_offerings(headers, sem)

        # Fetch courses from all relevant semesters in parallel
        sem_courses_lists = await asyncio.gather(*[
            _fetch_semester_courses(s) for s in relevant_semesters
        ])
        for lst in sem_courses_lists:
            for c in lst:
                accessible_list.append(c)

        logger.info(
            "courses/enrolled: gathered %d courses from %d semesters",
            sum(len(l) for l in sem_courses_lists), len(relevant_semesters),
        )
    except Exception as _e:
        logger.warning("semester-based search failed: %s", str(_e)[:200])

    # Deduplicate by id
    seen = set()
    search_space = []
    for item in accessible_list:
        sid = str(item["id"])
        if sid in seen:
            continue
        seen.add(sid)
        search_space.append(item)

    logger.info("courses/enrolled: search space = %d course offerings", len(search_space))

    # Fast-path (evita el N+1): UNA consulta paginada de las matrículas del
    # usuario objetivo (/enrollments/users/{target}/orgUnits/) y se cruza
    # con el search space (mismos semestres/periodo que antes). Si el
    # endpoint no devuelve nada (permisos/tenant), se cae al chequeo
    # curso por curso de abajo.
    bulk_by_ou: dict[str, dict] = {}
    try:
        for it in await _fetch_all_enrollments(
            headers, target_user_id, org_unit_type_id=3, limit=max(limit, 2000)
        ):
            ou = it.get("OrgUnit") or {}
            ou_id = ou.get("Id") or ou.get("id")
            if ou_id is not None:
                bulk_by_ou[str(ou_id)] = it
    except Exception as _e:
        logger.warning("courses/enrolled: bulk enrollments for target failed: %s", str(_e)[:200])

    if bulk_by_ou:
        offerings = []
        for item in search_space:
            hit = bulk_by_ou.get(str(item["id"]))
            if not hit:
                continue
            ou_info = hit.get("OrgUnit") or {}
            role = hit.get("Role") or {}
            role_id = role.get("Id")
            role_name = (
                role.get("Name")
                or (hit.get("Access") or {}).get("ClasslistRoleName")
                or enrollment_role_name(role_id)
            )
            offerings.append({
                "id": item["id"],
                "name": ou_info.get("Name") or item.get("name") or "",
                "code": ou_info.get("Code") or item.get("code") or "",
                "isActive": True,
                "roleName": role_name or "",
                "roleId": role_id,
                "semesterCode": item.get("semesterCode") or "",
                "semesterName": item.get("semesterName") or "",
            })
        logger.info(
            "courses/enrolled: target %s found in %d of %d courses (bulk, %d enrollments)",
            target_user_id, len(offerings), len(search_space), len(bulk_by_ou),
        )
        if active_only:
            offerings = [o for o in offerings if o.get("isActive")]
        return {"count": len(offerings), "items": offerings}

    sem = asyncio.Semaphore(25)

    async def _check_course(item):
        async with sem:
            org_id = item.get("id")
            if not org_id:
                return None
            # Use enrollments endpoint to check if target user has an
            # enrollment in this org unit. Returns 200 with enrollment
            # data if enrolled, 404 if not.
            url = (
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                f"/enrollments/orgUnits/{org_id}/users/{target_user_id}"
            )
            try:
                # Membresía usuario↔curso: estable en el corto plazo →
                # caché 5 min. Ahorra cientos de llamadas por búsqueda (#11)
                status, data = await _bs_get_cached(url, headers)
                if status == 200 and isinstance(data, dict):
                    role_id = data.get("RoleId")
                    ou_info = data.get("OrgUnit") or {}
                    name = ou_info.get("Name") or item.get("name") or ""
                    code = ou_info.get("Code") or item.get("code") or ""
                    role_name = enrollment_role_name(role_id)
                    return {
                        "id": org_id,
                        "name": name,
                        "code": code,
                        "isActive": True,
                        "roleName": role_name,
                        "roleId": role_id,
                        "semesterCode": item.get("semesterCode") or "",
                        "semesterName": item.get("semesterName") or "",
                    }
            except Exception as _e:
                logger.debug("enrollment check failed for org %s: %s", org_id, str(_e)[:100])
            return None

    results = await asyncio.gather(*[_check_course(i) for i in search_space])
    offerings = [r for r in results if r is not None]
    logger.info(
        "courses/enrolled: target %s found in %d of %d courses",
        target_user_id, len(offerings), len(search_space),
    )
    if active_only:
        offerings = [o for o in offerings if o.get("isActive")]
    return {"count": len(offerings), "items": offerings}


async def merged_own_enrollments(
    headers: dict, auth_user_id: str | None, err_uid, limit: int
) -> tuple[list, list, list]:
    """Matrículas propias del usuario autenticado, fusionando
    /myenrollments/ y el endpoint admin. Devuelve (items_my, items_admin, merged)."""
    # 1. myenrollments — user's own explicit enrollments
    items_my = await _fetch_my_enrollments(headers, limit=limit)

    # 2. admin-level endpoint — same data but via different scope; may return
    #    additional courses for global admins
    items_admin = []
    try:
        if not err_uid and auth_user_id:
            items_admin = await _fetch_all_enrollments(headers, auth_user_id, org_unit_type_id=3, limit=limit)
    except Exception as _e:
        logger.warning("_fetch_all_enrollments failed: %s", str(_e)[:200])
        items_admin = []

    # Merge by OrgUnit.Id — prefer myenrollments data when same course
    by_ou = {}
    for i in items_my:
        ou = i.get("OrgUnit") or {}
        ou_id = ou.get("Id") or ou.get("id")
        if ou_id is not None:
            by_ou[str(ou_id)] = i
    for i in items_admin:
        ou = i.get("OrgUnit") or {}
        ou_id = ou.get("Id") or ou.get("id")
        if ou_id is not None and str(ou_id) not in by_ou:
            by_ou[str(ou_id)] = i

    merged_items = list(by_ou.values())
    return items_my, items_admin, merged_items
