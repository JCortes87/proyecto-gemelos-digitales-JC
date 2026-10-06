"""Contenido del curso: topics (con enlaces embebidos), consumo por
estudiante e instructores. Helpers del proxy Brightspace."""
from __future__ import annotations

import asyncio
import re
import time
import urllib.parse
from typing import Optional

from app.api.deps import (
    BRIGHTSPACE_BASE_URL, LP_VERSION, LE_VERSION,
    _bs_get_cached, _bs_cache_key,
)
from app.services.brightspace_client import get_http_client
from app.services.brightspace.common import UpstreamError

# ── Enlaces dentro de páginas HTML del curso ─────────────────────────────────
# Los archivos enlazados dentro de una página creada en Brightspace (p. ej.
# una página con 7 enlaces a 7 PDFs) también son recursos publicados, pero la
# API de contenido solo lista los recursos del árbol — el cuerpo de la página
# nunca aparece. Se descarga el HTML de cada página interna (best-effort,
# cacheado) y se adjuntan los href como EmbeddedLinks de cada topic para que
# el frontend los clasifique y cuente por tipo de archivo.
_HREF_RE = re.compile(r"href\s*=\s*[\"']([^\"'>]+)[\"']", re.IGNORECASE)
_PAGE_LINKS_CACHE: dict[str, tuple[float, list[str]]] = {}
_PAGE_LINKS_TTL_S = 300.0
_PAGE_FETCH_MAX = 60          # máx. páginas HTML leídas por request
_PAGE_BYTES_MAX = 1_500_000   # ignora archivos HTML anormalmente grandes


def _extract_hrefs(html: str, limit: int = 100) -> list[str]:
    """Extrae los href únicos y navegables de un HTML (función pura).

    Descarta anclas, mailto:, javascript:, data: y tel:. Devuelve los href
    URL-decodificados (los quicklinks de Brightspace codifican la ruta del
    archivo, y sin decodificar no se reconoce la extensión .pdf/.docx…).
    """
    links: list[str] = []
    seen: set[str] = set()
    for href in _HREF_RE.findall(html or ""):
        h = urllib.parse.unquote(href).strip()
        low = h.lower()
        if not h or low.startswith(("#", "mailto:", "javascript:", "data:", "tel:")):
            continue
        if low in seen:
            continue
        seen.add(low)
        links.append(h)
        if len(links) >= limit:
            break
    return links


async def _page_embedded_links(
    org_unit_id: int, topic_id, headers: dict, sem: asyncio.Semaphore
) -> list[str]:
    """Descarga el HTML de una página de contenido y devuelve sus href."""
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/content/topics/{topic_id}/file"
    )
    key = _bs_cache_key(url, headers, None)
    now = time.monotonic()
    hit = _PAGE_LINKS_CACHE.get(key)
    if hit and (now - hit[0]) < _PAGE_LINKS_TTL_S:
        return list(hit[1])
    links: list[str] = []
    try:
        async with sem:
            r = await get_http_client().get(url, headers=headers, timeout=30)
        if r.status_code == 200 and len(r.content) <= _PAGE_BYTES_MAX:
            links = _extract_hrefs(r.text)
            if len(_PAGE_LINKS_CACHE) > 500:
                _PAGE_LINKS_CACHE.clear()
            _PAGE_LINKS_CACHE[key] = (now, list(links))
    except Exception:
        pass  # best-effort: sin los links de una página, el conteo sigue
    return links


