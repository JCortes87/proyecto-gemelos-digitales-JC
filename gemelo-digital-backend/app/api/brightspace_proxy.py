"""Proxy de la API de Brightspace protegido por sesion (extraido de main.py).

Módulo de compatibilidad: los endpoints viven ahora en app/api/brightspace/
(courses, users, content, grades, dropbox, rubrics) y la lógica no-HTTP en
app/services/brightspace/. Aquí se re-exporta el mismo `router` (que incluye
main.py) y los nombres que antes vivían en este módulo.
"""
from __future__ import annotations

from app.api.brightspace import router  # noqa: F401

# Re-exports de compatibilidad (helpers que antes vivían aquí).
from app.services.brightspace.enrollments import (  # noqa: F401
    ROLE_PRIORITY,
    _ENROLLMENT_ROLE_NAMES,
    _fetch_all_enrollments,
    _fetch_my_enrollments,
    _normalize_offering,
)
from app.services.brightspace.content import (  # noqa: F401
    _HREF_RE,
    _PAGE_LINKS_CACHE,
    _PAGE_LINKS_TTL_S,
    _PAGE_FETCH_MAX,
    _PAGE_BYTES_MAX,
    _extract_hrefs,
    _page_embedded_links,
)

# Endpoints (por si algún import externo los referenciaba por este módulo).
from app.api.brightspace.courses import (  # noqa: F401
    brightspace_whoami,
    brightspace_semesters,
    brightspace_all_courses_search,
    brightspace_my_courses,
    brightspace_my_course_offerings,
    brightspace_courses_enrolled,
    brightspace_courses_all,
    brightspace_course,
)
from app.api.brightspace.users import (  # noqa: F401
    brightspace_user_image,
    brightspace_classlist,
    brightspace_course_instructors,
    brightspace_user,
)
from app.api.brightspace.content import (  # noqa: F401
    brightspace_content_topics,
    brightspace_content_consumption,
    brightspace_content_root,
)
from app.api.brightspace.grades import (  # noqa: F401
    brightspace_grade_items,
    brightspace_grade_values,
    brightspace_grade_value_by_item,
    brightspace_gradeitem_detail,
    brightspace_student_evidence,
)
from app.api.brightspace.dropbox import (  # noqa: F401
    brightspace_dropbox_folders,
    brightspace_dropbox_folder,
    brightspace_dropbox_submissions,
    brightspace_dropbox_student_status,
    brightspace_dropbox_grading_status,
    brightspace_dropbox_download,
    brightspace_dropbox_feedback,
    brightspace_assignment,
    brightspace_dropbox_feedback_user,
)
from app.api.brightspace.rubrics import (  # noqa: F401
    brightspace_rubric_evaluation,
    brightspace_rubric_assessment_dropbox_user,
    brightspace_dropbox_assessment,
    gemelo_assignment,
)

__all__ = [
    "router",
    "ROLE_PRIORITY",
    "_ENROLLMENT_ROLE_NAMES",
    "_fetch_all_enrollments",
    "_fetch_my_enrollments",
    "_normalize_offering",
    "_HREF_RE",
    "_PAGE_LINKS_CACHE",
    "_PAGE_LINKS_TTL_S",
    "_PAGE_FETCH_MAX",
    "_PAGE_BYTES_MAX",
    "_extract_hrefs",
    "_page_embedded_links",
    "brightspace_whoami",
    "brightspace_semesters",
    "brightspace_all_courses_search",
    "brightspace_my_courses",
    "brightspace_my_course_offerings",
    "brightspace_courses_enrolled",
    "brightspace_courses_all",
    "brightspace_course",
    "brightspace_user_image",
    "brightspace_classlist",
    "brightspace_course_instructors",
    "brightspace_user",
    "brightspace_content_topics",
    "brightspace_content_consumption",
    "brightspace_content_root",
    "brightspace_grade_items",
    "brightspace_grade_values",
    "brightspace_grade_value_by_item",
    "brightspace_gradeitem_detail",
    "brightspace_student_evidence",
    "brightspace_dropbox_folders",
    "brightspace_dropbox_folder",
    "brightspace_dropbox_submissions",
    "brightspace_dropbox_student_status",
    "brightspace_dropbox_grading_status",
    "brightspace_dropbox_download",
    "brightspace_dropbox_feedback",
    "brightspace_assignment",
    "brightspace_dropbox_feedback_user",
    "brightspace_rubric_evaluation",
    "brightspace_rubric_assessment_dropbox_user",
    "brightspace_dropbox_assessment",
    "gemelo_assignment",
]
