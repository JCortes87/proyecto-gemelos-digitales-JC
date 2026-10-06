"""Dropbox (asignaciones): estado de entregas por estudiante y por curso.
Helpers del proxy Brightspace."""
from __future__ import annotations

import asyncio
import logging

from app.api.deps import (
    BRIGHTSPACE_BASE_URL, LP_VERSION, LE_VERSION,
    _bs_get, _bs_get_cached,
)
from app.services.brightspace.common import UpstreamError

logger = logging.getLogger("uvicorn.error")


def _visible_folders(folders_data) -> list:
    """Carpetas de dropbox publicadas (IsHidden != True) de la respuesta de
    /dropbox/folders/ (lista directa o envuelta en Objects/Items)."""
    folders = folders_data if isinstance(folders_data, list) else (
        (folders_data or {}).get("Objects") or (folders_data or {}).get("Items") or []
    )
    return [f for f in folders if isinstance(f, dict) and f.get("IsHidden") is not True]


def _due_sort_key(x):
    """Orden: con fecha primero (ascendente), luego por nombre."""
    return (x.get("dueDate") is None, x.get("dueDate") or "", str(x.get("name") or ""))


def _group_ids_for_user(groups_data, user_id) -> set:
    """GroupIds (str) de los grupos de una categoría en los que está
    matriculado `user_id` (respuesta de /groupcategories/{id}/groups/)."""
    ids: set = set()
    if isinstance(groups_data, list):
        for g in groups_data:
            if not isinstance(g, dict):
                continue
            enroll = [str(x) for x in (g.get("Enrollments") or [])]
            if str(user_id) in enroll and g.get("GroupId") is not None:
                ids.add(str(g.get("GroupId")))
    return ids


async def student_dropbox_status(headers: dict, org_unit_id: int, user_id: int) -> dict:
    """Estado de cada asignación publicada para UN estudiante (entregó /
    tiene feedback). Lanza UpstreamError si falla el listado de carpetas."""
    status_f, folders_data = await _bs_get(
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/",
        headers,
    )
    if status_f != 200:
        raise UpstreamError(status=status_f, content=folders_data)
    visible = _visible_folders(folders_data)

    # Grupos: si una carpeta es de entrega grupal, la submission vive en la
    # entidad GRUPO. Resolvemos una sola vez los grupos del estudiante por
    # cada categoría de grupo usada.
    group_ids_by_category: dict = {}

    async def _user_group_ids(group_type_id):
        key = str(group_type_id)
        if key in group_ids_by_category:
            return group_ids_by_category[key]
        ids: set = set()
        try:
            _, groups_data = await _bs_get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                f"/{org_unit_id}/groupcategories/{group_type_id}/groups/",
                headers,
            )
            ids |= _group_ids_for_user(groups_data, user_id)
        except Exception as e:
            logger.warning("group resolve failed cat=%s user=%s: %s", group_type_id, user_id, e)
        group_ids_by_category[key] = ids
        return ids

    async def _student_folder_status(f):
        fid = f.get("Id")
        assess = f.get("Assessment") or {}
        grade_item_id = assess.get("GradeItemId") or f.get("GradeItemId")
        due = f.get("DueDate") or (f.get("Availability") or {}).get("EndDate")
        base = {
            "id": fid,
            "name": f.get("Name") or f"Asignación {fid}",
            "dueDate": due,
            "gradeItemId": grade_item_id,
            "hasSubmission": None,
            "submittedAt": None,
            "isGraded": None,
        }
        if not fid:
            return base
        entity_ids = {str(user_id)}
        if f.get("GroupTypeId") is not None:
            entity_ids |= await _user_group_ids(f.get("GroupTypeId"))
        try:
            s, subs_data = await _bs_get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                f"/{org_unit_id}/dropbox/folders/{fid}/submissions/",
                headers,
            )
            if s != 200:
                return base
            subs_list = subs_data if isinstance(subs_data, list) else (
                (subs_data or {}).get("Items") or (subs_data or {}).get("items") or []
            )
            mine = []
            for entry in subs_list:
                if not isinstance(entry, dict):
                    continue
                eid = (
                    entry.get("EntityId")
                    or entry.get("UserId")
                    or (entry.get("Entity") or {}).get("EntityId")
                )
                if str(eid) in entity_ids:
                    mine.append(entry)
            flat = []
            has_feedback = False
            for entry in mine:
                inner = entry.get("Submissions") or entry.get("submissions") or []
                if isinstance(inner, list):
                    flat.extend([x for x in inner if isinstance(x, dict)])
                if entry.get("Feedback"):
                    has_feedback = True
            flat.sort(key=lambda x: x.get("SubmissionDate") or "", reverse=True)
            base["hasSubmission"] = len(flat) > 0
            base["submittedAt"] = (flat[0].get("SubmissionDate") if flat else None)
            base["isGraded"] = has_feedback
        except Exception as e:
            logger.warning(
                "dropbox student status failed folder=%s user=%s: %s", fid, user_id, e
            )
        return base

    items = list(await asyncio.gather(*[_student_folder_status(f) for f in visible]))

    items.sort(key=_due_sort_key)

    known = [i for i in items if i.get("hasSubmission") is not None]
    return {
        "orgUnitId": org_unit_id,
        "userId": user_id,
        "items": items,
        "counts": {
            "total": len(items),
            "submitted": sum(1 for i in known if i.get("hasSubmission")),
            "graded": sum(1 for i in items if i.get("isGraded")),
        },
        "partial": len(known) < len(items),
    }


