"""Calificaciones: evidencias por estudiante (helpers del proxy Brightspace)."""
from __future__ import annotations

import asyncio

from app.api.deps import BRIGHTSPACE_BASE_URL, LE_VERSION, _bs_get


async def student_grade_evidence(headers: dict, org_unit_id: int, user_id: int) -> dict:
    """Valor de cada grade item (máx. 50) para un estudiante."""
    items_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/"
    _, items_data = await _bs_get(items_url, headers)
    grade_items = (
        items_data if isinstance(items_data, list)
        else items_data.get("Items") or items_data.get("items") or []
    )

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