async def build_content_topics(headers: dict, org_unit_id: int) -> dict:
    """Topics del curso con Url/TopicType/ActivityType, EmbeddedLinks de las
    páginas HTML internas y moduleLinks. Lanza UpstreamError si falla el root."""
    root_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
    root_status, root_data = await _bs_get_cached(root_url, headers)
    if root_status != 200:
        raise UpstreamError(status=root_status, content=root_data)

    module_links: list[str] = []
    _ml_seen: set[str] = set()

    def _collect_module_links(m: dict) -> None:
        desc = m.get("Description")
        html = (desc.get("Html") or desc.get("Text") or "") if isinstance(desc, dict) else ""
        for h in _extract_hrefs(html):
            low = h.lower()
            if low not in _ml_seen:
                _ml_seen.add(low)
                module_links.append(h)

    root_modules = [
        m for m in (root_data if isinstance(root_data, list) else [])
        if isinstance(m, dict) and m.get("Id") is not None and m.get("IsHidden") is not True
    ]
    for m in root_modules:
        _collect_module_links(m)
    queue = [m.get("Id") for m in root_modules]
    seen_modules = set(queue)
    topics = []
    sem = asyncio.Semaphore(8)

    async def _structure_of(mid):
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
            f"/{org_unit_id}/content/modules/{mid}/structure/"
        )
        async with sem:
            status, data = await _bs_get_cached(url, headers)
        return data if (status == 200 and isinstance(data, list)) else []

    # BFS por niveles para soportar módulos anidados (máx 100 módulos)
    for _ in range(6):
        if not queue or len(seen_modules) > 100:
            break
        batch = queue[:50]
        queue = queue[50:]
        results = await asyncio.gather(*[_structure_of(m) for m in batch])
        for items in results:
            for it in items:
                if not isinstance(it, dict):
                    continue
                if it.get("Type") == 0:
                    mid = it.get("Id")
                    if mid is not None and mid not in seen_modules and it.get("IsHidden") is not True:
                        seen_modules.add(mid)
                        queue.append(mid)
                        _collect_module_links(it)
                elif it.get("Type") == 1:
                    topics.append({
                        "Id": it.get("Id"),
                        "Title": it.get("Title") or it.get("ShortTitle"),
                        "Url": it.get("Url"),
                        "TopicType": it.get("TopicType"),
                        "ActivityType": it.get("ActivityType"),
                        "IsHidden": it.get("IsHidden"),
                        "LastModifiedDate": it.get("LastModifiedDate"),
                    })

    # Páginas HTML internas visibles → leer su cuerpo y adjuntar los href.
    # Solo URLs relativas: una Url absoluta http(s) es un enlace, no una
    # página del curso, y no tiene archivo descargable en la API.
    page_topics = []
    for t in topics:
        if t.get("IsHidden") is True or t.get("Id") is None:
            continue
        u = t.get("Url")
        if not isinstance(u, str):
            continue
        low = u.lower()
        if low.startswith(("http://", "https://")):
            continue
        if low.split("?")[0].endswith((".html", ".htm")):
            page_topics.append(t)
    for t, links in zip(
        page_topics[:_PAGE_FETCH_MAX],
        await asyncio.gather(*[
            _page_embedded_links(org_unit_id, t["Id"], headers, sem)
            for t in page_topics[:_PAGE_FETCH_MAX]
        ]),
    ):
        if links:
            t["EmbeddedLinks"] = links

    return {"count": len(topics), "items": topics, "moduleLinks": module_links}


async def list_course_instructors(headers: dict, org_unit_id: int) -> dict:
    """Usuarios del curso con rol de profesor/instructor (LP enrollments)."""
    keywords = ("instructor", "profesor", "docente", "teacher", "facilitador")
    items = []
    bookmark = None
    for _ in range(5):  # máx 5 páginas de ~100
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
            f"/enrollments/orgUnits/{org_unit_id}/users/"
        )
        if bookmark:
            url += f"?bookmark={urllib.parse.quote(str(bookmark))}"
        status, data = await _bs_get_cached(url, headers)
        if status != 200 or not isinstance(data, dict):
            break
        for rec in (data.get("Items") or []):
            if not isinstance(rec, dict):
                continue
            user = rec.get("User") or {}
            role = rec.get("Role") or {}
            role_name = str(role.get("Name") or "")
            if any(k in role_name.lower() for k in keywords):
                items.append({
                    "Identifier": user.get("Identifier"),
                    "DisplayName": user.get("DisplayName"),
                    "RoleName": role_name,
                })
        paging = data.get("PagingInfo") or {}
        bookmark = paging.get("Bookmark")
        if not paging.get("HasMoreItems") or not bookmark:
            break

    return {"count": len(items), "items": items}