async def course_grading_status(headers: dict, org_unit_id: int) -> dict:
    """Entregas y pendientes de calificar por asignación para todo el curso.
    Lanza UpstreamError si falla el listado de carpetas."""
    status_f, folders_data = await _bs_get(
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/",
        headers,
    )
    if status_f != 200:
        raise UpstreamError(status=status_f, content=folders_data)
    visible = _visible_folders(folders_data)

    sem = asyncio.Semaphore(8)

    async def _folder_grading_status(f):
        fid = f.get("Id")
        due = f.get("DueDate") or (f.get("Availability") or {}).get("EndDate")
        base = {
            "id": fid,
            "name": f.get("Name") or f"Asignación {fid}",
            "dueDate": due,
            "isGroup": f.get("GroupTypeId") is not None,
            "submittedIds": [],
            "pendingGrading": [],
            "ok": False,
        }
        if not fid:
            return base
        try:
            async with sem:
                s, subs_data = await _bs_get_cached(
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                    f"/{org_unit_id}/dropbox/folders/{fid}/submissions/",
                    headers,
                )
            if s != 200:
                return base
            subs_list = subs_data if isinstance(subs_data, list) else (
                (subs_data or {}).get("Items") or (subs_data or {}).get("items") or []
            )
            for entry in subs_list:
                if not isinstance(entry, dict):
                    continue
                ent = entry.get("Entity") or {}
                eid = (
                    entry.get("EntityId")
                    or ent.get("EntityId")
                    or entry.get("UserId")
                )
                if eid is None:
                    continue
                inner = entry.get("Submissions") or entry.get("submissions") or []
                has_sub = isinstance(inner, list) and len(inner) > 0
                if not has_sub:
                    continue
                base["submittedIds"].append(str(eid))
                if not entry.get("Feedback"):
                    base["pendingGrading"].append({
                        "id": str(eid),
                        "name": ent.get("DisplayName") or ent.get("Name") or str(eid),
                    })
            base["ok"] = True
        except Exception as e:
            logger.warning(
                "dropbox grading status failed folder=%s: %s", fid, e
            )
        return base

    items = list(await asyncio.gather(*[_folder_grading_status(f) for f in visible]))

    items.sort(key=_due_sort_key)

    known = [i for i in items if i.get("ok")]
    return {
        "orgUnitId": org_unit_id,
        "items": items,
        "partial": len(known) < len(items),
    }
