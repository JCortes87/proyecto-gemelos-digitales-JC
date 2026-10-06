"""Overview del curso (vista docente)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List

from app.config_loader import load_course_bundle

from app.services.scale_utils import status_from_pct, _get_thresholds
from app.services.role_utils import (
    _as_items_list,
    _is_student_role,
    _extract_role_name,
    _extract_user_id,
    _display_name,
)

logger = logging.getLogger("uvicorn.error")


class CourseOverviewMixin:
    # --------------------------------------------------
    # OVERVIEW (CURSO)
    # --------------------------------------------------
    async def build_course_overview(self, orgUnitId: int) -> Dict[str, Any]:
        fn = getattr(self.bs, "list_classlist", None)
        if not callable(fn):
            raise RuntimeError("brightspace_client no expone list_classlist")

        # Attempt classlist fetch. If it fails (403/404), return a graceful
        # empty-state response instead of blocking the whole course view.
        # This lets Super Administrators see the course shell even when
        # their token doesn't grant classlist access for that specific course.
        try:
            data = await fn(orgUnitId)
        except Exception as e:
            msg = str(e)
            if "403" in msg or "401" in msg or "404" in msg:
                import logging
                logging.getLogger(__name__).warning(
                    "classlist unavailable for course %s (%s) — returning empty overview",
                    orgUnitId, msg[:120],
                )
                return {
                    "orgUnitId": orgUnitId,
                    "studentsCount": 0,
                    "macroCompetencies": [],
                    "courseGradebook": {
                        "avgCurrentPerformancePct": 0.0,
                        "avgCoveragePct": 0.0,
                        "avgNotSubmittedPct": 0.0,
                        "avgPendingUngradedPct": 0.0,
                        "avgOverdueUnscoredPct": 0.0,
                        "avgGradedItemsCount": 0,
                        "avgTotalItemsCount": 0,
                        "coverageCountText": "0/0",
                        "status": "pending",
                    },
                    "globalRiskDistribution": {"alto": 0, "medio": 0, "bajo": 0, "pending": 0},
                    "thresholds": {"critical": 50.0, "watch": 70.0},
                    "alerts": [],
                    "studentsAtRisk": [],
                    "qualityFlags": [{
                        "type": "classlist_unavailable",
                        "message": "No se pudo obtener el classlist de este curso (403/404). El usuario no tiene permisos específicos en este curso.",
                    }],
                }
            raise
        items = _as_items_list(data)

        student_ids: List[int] = []
        for it in items:
            role = _extract_role_name(it)
            if _is_student_role(role):
                uid = _extract_user_id(it)
                if uid is not None:
                    student_ids.append(uid)

        try:
            bundle = load_course_bundle(orgUnitId)
            course_cfg = bundle.get("course") if isinstance(bundle, dict) else None
            cfg = bundle.get("rubricsModel") if isinstance(bundle, dict) else None
            thresholds = _get_thresholds(course_cfg, cfg)
        except FileNotFoundError:
            course_cfg = None
            cfg = None
            thresholds = {"critical": 50.0, "watch": 70.0}
        except Exception:
            course_cfg = None
            cfg = None
            thresholds = {"critical": 50.0, "watch": 70.0}

        if not student_ids:
            return {
                "orgUnitId": orgUnitId,
                "studentsCount": 0,
                "macroCompetencies": [],
                "courseGradebook": {
                    "avgCurrentPerformancePct": 0.0,
                    "avgCoveragePct": 0.0,
                    "avgNotSubmittedPct": 0.0,
                    "avgPendingUngradedPct": 0.0,
                    "avgOverdueUnscoredPct": 0.0,
                    "avgGradedItemsCount": 0,
                    "avgTotalItemsCount": 0,
                    "coverageCountText": "0/0",
                    "status": "pending",
                },
                "globalRiskDistribution": {"alto": 0, "medio": 0, "bajo": 0, "pending": 0},
                "thresholds": thresholds,
                "alerts": [],
            }

        # Semáforo: build_gemelo hace ~10 requests HTTP por estudiante.
        # Con Semaphore(10) → mayor paralelismo para evitar 504 Gateway Timeout.
        # Hard timeout de 50s (ALB timeout es 60s por defecto).
        _overview_sem = asyncio.Semaphore(10)

        async def _build_gemelo_limited(uid: int):
            async with _overview_sem:
                return await self.build_gemelo(orgUnitId, uid)

        tasks = [_build_gemelo_limited(uid) for uid in student_ids]
        results: List[Any]
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=50.0,
            )
        except asyncio.TimeoutError:
            # Partial results: cancel unfinished tasks and use what we have
            import logging
            logging.getLogger(__name__).warning(
                "build_course_overview timeout (50s) for course %s with %d students — returning partial",
                orgUnitId, len(student_ids),
            )
            results = [Exception("timeout") for _ in student_ids]
            # Don't raise — proceed with empty-ish aggregation

        risk_dist = {"alto": 0, "medio": 0, "bajo": 0, "pending": 0}
        perf_vals: List[float] = []
        cov_vals: List[float] = []
        graded_counts: List[float] = []
        total_counts: List[float] = []
        not_submitted_vals: List[float] = []
        pending_ungraded_vals: List[float] = []
        overdue_unscored_vals: List[float] = []
        macro_acc: Dict[str, List[float]] = {}
        students_at_risk: List[Dict[str, Any]] = []
        students_macro: Dict[int, Dict[str, Any]] = {}
        student_names: Dict[int, str] = {}

        # Construir mapa nombre por userId desde classlist
        for it in items:
            role = _extract_role_name(it)
            if _is_student_role(role):
                uid = _extract_user_id(it)
                if uid is not None:
                    student_names[uid] = _display_name(it)

        for g in results:
            if isinstance(g, Exception):
                risk_dist["pending"] += 1
                continue

            summary = g.get("summary") or {}
            uid = g.get("userId")
            perf_pct = summary.get("currentPerformancePct")
            cov_pct_s = summary.get("coveragePct") or 0.0
            overdue_pct_s = (
                summary.get("overdueUnscoredWeightPct")
                if summary.get("overdueUnscoredWeightPct") is not None
                else summary.get("notSubmittedWeightPct") or 0.0
            )
            pending_pct_s = summary.get("pendingUngradedWeightPct") or 0.0

            # Risk basado en nota del gradebook (no en RA)
            r = self._risk_from_performance(perf_pct, thresholds)
            risk_dist[r] = risk_dist.get(r, 0) + 1

            # mostCriticalMacro (peor RA) para TODOS los estudiantes, no solo los
            # en riesgo: la tarjeta del dashboard debe reflejar el RA más bajo REAL
            # del estudiante y coincidir con su vista de detalle. Preferir RAs
            # usados (pct > 0): un RA en 0/None es "no evaluado / sin evidencia",
            # no un desempeño real de 0. Solo si ninguno tiene datos caemos al
            # mínimo global.
            _worst_macro = None
            _macro_units = g.get("macroUnits") or g.get("macro", {}).get("units") or []
            if _macro_units:
                _valid = [
                    {"code": str(m.get("code", "")), "pct": float(m.get("pct") or 0)}
                    for m in _macro_units if m.get("code") and m.get("pct") is not None
                ]
                if _valid:
                    _used = [x for x in _valid if x["pct"] > 0]
                    _worst_macro = min(_used or _valid, key=lambda x: x["pct"])
            if uid is not None and _worst_macro is not None:
                students_macro[uid] = _worst_macro

            is_at_risk = (
                r in ("alto", "medio")
                or (perf_pct is not None and float(perf_pct) < float(thresholds.get("critical", 50.0)))
                or overdue_pct_s > 0
                or float(cov_pct_s) < 60
            )
            if is_at_risk and uid is not None:
                students_at_risk.append({
                    "userId": uid,
                    "displayName": student_names.get(uid, str(uid)),
                    "risk": r,
                    "currentPerformancePct": perf_pct,
                    "coveragePct": round(float(cov_pct_s), 1),
                    "notSubmittedWeightPct": round(float(overdue_pct_s), 1),
                    "overdueUnscoredWeightPct": round(float(overdue_pct_s), 1),
                    "pendingUngradedWeightPct": round(float(pending_pct_s), 1),
                    "mostCriticalMacro": _worst_macro,
                })

            for m in (g.get("macroUnits") or []):
                code = str(m.get("code", ""))
                pct = m.get("pct")
                if pct is None:
                    continue
                try:
                    macro_acc.setdefault(code, []).append(float(pct))
                except Exception:
                    pass

            for key, target in (
                ("currentPerformancePct", perf_vals),
                ("coveragePct", cov_vals),
                ("gradedItemsCount", graded_counts),
                ("totalItemsCount", total_counts),
                ("notSubmittedWeightPct", not_submitted_vals),
                ("pendingUngradedWeightPct", pending_ungraded_vals),
                ("overdueUnscoredWeightPct", overdue_unscored_vals),
            ):
                val = summary.get(key)
                if val is not None:
                    try:
                        target.append(float(val))
                    except Exception:
                        pass

        def _safe_avg(lst: List[float], ndigits: int = 2) -> float:
            return round(sum(lst) / len(lst), ndigits) if lst else 0.0

        avg_perf = _safe_avg(perf_vals)
        avg_cov = _safe_avg(cov_vals)
        avg_graded = int(round(_safe_avg(graded_counts))) if graded_counts else 0
        avg_total = int(round(_safe_avg(total_counts))) if total_counts else 0
        avg_not_submitted = _safe_avg(not_submitted_vals)
        avg_pending_ungraded = _safe_avg(pending_ungraded_vals)
        avg_overdue_unscored = _safe_avg(overdue_unscored_vals)

        macro_out = sorted(
            [
                {
                    "code": code,
                    "avgPct": round(sum(vals) / len(vals), 1),
                    "status": status_from_pct(round(sum(vals) / len(vals), 1), thresholds),
                }
                for code, vals in macro_acc.items()
                if vals
            ],
            key=lambda x: x["code"],
        )

        def _sev_from_pct(pct: float, thr: Dict[str, float]) -> str:
            if pct < float(thr.get("critical", 50.0)):
                return "critico"
            if pct < float(thr.get("watch", 70.0)):
                return "observacion"
            return "solido"

        alerts: List[Dict[str, Any]] = []

        pending_pct = round(max(0.0, 100.0 - float(avg_cov)), 2)
        sev_cov = "critico" if avg_cov < 40 else ("observacion" if avg_cov < 70 else "solido")
        alerts.append(
            {
                "id": "coverage_low" if sev_cov != "solido" else "coverage_ok",
                "severity": sev_cov,
                "title": "Cobertura de evaluación",
                "message": (
                    f"El curso tiene {avg_cov:.2f}% de cobertura; "
                    f"queda {pending_pct:.2f}% pendiente por calificar."
                ),
                "kpis": {
                    "coveragePct": avg_cov,
                    "pendingPct": pending_pct,
                    "gradedItemsCount": avg_graded,
                    "totalItemsCount": avg_total,
                    "coverageCountText": (
                        f"{avg_graded}/{avg_total}" if avg_total else "0/0"
                    ),
                },
            }
        )

        if avg_perf == 0.0 and avg_cov > 0.0:
            alerts.append(
                {
                    "id": "performance_inconsistent",
                    "severity": "observacion",
                    "title": "Nota promedio no consolidada",
                    "message": (
                        "Hay cobertura registrada, pero la nota promedio aparece en 0%. "
                        "Revisar configuración/visibilidad de ítems del gradebook."
                    ),
                    "kpis": {
                        "avgCurrentPerformancePct": avg_perf,
                        "avgCoveragePct": avg_cov,
                    },
                }
            )
        else:
            sev_perf = _sev_from_pct(float(avg_perf), thresholds) if avg_perf > 0 else "pending"
            if sev_perf != "pending":
                alerts.append(
                    {
                        "id": "performance_low" if sev_perf != "solido" else "performance_ok",
                        "severity": sev_perf,
                        "title": "Desempeño académico del curso",
                        "message": f"La nota promedio actual del curso es {avg_perf:.2f}%.",
                        "kpis": {"avgCurrentPerformancePct": avg_perf},
                    }
                )

        total = len(student_ids)
        high = int(risk_dist.get("alto", 0) or 0)
        pct_high = round((high / total) * 100.0, 2) if total > 0 else 0.0
        sev_risk = (
            "critico" if pct_high >= 40
            else ("observacion" if pct_high >= 20 else "solido")
        )
        if total > 0 and sev_risk != "solido":
            alerts.append(
                {
                    "id": "risk_concentration_high",
                    "severity": sev_risk,
                    "title": "Concentración de riesgo alto",
                    "message": (
                        f"{high} de {total} estudiantes ({pct_high:.2f}%) "
                        "están en riesgo ALTO."
                    ),
                    "kpis": {
                        "alto": int(risk_dist.get("alto", 0) or 0),
                        "medio": int(risk_dist.get("medio", 0) or 0),
                        "bajo": int(risk_dist.get("bajo", 0) or 0),
                        "pending": int(risk_dist.get("pending", 0) or 0),
                        "pctAlto": pct_high,
                    },
                }
            )

        if macro_out:
            worst = sorted(macro_out, key=lambda x: float(x.get("avgPct") or 0.0))[0]
            worst_status = worst.get("status")
            if worst_status in ("critico", "observacion"):
                alerts.append(
                    {
                        "id": (
                            "macro_critical" if worst_status == "critico"
                            else "macro_watch"
                        ),
                        "severity": worst_status,
                        "title": "Macrocompetencia prioritaria",
                        "message": (
                            f"La macro {worst.get('code')} es la más comprometida "
                            f"con {worst.get('avgPct')}%."
                        ),
                        "kpis": {
                            "macro": worst.get("code"),
                            "avgPct": worst.get("avgPct"),
                            "status": worst_status,
                        },
                    }
                )

        if avg_not_submitted > 0:
            sev_not_submitted = (
                "critico"
                if avg_not_submitted >= 25
                else ("observacion" if avg_not_submitted >= 10 else "solido")
            )
            alerts.append(
                {
                    "id": "not_submitted_overdue",
                    "severity": sev_not_submitted,
                    "title": "Entregas no enviadas",
                    "message": (
                        f"En promedio, {avg_not_submitted:.2f}% del peso evaluativo "
                        "corresponde a actividades vencidas no entregadas."
                    ),
                    "kpis": {
                        "avgNotSubmittedPct": avg_not_submitted,
                    },
                }
            )

        # ── Alert: grade items without RA mapping ────────────
        try:
            # Collect all folderId/gradeObjectIds that ARE linked to RA rubric criteria
            linked_ids: set = set()
            if isinstance(cfg, dict):
                for ra in (cfg.get("outcomes") or []):
                    for crit in (ra.get("criteria") or []):
                        fid = crit.get("folderId") or crit.get("gradeObjectId")
                        if fid is not None:
                            linked_ids.add(int(fid))
            elif hasattr(cfg, "outcomes"):
                for ra in (getattr(cfg, "outcomes", None) or []):
                    for crit in (getattr(ra, "criteria", None) or []):
                        fid = getattr(crit, "folderId", None) or getattr(crit, "gradeObjectId", None)
                        if fid is not None:
                            linked_ids.add(int(fid))

            # Get all grade items from Brightspace
            _grade_items_raw = await self.bs.list_grade_items(orgUnitId)
            if isinstance(_grade_items_raw, dict):
                _grade_items_raw = _grade_items_raw.get("Items") or _grade_items_raw.get("items") or []
            _grade_items_raw = _grade_items_raw if isinstance(_grade_items_raw, list) else []

            # Filter: items with weight > 0 (evaluable) that are NOT linked to RA
            unlinked_items = []
            for it in _grade_items_raw:
                if not isinstance(it, dict):
                    continue
                gid = it.get("Id") or it.get("id")
                if gid is None:
                    continue
                weight = float(it.get("Weight") or it.get("weight") or 0)
                if weight <= 0:
                    continue  # skip unweighted items
                if int(gid) not in linked_ids:
                    unlinked_items.append({
                        "gradeObjectId": int(gid),
                        "name": it.get("Name") or it.get("name") or f"Ítem {gid}",
                        "weightPct": round(weight, 2),
                    })

            if unlinked_items and linked_ids:
                # Only alert if there are SOME linked items (course uses RAs)
                # and SOME unlinked (some items lack RA mapping)
                total_w = sum(x["weightPct"] for x in unlinked_items)
                alerts.append({
                    "id": "items_without_ra",
                    "severity": "observacion",
                    "title": f"Actividades sin Resultado de Aprendizaje ({len(unlinked_items)})",
                    "message": (
                        f"{len(unlinked_items)} actividad{'es' if len(unlinked_items) != 1 else ''} "
                        f"calificada{'s' if len(unlinked_items) != 1 else ''} no están vinculadas "
                        f"a ningún RA en la rúbrica ({total_w:.1f}% del peso total). "
                        f"Estas notas no se reflejan en el análisis de competencias."
                    ),
                    "kpis": {
                        "sin_ra": len(unlinked_items),
                        "peso_total": round(total_w, 1),
                    },
                    "items": unlinked_items[:10],  # max 10 for payload size
                })
            elif unlinked_items and not linked_ids:
                # No RA config at all — different message
                alerts.append({
                    "id": "no_ra_config",
                    "severity": "observacion",
                    "title": "Sin configuración de Resultados de Aprendizaje",
                    "message": (
                        "El curso tiene actividades calificadas pero no hay rúbricas "
                        "vinculadas a Resultados de Aprendizaje. "
                        "Configura los RA en el modelo del curso para activar el análisis por competencias."
                    ),
                    "kpis": {"actividades": len(unlinked_items)},
                    "items": [],
                })
        except Exception:
            pass  # alert es informativa — no bloquear si falla

        return {
            "orgUnitId": orgUnitId,
            "studentsCount": len(student_ids),
            "macroCompetencies": macro_out,
            "courseGradebook": {
                "avgCurrentPerformancePct": avg_perf,
                "avgCoveragePct": avg_cov,
                "avgNotSubmittedPct": avg_not_submitted,
                "avgPendingUngradedPct": avg_pending_ungraded,
                "avgOverdueUnscoredPct": avg_overdue_unscored,
                "avgGradedItemsCount": avg_graded,
                "avgTotalItemsCount": avg_total,
                "coverageCountText": (
                    f"{avg_graded}/{avg_total}" if avg_total else "0/0"
                ),
                "status": status_from_pct(avg_perf, thresholds),
            },
            "globalRiskDistribution": risk_dist,
            "studentsAtRisk": sorted(
                students_at_risk,
                key=lambda s: (
                    0 if s["risk"] == "alto" else 1 if s["risk"] == "medio" else 2,
                    float(s.get("currentPerformancePct") or 999),
                ),
            ),
            # Peor RA por estudiante (todos, no solo en riesgo). Clave = userId (str
            # en JSON). El frontend lo usa para mostrar el RA crítico real de cada
            # estudiante en su tarjeta, coincidiendo con la vista de detalle.
            "studentsMostCriticalMacro": {
                str(k): v for k, v in students_macro.items()
            },
            "thresholds": thresholds,
            "alerts": alerts,
        }