async def build_content_consumption(headers: dict, org_unit_id: int) -> dict:
    """Temas visitados por estudiante (userprogress, con fallback a
    completions por tema). Lanza UpstreamError si falla el classlist."""
    cl_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/classlist/"
    cl_status, cl_data = await _bs_get_cached(cl_url, headers)
    if cl_status != 200:
        raise UpstreamError(status=cl_status, content=cl_data)
    users = cl_data if isinstance(cl_data, list) else (cl_data.get("Items") or [])
    user_ids = [str(u.get("Identifier")) for u in users if isinstance(u, dict) and u.get("Identifier")]

    sem = asyncio.Semaphore(8)
    per_user: dict = {}
    per_user_topics: dict = {}
    method = None

    def _topic_id_of(rec) -> Optional[str]:
        if not isinstance(rec, dict):
            return None
        for k in ("ContentObjectId", "TopicId", "ObjectId", "Id"):
            if rec.get(k) is not None:
                return str(rec[k])
        return None

    # ── Estrategia 1: user progress por estudiante ──────────────────────
    async def _progress_for(uid: str):
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
            f"/{org_unit_id}/content/userprogress/{uid}"
        )
        async with sem:
            status, data = await _bs_get_cached(url, headers)
        if status != 200:
            return uid, None, []
        items = data if isinstance(data, list) else (data.get("Objects") or data.get("Items") or [])
        if not isinstance(items, list):
            return uid, None, []
        topics = [t for t in (_topic_id_of(it) for it in items) if t]
        return uid, len(items), topics[:500]

    if user_ids:
        probe_uid, probe_val, probe_topics = await _progress_for(user_ids[0])
        if probe_val is not None:
            method = "userprogress"
            per_user[probe_uid] = probe_val
            per_user_topics[probe_uid] = probe_topics
            rest = await asyncio.gather(*[_progress_for(u) for u in user_ids[1:100]])
            for uid, n, topics in rest:
                if n is not None:
                    per_user[uid] = n
                    per_user_topics[uid] = topics

    # ── Estrategia 2 (fallback): completions por tema ───────────────────
    # Una llamada por tema devuelve los registros de TODOS los usuarios.
    if method is None:
        root_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
        root_status, root_data = await _bs_get_cached(root_url, headers)
        topic_ids = []
        if root_status == 200 and isinstance(root_data, list):
            for mod in root_data:
                if not isinstance(mod, dict) or mod.get("IsHidden") is True:
                    continue
                for it in (mod.get("Structure") or []):
                    if (
                        isinstance(it, dict)
                        and it.get("IsHidden") is not True
                        and it.get("Type") == 1
                        and it.get("Id") is not None
                    ):
                        topic_ids.append(it["Id"])

        async def _completions_for_topic(tid):
            url = (
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                f"/{org_unit_id}/content/topics/{tid}/completions/"
            )
            async with sem:
                status, data = await _bs_get_cached(url, headers)
            if status != 200:
                return tid, []
            items = data if isinstance(data, list) else (data.get("Objects") or data.get("Items") or [])
            return tid, (items if isinstance(items, list) else [])

        if topic_ids:
            all_completions = await asyncio.gather(
                *[_completions_for_topic(t) for t in topic_ids[:200]]
            )
            found_any = False
            for tid, records in all_completions:
                for rec in records:
                    if not isinstance(rec, dict):
                        continue
                    uid = rec.get("UserId") or rec.get("userId")
                    if uid is None:
                        continue
                    found_any = True
                    key = str(uid)
                    per_user[key] = per_user.get(key, 0) + 1
                    per_user_topics.setdefault(key, []).append(str(tid))
            if found_any:
                method = "topic_completions"
                # Los estudiantes sin registros quedan en 0 explícito para
                # que el frontend los cuente en el promedio.
                for uid in user_ids:
                    per_user.setdefault(uid, 0)
                    per_user_topics.setdefault(uid, [])

    return {
        "orgUnitId": org_unit_id,
        "perUser": per_user,
        "perUserTopics": per_user_topics,
        "method": method,
        "usersQueried": len(user_ids),
        "usersWithData": len(per_user),
    }
