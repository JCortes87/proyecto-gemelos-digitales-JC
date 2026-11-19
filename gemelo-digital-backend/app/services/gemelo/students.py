"""Listado de estudiantes del curso (classlist)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.services.role_utils import (
    _as_items_list,
    _is_student_role,
    _extract_role_name,
    _extract_user_id,
    _display_name,
)

logger = logging.getLogger("uvicorn.error")


class StudentsMixin:
    # --------------------------------------------------
    # Students
    # --------------------------------------------------
    async def list_course_students(self, orgUnitId: int) -> Dict[str, Any]:
        fn = getattr(self.bs, "list_classlist", None)
        if not callable(fn):
            raise RuntimeError("brightspace_client no expone list_classlist")

        # Graceful: if classlist is unavailable (403/401/404), return empty
        try:
            data = await fn(orgUnitId)
        except Exception as e:
            msg = str(e)
            if "403" in msg or "401" in msg or "404" in msg:
                import logging
                logging.getLogger(__name__).warning(
                    "list_course_students: classlist unavailable for course %s (%s)",
                    orgUnitId, msg[:120],
                )
                return {"count": 0, "items": [], "roleCounts": {}}
            raise
        items = _as_items_list(data)

        students: List[Dict[str, Any]] = []
        role_counts: Dict[str, int] = {}

        for it in items:
            if not isinstance(it, dict):
                continue

            role = _extract_role_name(it).strip()
            role_counts[role or "unknown"] = role_counts.get(role or "unknown", 0) + 1

            if not _is_student_role(role):
                continue

            uid = _extract_user_id(it)
            if uid is None:
                continue

            # Extract email from classlist entry — try every common field name
            # CESA frequently puts the email in OrgDefinedId or UserName too.
            user_obj = it.get("User") if isinstance(it.get("User"), dict) else {}
            def _pick_email(*objs):
                for o in objs:
                    if not isinstance(o, dict):
                        continue
                    for k in ("EmailAddress", "emailAddress", "Email", "email",
                              "UserName", "userName", "OrgDefinedId", "orgDefinedId"):
                        v = o.get(k)
                        if v and isinstance(v, str) and "@" in v:
                            return v.strip()
                return None
            email = _pick_email(user_obj, it)

            students.append(
                {
                    "userId": uid,
                    "displayName": _display_name(it),
                    "email": email,
                    "roleName": role,
                }
            )

        return {"count": len(students), "items": students, "roleCounts": role_counts}
