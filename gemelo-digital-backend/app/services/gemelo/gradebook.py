"""Métricas masivas de gradebook por estudiante."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.services.common_utils import _parse_iso_dt, _as_dict
from app.services.grade_filters import _is_graded_value
from app.services.risk_utils import weighted_avg
from app.services.text_utils import _is_corte_item

from app.services.gemelo.due_dates import _fill_dropbox_due_dates, _due_date_for_grade_item
from app.services.gemelo.caches import _get_course_data_cached

logger = logging.getLogger("uvicorn.error")


class GradebookMixin:
    # --------------------------------------------------
    # Métricas masivas (para /students?with_metrics=true)
    # --------------------------------------------------
    async def _course_start_date(self, orgUnitId: int) -> Optional[datetime]:
        """Fecha de inicio del curso, para la regla de FECHAS HEREDADAS.

        Al importar contenido de un curso anterior, las actividades llegan
        con fechas de vencimiento viejas. Una fecha de vencimiento ANTERIOR
        al inicio de este curso no puede ser un vencimiento real del
        semestre — no debe contarse como "vencido". None si no se puede
        resolver (en ese caso se conserva el comportamiento clasico).
        """
        get_info = getattr(self.bs, "get_course_info", None)
        if not callable(get_info):
            return None
        try:
            info = await _get_course_data_cached(
                "course_info", orgUnitId, lambda: get_info(orgUnitId)
            )
            if isinstance(info, dict):
                return _parse_iso_dt(info.get("StartDate"))
        except Exception:
            pass
        return None

    async def compute_students_gradebook_metrics(
        self,
        orgUnitId: int,
        student_ids: List[int],
        course_cfg: Any,
    ) -> Dict[int, Dict[str, Any]]:
        """
        Devuelve por userId:
        - coveragePct / gradedItemsCount / totalItemsCount / coverageCountText
        - pendingUngradedCount / pendingUngradedWeightPct
        - overdueUnscoredCount / overdueUnscoredWeightPct
        - currentPerformancePct
        """
        list_items_fn = getattr(self.bs, "list_grade_items", None)
        list_values_fn = getattr(self.bs, "list_grade_values_for_user", None)
        list_dropbox_fn = getattr(self.bs, "list_dropbox_folders", None)

        if not (callable(list_items_fn) and callable(list_values_fn)):
            return {}

        raw_items = await _get_course_data_cached(
            "grade_items", orgUnitId, lambda: list_items_fn(orgUnitId)
        )
        if isinstance(raw_items, dict):
            raw_items = raw_items.get("Items") or raw_items.get("items") or []
        if not isinstance(raw_items, list):
            return {}

        course_dict = _as_dict(course_cfg)
        gp = (
            course_dict.get("gradingPolicy", {})
            if isinstance(course_dict.get("gradingPolicy"), dict)
            else {}
        )
        include_ids = set(gp.get("includeGradeObjectIds") or [])
        exclude_ids = set(gp.get("excludeGradeObjectIds") or [])

        items_in_scope = [
            it for it in raw_items
            if isinstance(it, dict) and it.get("Id") is not None
        ]
        if include_ids:
            items_in_scope = [
                it for it in items_in_scope if int(it.get("Id")) in include_ids
            ]
        if exclude_ids:
            items_in_scope = [
                it for it in items_in_scope if int(it.get("Id")) not in exclude_ids
            ]
        # Los ítems "Corte" (Corte 1/2/3, C1…) son totales acumulados: igual que
        # en el gemelo por estudiante (student_twin), no cuentan en promedios ni
        # cobertura para no sumar dos veces las notas de sus componentes.
        items_in_scope = [it for it in items_in_scope if not _is_corte_item(it.get("Name"))]

        total_items_count = len(items_in_scope)

        item_weight_by_id: Dict[int, float] = {}
        total_weight = 0.0
        for it in items_in_scope:
            gid = int(it["Id"])
            w = float(it.get("Weight", 0) or 0.0)
            item_weight_by_id[gid] = w
            total_weight += w

        dropbox_due_by_folder_id: Dict[int, Optional[datetime]] = {}
        if callable(list_dropbox_fn):
            try:
                folders = await _get_course_data_cached(
                    "dropbox_folders", orgUnitId, lambda: list_dropbox_fn(orgUnitId)
                )
                _fill_dropbox_due_dates(folders, dropbox_due_by_folder_id)
            except Exception:
                pass

        due_date_by_id: Dict[int, Optional[datetime]] = {}
        for it in items_in_scope:
            gid = int(it["Id"])
            due_date_by_id[gid] = _due_date_for_grade_item(it, dropbox_due_by_folder_id)

        _now = datetime.now(timezone.utc)
        # Regla de fechas heredadas: vencido real = fecha pasada PERO posterior
        # al inicio del curso (las anteriores vienen de una importacion).
        _course_start = await self._course_start_date(orgUnitId)

        async def _calc_one(uid: int) -> Tuple[int, Dict[str, Any]]:
            vals = await list_values_fn(orgUnitId, uid)

            by_id: Dict[int, Dict[str, Any]] = {}
            if isinstance(vals, list):
                for v in vals:
                    if not isinstance(v, dict):
                        continue
                    # Brightspace puede usar distintos nombres según la versión del API
                    raw_gid = (
                        v.get("GradeObjectIdentifier")
                        or v.get("Id")
                        or v.get("id")
                        or v.get("GradeObjectId")
                    )
                    if raw_gid is None:
                        continue
                    try:
                        gid = int(raw_gid)
                    except Exception:
                        continue
                    by_id[gid] = v

            graded_count = 0
            graded_weight = 0.0
            weighted_num_sum = 0.0
            weighted_den_sum = 0.0

            pending_ungraded_count = 0
            pending_ungraded_weight_sum = 0.0

            overdue_unscored_count = 0
            overdue_unscored_weight_sum = 0.0

            points_acc: List[Tuple[float, float]] = []

            for gid, w in item_weight_by_id.items():
                v = by_id.get(gid) or {}
                is_graded_v = _is_graded_value(v)
                due_dt = due_date_by_id.get(gid)
                is_overdue = bool(
                    due_dt and due_dt < _now
                    and (_course_start is None or due_dt >= _course_start)
                )

                if is_graded_v:
                    graded_count += 1
                    graded_weight += w
                else:
                    if is_overdue:
                        overdue_unscored_count += 1
                        overdue_unscored_weight_sum += w
                    else:
                        pending_ungraded_count += 1
                        pending_ungraded_weight_sum += w

                wn = v.get("WeightedNumerator")
                wd = v.get("WeightedDenominator")
                try:
                    if wn is not None and wd is not None and float(wd) > 0:
                        weighted_num_sum += float(wn)
                        weighted_den_sum += float(wd)
                except Exception:
                    pass

                pn = v.get("PointsNumerator")
                pd = v.get("PointsDenominator")
                if pn is not None and pd is not None:
                    try:
                        pd_f = float(pd)
                        if pd_f > 0:
                            points_acc.append(((float(pn) / pd_f) * 100.0, w))
                    except Exception:
                        pass

            coverage_pct = (
                round((graded_weight / total_weight) * 100.0, 1)
                if total_weight > 0 else 0.0
            )
            pending_ungraded_weight_pct = (
                round((pending_ungraded_weight_sum / total_weight) * 100.0, 1)
                if total_weight > 0 else 0.0
            )
            overdue_unscored_weight_pct = (
                round((overdue_unscored_weight_sum / total_weight) * 100.0, 1)
                if total_weight > 0 else 0.0
            )

            current_perf_pct: Optional[float] = None
            if weighted_den_sum > 0:
                current_perf_pct = round(
                    (weighted_num_sum / weighted_den_sum) * 100.0, 1
                )
            elif points_acc and sum(w for _, w in points_acc) > 0:
                current_perf_pct = round(weighted_avg(points_acc), 1)

            return uid, {
                "coveragePct": coverage_pct,
                "gradedItemsCount": graded_count,
                "totalItemsCount": total_items_count,
                "coverageCountText": (
                    f"{graded_count}/{total_items_count}"
                    if total_items_count else "0/0"
                ),
                "currentPerformancePct": current_perf_pct,
                "pendingUngradedCount": pending_ungraded_count,
                "pendingUngradedWeightPct": pending_ungraded_weight_pct,
                "overdueUnscoredCount": overdue_unscored_count,
                "overdueUnscoredWeightPct": overdue_unscored_weight_pct,
                # compatibilidad temporal
                "notSubmittedCount": overdue_unscored_count,
                "notSubmittedWeightPct": overdue_unscored_weight_pct,
            }

        # Semáforo para limitar concurrencia a Brightspace (evita rate-limit / timeout)
        _sem = asyncio.Semaphore(8)

        async def _calc_one_limited(uid: int):
            async with _sem:
                return await _calc_one(uid)

        pairs = await asyncio.gather(
            *[_calc_one_limited(uid) for uid in student_ids],
            return_exceptions=True,
        )

        out: Dict[int, Dict[str, Any]] = {}
        for p in pairs:
            if isinstance(p, Exception):
                continue
            try:
                uid, metrics = p
                out[uid] = metrics
            except Exception:
                continue

        return out
