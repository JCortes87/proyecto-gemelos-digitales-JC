"""Fachada de GemeloService.

La implementación vive en `app/services/gemelo/` (un mixin por dominio):
  - students.py      → list_course_students
  - calc.py          → _risk_from_*, _pct_from_outcome, _apply_prescription
  - outcomes.py      → índices RA cacheados (_get_outcome_index, ...), build_quiz_outcomes
  - overview.py      → build_course_overview
  - student_twin.py  → build_gemelo / _build_gemelo_inner (gradebook, RA, proyección)
  - gradebook.py     → _course_start_date, compute_students_gradebook_metrics
  - caches.py        → cachés en memoria compartidas (objetos únicos)
  - outcome_index.py → parsers puros de outcomeSets / alignments
  - due_dates.py     → fechas de vencimiento de grade items

Este módulo mantiene `from app.services.gemelo_service import GemeloService`
y re-exporta los nombres de nivel módulo que existían antes del split.
"""
from __future__ import annotations

import logging

# Re-exports de compatibilidad (nombres que antes vivían en este módulo).
from app.services.gemelo.caches import (  # noqa: F401
    _OUTCOME_SETS_CACHE, _OUTCOME_SETS_TTL,
    _ALIGN_CACHE, _ALIGN_TTL,
    _QUIZ_ALIGN_CACHE, _QUIZ_ALIGN_TTL,
    _COURSE_DATA_CACHE, _COURSE_DATA_LOCKS, _COURSE_DATA_TTL,
    _get_course_data_cached,
)
from app.services.gemelo.outcome_index import (  # noqa: F401
    _OUTCOME_CODE_REGEX, _parse_outcome_desc, _clean_text, _richtext_to_str,
    _walk_outcome_nodes, _first_leaf_outcome, _index_outcome_sets,
    _outcome_id_from_co, _index_alignments, _index_quiz_alignments,
)
from app.services.gemelo.students import StudentsMixin
from app.services.gemelo.calc import CalcMixin
from app.services.gemelo.outcomes import OutcomesMixin
from app.services.gemelo.overview import CourseOverviewMixin
from app.services.gemelo.student_twin import StudentTwinMixin
from app.services.gemelo.gradebook import GradebookMixin

logger = logging.getLogger("uvicorn.error")


# =========================================================
# Servicio principal: GemeloService
# =========================================================

class GemeloService(
    StudentsMixin,
    CalcMixin,
    OutcomesMixin,
    CourseOverviewMixin,
    StudentTwinMixin,
    GradebookMixin,
):
    def __init__(self, brightspace_client):
        self.bs = brightspace_client


__all__ = [
    "GemeloService",
    "_OUTCOME_SETS_CACHE",
    "_OUTCOME_SETS_TTL",
    "_ALIGN_CACHE",
    "_ALIGN_TTL",
    "_QUIZ_ALIGN_CACHE",
    "_QUIZ_ALIGN_TTL",
    "_COURSE_DATA_CACHE",
    "_COURSE_DATA_LOCKS",
    "_COURSE_DATA_TTL",
    "_get_course_data_cached",
    "_OUTCOME_CODE_REGEX",
    "_parse_outcome_desc",
    "_clean_text",
    "_richtext_to_str",
    "_walk_outcome_nodes",
    "_first_leaf_outcome",
    "_index_outcome_sets",
    "_outcome_id_from_co",
    "_index_alignments",
    "_index_quiz_alignments",
]
