"""Índices de RA (outcomes/alignments) cacheados y RA evaluados por quiz."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from app.services.gemelo.caches import (
    _OUTCOME_SETS_CACHE,
    _OUTCOME_SETS_TTL,
    _ALIGN_CACHE,
    _ALIGN_TTL,
    _QUIZ_ALIGN_CACHE,
    _QUIZ_ALIGN_TTL,
)
from app.services.gemelo.outcome_index import (
    _first_leaf_outcome,
    _index_outcome_sets,
    _index_alignments,
    _index_quiz_alignments,
)

logger = logging.getLogger("uvicorn.error")


class OutcomesMixin:
    async def _get_outcome_index(self, orgUnitId: int) -> Dict[str, Dict[str, str]]:
        """Índice { outcomeUuid : {code,title,description} } del curso,
        cacheado en memoria por orgUnitId (TTL 10 min)."""
        now = time.monotonic()
        cached = _OUTCOME_SETS_CACHE.get(orgUnitId)
        if cached and (now - cached[0]) < _OUTCOME_SETS_TTL:
            return cached[1]
        try:
            payload = await self.bs.list_outcome_sets(orgUnitId)
        except Exception as e:
            logger.warning(
                "outcome_index: list_outcome_sets falló para %s: %s", orgUnitId, e
            )
            payload = None
        idx = _index_outcome_sets(payload)
        if not idx:
            # DIAG: por qué el índice sale vacío. Volcamos forma del payload.
            try:
                ptype = type(payload).__name__
                plen = len(payload) if hasattr(payload, "__len__") else "n/a"
                sample = None
                first = None
                if isinstance(payload, list) and payload:
                    first = payload[0]
                elif isinstance(payload, dict):
                    first = payload
                if isinstance(first, dict):
                    sample = {
                        "keys": list(first.keys())[:20],
                        "Description": first.get("Description")
                        or first.get("description"),
                        "Outcomes_type": type(
                            first.get("Outcomes") or first.get("outcomes")
                        ).__name__,
                    }
                child = _first_leaf_outcome(payload)
                child_dump = None
                if isinstance(child, dict):
                    child_dump = {
                        "keys": list(child.keys())[:25],
                        "Notation": child.get("Notation") or child.get("notation")
                        or child.get("AltNotation"),
                        "Description": child.get("Description")
                        or child.get("description"),
                        "Name": child.get("Name") or child.get("name"),
                    }
                logger.info(
                    "DIAG outcome_index EMPTY course=%s payload_type=%s len=%s sample=%s child=%s",
                    orgUnitId, ptype, plen, sample, child_dump,
                )
            except Exception as e:
                logger.info("DIAG outcome_index dump failed: %s", e)
        if idx:
            _OUTCOME_SETS_CACHE[orgUnitId] = (now, idx)
        return idx

    async def _get_alignment_index(self, orgUnitId: int) -> Dict[str, List[str]]:
        """Índice { str(rubricId) : [outcomeId, ...] } del curso, vía el
        endpoint bulk /lo/alignments/.

        Es el puente rúbrica→outcome que CriteriaOutcome no trae. Se
        cachea por orgUnitId (TTL 10 min). Devuelve {} si el tenant no
        expone /lo/alignments/ (404) o falta el scope (403)."""
        now = time.monotonic()
        cached = _ALIGN_CACHE.get(orgUnitId)
        if cached and (now - cached[0]) < _ALIGN_TTL:
            return cached[1]
        try:
            payload = await self.bs.list_alignments(orgUnitId)
        except Exception as e:
            logger.warning(
                "alignment_index: list_alignments falló para %s: %s", orgUnitId, e
            )
            payload = None
        idx = _index_alignments(payload)
        if not idx:
            # DIAG: por qué el índice sale vacío. Volcamos la forma cruda.
            try:
                ptype = type(payload).__name__
                plen = len(payload) if hasattr(payload, "__len__") else "n/a"
                first = payload[0] if isinstance(payload, list) and payload else payload
                sample = (
                    {"keys": list(first.keys())[:25]}
                    if isinstance(first, dict) else str(first)[:200]
                )
                logger.info(
                    "DIAG alignment_index EMPTY course=%s type=%s len=%s sample=%s",
                    orgUnitId, ptype, plen, sample,
                )
            except Exception as e:
                logger.info("DIAG alignment_index dump failed: %s", e)
        if idx:
            _ALIGN_CACHE[orgUnitId] = (now, idx)
        return idx

    async def _get_quiz_alignment_index(
        self, orgUnitId: int
    ) -> Dict[str, List[str]]:
        """Índice { str(quizId) : [outcomeId, ...] } del curso, vía el bulk
        /lo/alignments/ filtrando ActivityType == Quiz. Cacheado 10 min."""
        now = time.monotonic()
        cached = _QUIZ_ALIGN_CACHE.get(orgUnitId)
        if cached and (now - cached[0]) < _QUIZ_ALIGN_TTL:
            return cached[1]
        try:
            payload = await self.bs.list_alignments(orgUnitId)
        except Exception as e:
            logger.warning(
                "quiz_alignment_index: list_alignments falló %s: %s", orgUnitId, e
            )
            payload = None
        idx = _index_quiz_alignments(payload)
        if idx:
            _QUIZ_ALIGN_CACHE[orgUnitId] = (now, idx)
        return idx

    async def build_quiz_outcomes(
        self,
        orgUnitId: int,
        user_ids: List[int],
        outcome_index: Optional[Dict[str, Dict[str, str]]] = None,
        concurrency: int = 8,
    ) -> List[Dict[str, Any]]:
        """Calcula el promedio (%) por resultado de aprendizaje evaluado por
        QUIZ, a nivel curso.

        Aproximación (D2L no expone la nota por pregunta): el % de cada quiz
        —tomado del grade item asociado (PointsNumerator/Denominator)— se
        atribuye a todos los outcomes a los que el quiz está alineado. El
        outcome de un estudiante = promedio de sus quizzes alineados; el del
        curso = promedio entre estudiantes con datos.

        Devuelve una lista de dicts con la misma forma que `ras` pero con
        source="quiz": {code,label,title,avgPct,coveragePct,studentsWithData,
        totalStudents,source,quizIds}.
        """
        quiz_align = await self._get_quiz_alignment_index(orgUnitId)
        if not quiz_align:
            return []

        if outcome_index is None:
            try:
                outcome_index = await self._get_outcome_index(orgUnitId)
            except Exception:
                outcome_index = {}

        # quizId -> gradeItemId (para leer el % por estudiante vía grades)
        try:
            quizzes = await self.bs.list_quizzes(orgUnitId)
        except Exception as e:
            logger.warning("build_quiz_outcomes list_quizzes %s: %s", orgUnitId, e)
            quizzes = []
        quiz_to_grade: Dict[str, int] = {}
        for q in quizzes:
            qid = q.get("QuizId") or q.get("Id")
            gid = q.get("GradeItemId")
            if qid is None or gid is None:
                continue
            quiz_to_grade[str(int(qid))] = int(gid)

        # Solo nos interesan los grade items de quizzes ALINEADOS a outcomes.
        grade_to_quiz: Dict[int, str] = {}
        for qid in quiz_align.keys():
            gid = quiz_to_grade.get(qid)
            if gid is not None:
                grade_to_quiz[gid] = qid
        if not grade_to_quiz:
            return []

        total_students = len(user_ids)

        # Por outcomeId: acumulador de porcentajes (uno por estudiante).
        acc: Dict[str, List[float]] = {}

        async def _one_student(uid: int) -> None:
            try:
                values = await self.bs.list_grade_values_for_user(orgUnitId, uid)
            except Exception:
                return
            # quizId -> pct de ESTE estudiante
            student_quiz_pct: Dict[str, float] = {}
            for gv in values or []:
                gid = gv.get("GradeObjectIdentifier") or gv.get("GradeObjectId")
                try:
                    gid = int(gid)
                except Exception:
                    continue
                qid = grade_to_quiz.get(gid)
                if not qid:
                    continue
                num = gv.get("PointsNumerator")
                den = gv.get("PointsDenominator")
                try:
                    num = float(num)
                    den = float(den)
                except (TypeError, ValueError):
                    continue
                if den <= 0:
                    continue
                pct = max(0.0, min(100.0, (num / den) * 100.0))
                student_quiz_pct[qid] = pct
            if not student_quiz_pct:
                return
            # outcome del estudiante = promedio de sus quizzes alineados
            per_outcome: Dict[str, List[float]] = {}
            for qid, pct in student_quiz_pct.items():
                for oid in quiz_align.get(qid, []):
                    per_outcome.setdefault(oid, []).append(pct)
            for oid, pcts in per_outcome.items():
                acc.setdefault(oid, []).append(sum(pcts) / len(pcts))

        sem = asyncio.Semaphore(max(1, concurrency))

        async def _guarded(uid: int) -> None:
            async with sem:
                await _one_student(uid)

        await asyncio.gather(*[_guarded(u) for u in user_ids])

        results: List[Dict[str, Any]] = []
        for oid, pcts in acc.items():
            if not pcts:
                continue
            info = (outcome_index or {}).get(oid) or {}
            code = info.get("code") or oid
            count = len(pcts)
            results.append({
                "code": code,
                "label": info.get("title") or code,
                "title": info.get("title"),
                "avgPct": round(sum(pcts) / count, 1),
                "coveragePct": (
                    round((count / total_students) * 100.0, 1)
                    if total_students else 0.0
                ),
                "studentsWithData": count,
                "totalStudents": total_students,
                "source": "quiz",
                "outcomeId": oid,
            })
        results.sort(key=lambda x: x["code"])
        return results
