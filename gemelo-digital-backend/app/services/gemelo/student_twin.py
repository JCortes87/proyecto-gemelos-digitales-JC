"""Gemelo digital por estudiante (gradebook, RA, proyección)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.config_loader import load_course_bundle
from app.domain.rubric_quality import detect_rubric_inconsistency

from app.services.text_utils import _is_corte_item, _extract_corte_period
from app.services.common_utils import _num, _as_dict
from app.services.grade_filters import _is_graded
from app.services.scale_utils import (
    status_from_pct,
    _get_thresholds,
    _get_scale_settings,
)
from app.services.risk_utils import weighted_avg, build_macro_units
from app.services.role_utils import normalize_view_from_enrollment

from app.services.gemelo.due_dates import _fill_dropbox_due_dates, _due_date_for_grade_item
from app.services.gemelo.caches import _get_course_data_cached
from app.services.gemelo.outcome_index import _outcome_id_from_co

logger = logging.getLogger("uvicorn.error")


class StudentTwinMixin:
    # --------------------------------------------------
    # GEMELO (ESTUDIANTE)
    # --------------------------------------------------
    async def build_gemelo(self, orgUnitId: int, userId: int) -> Dict[str, Any]:
        """
        Construye el gemelo digital de un estudiante.
        Nunca lanza excepción — en caso de error retorna un dict mínimo válido
        con el error registrado en qualityFlags.
        """
        try:
            return await self._build_gemelo_inner(orgUnitId, userId)
        except Exception as exc:
            # Captura de seguridad: nunca devolver 500 al frontend
            return {
                "orgUnitId": orgUnitId,
                "userId": userId,
                "course": {"updatedAt": datetime.now(timezone.utc).isoformat()},
                "access": {},
                "capabilities": {},
                "summary": {
                    "globalPct": None,
                    "risk": "pending",
                    "coveragePct": None,
                    "currentPerformancePct": None,
                    "gradedItemsCount": 0,
                    "totalItemsCount": 0,
                    "coverageCountText": "0/0",
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                },
                "macro": {"units": []},
                "units": [],
                "prescription": [],
                "macroUnits": [],
                "gradebook": {},
                "projection": {},
                "qualityFlags": [{"type": "build_gemelo_failed", "message": str(exc)}],
            }

    async def _build_gemelo_inner(self, orgUnitId: int, userId: int) -> Dict[str, Any]:
        try:
            bundle = load_course_bundle(orgUnitId)
        except FileNotFoundError:
            bundle = {"course": None, "rubricsModel": None}
        except Exception:
            bundle = {"course": None, "rubricsModel": None}

        course_cfg = bundle.get("course") if isinstance(bundle, dict) else None
        cfg = bundle.get("rubricsModel") if isinstance(bundle, dict) else None

        qc_flags: List[Dict[str, Any]] = []
        view = "student"
        role_ctx: Dict[str, Any] = {}
        access_level = "student"

        thresholds = _get_thresholds(course_cfg, cfg)
        scale_type, max_level_points = _get_scale_settings(cfg)

        try:
            fn = getattr(self.bs, "get_my_enrollment", None)
            if callable(fn):
                enr = await fn(orgUnitId)
                role_ctx = normalize_view_from_enrollment(enr)
                view = role_ctx.get("view", "student")
                access_level = role_ctx.get("accessLevel", "student")
            else:
                qc_flags.append(
                    {
                        "type": "role_not_enabled",
                        "message": "brightspace_client no expone get_my_enrollment",
                    }
                )
        except Exception as e:
            qc_flags.append({"type": "role_resolve_failed", "message": str(e)})

        force_teacher_mode = True
        if force_teacher_mode:
            access_level = "teacher"
            view = "teacher"
            role_ctx = {
                "accessLevel": "teacher",
                "view": "teacher",
                "classlistRoleName": "Instructor (forced)",
            }

        is_teacher = access_level in ("teacher", "admin")
        is_admin = access_level == "admin"

        units_acc: Dict[str, List[Tuple[float, float, Dict[str, Any]]]] = {}

        rubrics_cfg = None
        if cfg is not None:
            rubrics_cfg = (
                getattr(cfg, "rubrics", None)
                if not isinstance(cfg, dict)
                else cfg.get("rubrics")
            )

        # Procesar rúbricas para TODOS los cursos, tengan o no config manual.
        # Sin config -> unidades sintéticas mapeadas a códigos RA reales
        # (Nivel 2) o RUB-{rubricId} como fallback (Nivel 1).
        folders = await _get_course_data_cached(
            "dropbox_folders", orgUnitId,
            lambda: self.bs.list_dropbox_folders(orgUnitId),
        )
        outcome_index = await self._get_outcome_index(orgUnitId)
        align_index = await self._get_alignment_index(orgUnitId)
        if folders:

            def _folder_rubric_id(folder: Dict[str, Any]) -> Optional[int]:
                rubrics = (folder.get("Assessment") or {}).get("Rubrics") or []
                if not rubrics:
                    return None
                rid = rubrics[0].get("RubricId")
                return int(rid) if rid is not None else None

            for folder in [f for f in folders if _folder_rubric_id(f) is not None]:
                folderId = int(folder["Id"])
                rubricId_int = _folder_rubric_id(folder)
                if rubricId_int is None:
                    continue
                rubricId = str(rubricId_int)

                assessment = await self.bs.get_dropbox_rubric_assessment(
                    orgUnitId=orgUnitId,
                    folderId=folderId,
                    rubricId=rubricId_int,
                    userId=userId,
                )

                rubric_detail = (
                    (folder.get("Assessment") or {}).get("Rubrics") or [{}]
                )[0]

                try:
                    inc = detect_rubric_inconsistency(rubric_detail)
                    if inc:
                        qc_flags.append(
                            {
                                "type": "rubric_inconsistency",
                                "rubricId": rubricId,
                                "folderId": folderId,
                                "signals": inc,
                            }
                        )
                except Exception as e:
                    qc_flags.append(
                        {
                            "type": "rubric_quality_check_failed",
                            "rubricId": rubricId,
                            "folderId": folderId,
                            "message": str(e),
                        }
                    )

                rubric_cfg = (
                    rubrics_cfg.get(rubricId)
                    if isinstance(rubrics_cfg, dict)
                    else getattr(rubrics_cfg, rubricId, None)
                )

                criteria_outcomes = assessment.get("CriteriaOutcome") or []
                if not criteria_outcomes:
                    # Sin CriteriaOutcome significa que el docente aún no diligenció
                    # esa rúbrica para este estudiante: caso normal, no es un problema
                    # de calidad de datos. Lo omitimos silenciosamente.
                    continue

                outcome_by_criterion: Dict[str, Dict[str, Any]] = {}
                for co in criteria_outcomes:
                    cid = co.get("CriterionId")
                    if cid is None:
                        continue
                    outcome_by_criterion[str(int(cid))] = co

                # Fallback: si no hay configuración local de rúbrica, creamos
                # unidades sintéticas desde los datos de Brightspace. Nivel 2:
                # cada criterio se mapea a su código RA real (Z1O1DOR3...) vía
                # el OutcomeId del CriteriaOutcome cruzado con outcomeSets. Si
                # no hay OutcomeId/match, cae a RUB-{rubricId}. Peso 1.0.
                if not rubric_cfg:
                    rubric_name = rubric_detail.get("Name") or f"Rúbrica {rubricId}"
                    folder_name = folder.get("Name") or f"Folder {folderId}"
                    mapped_any = False

                    # Outcomes a los que se alinea ESTA rúbrica (vía bulk
                    # /lo/alignments/). La alineación es a nivel de rúbrica —
                    # el API no expone el vínculo por criterio — así que el
                    # score de cada criterio se atribuye a cada outcome
                    # alineado. Cada outcome se resuelve a su código RA real
                    # (Z1O1DOR3...) vía outcome_index. Si la rúbrica NO está
                    # alineada a ningún resultado de aprendizaje, se OMITE:
                    # ya no emitimos unidades sintéticas RUB-{rubricId} — el
                    # dashboard solo muestra resultados de aprendizaje reales.
                    rubric_oids = align_index.get(rubricId) or []
                    resolved = [
                        (outcome_index[o]["code"], o)
                        for o in rubric_oids
                        if o in outcome_index
                    ]
                    if resolved:
                        mapped_any = True

                    for cid, co in outcome_by_criterion.items():
                        # OutcomeId directo del CriteriaOutcome (raro) tiene
                        # prioridad; si no, usamos los outcomes de la rúbrica.
                        direct = _outcome_id_from_co(co)
                        if direct and direct in outcome_index:
                            targets = [(outcome_index[direct]["code"], direct)]
                            mapped_any = True
                        elif resolved:
                            targets = resolved
                        else:
                            continue  # rúbrica sin outcome alineado → no emitir

                        # En cursos auto (sin config) el % se calcula contra el
                        # máximo real de cada criterio (Cells[*].Points), no
                        # contra la constante level_points=4.0. Cada rúbrica
                        # puede usar escala distinta (0-4, 0-10...). Clamp a
                        # [0,100] por seguridad ante datos atípicos.
                        pct = self._pct_from_outcome(
                            co, rubric_detail, "criterion_max_points",
                            max_level_points,
                        )
                        pct = max(0.0, min(100.0, pct))
                        for unit_code, oid in targets:
                            units_acc.setdefault(unit_code, []).append(
                                (
                                    pct,
                                    1.0,
                                    {
                                        "folderId": folderId,
                                        "rubricId": rubricId_int,
                                        "criterionId": int(cid),
                                        "rubricName": rubric_name,
                                        "folderName": folder_name,
                                        "outcomeId": oid,
                                    },
                                )
                            )
                    # Diagnóstico: revela la estructura real de CriteriaOutcome
                    # y si el mapeo a códigos RA funcionó para esta rúbrica.
                    if outcome_by_criterion:
                        _sample = next(iter(outcome_by_criterion.values()))
                        logger.info(
                            "auto-RA[%s] rubric=%s outcome_index=%d align_index=%d co_keys=%s mapped=%s",
                            orgUnitId, rubricId, len(outcome_index), len(align_index),
                            list(_sample.keys()) if isinstance(_sample, dict) else type(_sample).__name__,
                            mapped_any,
                        )
                        try:
                            _cg = (rubric_detail.get("CriteriaGroups") or []) if isinstance(rubric_detail, dict) else []
                            _g0 = _cg[0] if _cg else {}
                            _lvl0 = (_g0.get("Levels") or [{}])[0]
                            _crit0 = (_g0.get("Criteria") or [{}])[0]
                            _cell0 = (_crit0.get("Cells") or [{}])[0] if isinstance(_crit0, dict) else {}
                            _oa0 = (rubric_detail.get("OverallLevels") or [{}])[0]
                            logger.info(
                                "DIAG-struct[%s] rubric=%s scoring=%s level0=%s crit0_keys=%s cell0=%s overall0=%s",
                                orgUnitId, rubricId,
                                rubric_detail.get("ScoringMethod"),
                                _lvl0,
                                list(_crit0.keys()) if isinstance(_crit0, dict) else type(_crit0).__name__,
                                _cell0,
                                _oa0,
                            )
                        except Exception as _e:
                            logger.info("DIAG-struct dump failed: %s", _e)
                    continue

                learning_units = (
                    getattr(rubric_cfg, "learningUnits", None)
                    if not isinstance(rubric_cfg, dict)
                    else rubric_cfg.get("learningUnits")
                )
                if learning_units and isinstance(learning_units, dict):
                    for unit_code, unit_def in learning_units.items():
                        unit_weight = (
                            float(unit_def.get("weight", 1.0))
                            if isinstance(unit_def, dict)
                            else float(getattr(unit_def, "weight", 1.0))
                        )
                        criteria_list = (
                            unit_def.get("criteria", [])
                            if isinstance(unit_def, dict)
                            else getattr(unit_def, "criteria", [])
                        )

                        for criterion_id in criteria_list:
                            cid = str(int(criterion_id))
                            co = outcome_by_criterion.get(cid)
                            if not co:
                                qc_flags.append(
                                    {
                                        "type": "missing_criterion_outcome",
                                        "rubricId": rubricId,
                                        "folderId": folderId,
                                        "unitCode": unit_code,
                                        "criterionId": cid,
                                    }
                                )
                                continue

                            pct = self._pct_from_outcome(
                                co, rubric_detail, scale_type, max_level_points
                            )
                            units_acc.setdefault(unit_code, []).append(
                                (
                                    pct,
                                    unit_weight,
                                    {
                                        "folderId": folderId,
                                        "rubricId": rubricId_int,
                                        "criterionId": int(cid),
                                    },
                                )
                            )
                    continue

                criteria_map = (
                    getattr(rubric_cfg, "criteriaMap", None)
                    if not isinstance(rubric_cfg, dict)
                    else rubric_cfg.get("criteriaMap")
                )
                if not criteria_map or not isinstance(criteria_map, dict):
                    qc_flags.append(
                        {
                            "type": "missing_mapping_structure",
                            "rubricId": rubricId,
                            "folderId": folderId,
                        }
                    )
                    continue

                for cid, co in outcome_by_criterion.items():
                    map_item = criteria_map.get(cid)
                    if not map_item:
                        qc_flags.append(
                            {
                                "type": "missing_criterion_mapping",
                                "rubricId": rubricId,
                                "criterionId": cid,
                                "folderId": folderId,
                            }
                        )
                        continue

                    unit_code = (
                        map_item.code
                        if hasattr(map_item, "code")
                        else map_item["code"]
                    )
                    weight = float(
                        map_item.weight
                        if hasattr(map_item, "weight")
                        else map_item.get("weight", 1.0)
                    )

                    pct = self._pct_from_outcome(
                        co, rubric_detail, scale_type, max_level_points
                    )
                    units_acc.setdefault(unit_code, []).append(
                        (
                            pct,
                            weight,
                            {
                                "folderId": folderId,
                                "rubricId": rubricId_int,
                                "criterionId": int(cid),
                            },
                        )
                    )

        units: List[Dict[str, Any]] = sorted(
            [
                {
                    "code": code,
                    "pct": round(weighted_avg([(r[0], r[1]) for r in rows]), 1),
                    "status": status_from_pct(
                        round(weighted_avg([(r[0], r[1]) for r in rows]), 1), thresholds
                    ),
                    "evidence": [
                        {
                            "folderId": r[2]["folderId"],
                            "rubricId": r[2]["rubricId"],
                            "criterionId": r[2]["criterionId"],
                        }
                        for r in rows
                    ],
                }
                for code, rows in units_acc.items()
            ],
            key=lambda x: x["code"],
        )

        gradebook_block: Dict[str, Any] = {}
        projection_block: Dict[str, Any] = {}

        async def _compute_gradebook(include_evidences: bool) -> Dict[str, Any]:
            list_items_fn = getattr(self.bs, "list_grade_items", None)
            get_value_fn = getattr(self.bs, "get_grade_value", None)
            list_dropbox_fn = getattr(self.bs, "list_dropbox_folders", None)

            if not (callable(list_items_fn) and callable(get_value_fn)):
                qc_flags.append(
                    {
                        "type": "gradebook_not_enabled",
                        "message": "brightspace_client no expone list_grade_items/get_grade_value",
                    }
                )
                return {}

            raw_items = await _get_course_data_cached(
                "grade_items", orgUnitId, lambda: list_items_fn(orgUnitId)
            )
            if isinstance(raw_items, dict):
                raw_items = raw_items.get("Items") or raw_items.get("items") or []
            if not isinstance(raw_items, list):
                return {}

            # Fetch grade categories. Brightspace returns an array of category
            # objects where each contains a nested Grades[] array listing the
            # grade items that belong to that category. We use this to:
            #   1) Resolve categoryName for each evidence
            #   2) Build a gradeCategories[] structure so the frontend can
            #      render "Resumen por Cortes" by category (most reliable
            #      source of grouping — way more trustworthy than parsing
            #      formulas, which Brightspace doesn't always expose).
            categories_by_id: Dict[str, str] = {}
            # Lookup: gradeObjectId → categoryId (when the list_grade_items
            # response lacks CategoryId, which happens in some tenants).
            item_to_category: Dict[str, int] = {}
            grade_categories_out: List[Dict[str, Any]] = []
            list_cats_fn = getattr(self.bs, "list_grade_categories", None)
            if callable(list_cats_fn):
                try:
                    raw_cats = await _get_course_data_cached(
                        "grade_categories", orgUnitId,
                        lambda: list_cats_fn(orgUnitId),
                    )
                    if isinstance(raw_cats, dict):
                        raw_cats = raw_cats.get("Items") or raw_cats.get("items") or []
                    for c in (raw_cats or []):
                        if not isinstance(c, dict):
                            continue
                        cid = c.get("Id") or c.get("CategoryId")
                        nm = c.get("Name") or c.get("name") or ""
                        if cid is None:
                            continue
                        categories_by_id[str(cid)] = nm

                        # Extract nested Grades[] and register item→category
                        inner_grades = c.get("Grades") or c.get("grades") or []
                        item_ids: List[int] = []
                        for ig in inner_grades:
                            if not isinstance(ig, dict):
                                continue
                            gid = ig.get("Id") or ig.get("Identifier")
                            if gid is None:
                                continue
                            try:
                                gid_int = int(gid)
                            except Exception:
                                continue
                            item_ids.append(gid_int)
                            item_to_category[str(gid_int)] = int(cid)

                        grade_categories_out.append({
                            "id": int(cid),
                            "name": nm,
                            "itemIds": item_ids,
                        })
                except Exception:
                    categories_by_id = {}
                    item_to_category = {}
                    grade_categories_out = []

            course_dict = _as_dict(course_cfg)
            gp = (
                course_dict.get("gradingPolicy", {})
                if isinstance(course_dict.get("gradingPolicy", {}), dict)
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
                    it for it in items_in_scope
                    if int(it.get("Id")) in include_ids
                ]
            if exclude_ids:
                items_in_scope = [
                    it for it in items_in_scope
                    if int(it.get("Id")) not in exclude_ids
                ]

            # Mapa folderId -> due date desde Dropbox
            dropbox_due_by_folder_id: Dict[int, Optional[datetime]] = {}
            if callable(list_dropbox_fn):
                try:
                    folders = await _get_course_data_cached(
                        "dropbox_folders", orgUnitId, lambda: list_dropbox_fn(orgUnitId)
                    )
                    _fill_dropbox_due_dates(folders, dropbox_due_by_folder_id)
                except Exception as e:
                    qc_flags.append(
                        {
                            "type": "dropbox_due_lookup_failed",
                            "message": str(e),
                        }
                    )

            def _is_404(err: Exception) -> bool:
                msg = str(err or "")
                return (
                    "Brightspace error 404" in msg
                    or " 404 " in msg
                    or msg.strip().startswith("404")
                )

            values: List[Dict[str, Any]] = []
            missing_values: List[Dict[str, Any]] = []

            # Evitar N+1: UNA llamada trae todas las notas del estudiante
            # (/grades/values/{userId}/). Los ítems que no vengan ahí se siguen
            # consultando uno a uno (en paralelo, acotado) para conservar la
            # misma semántica de 404 → "no publicado / sin valor".
            bulk_values: Dict[int, Dict[str, Any]] = {}
            list_values_fn = getattr(self.bs, "list_grade_values_for_user", None)
            if callable(list_values_fn):
                try:
                    for gv in await list_values_fn(orgUnitId, userId) or []:
                        try:
                            bulk_values[int(gv.get("GradeObjectIdentifier"))] = gv
                        except (TypeError, ValueError):
                            continue
                except Exception as e:
                    logger.debug("grades/values masivo falló ou=%s user=%s: %s", orgUnitId, userId, e)

            _value_sem = asyncio.Semaphore(8)

            async def _fetch_value(it: Dict[str, Any]):
                gid = int(it["Id"])
                if gid in bulk_values:
                    return it, gid, bulk_values[gid], None
                async with _value_sem:
                    try:
                        return it, gid, await get_value_fn(orgUnitId, gid, userId), None
                    except Exception as e:
                        return it, gid, None, e

            for it, gid, val, err in await asyncio.gather(
                *[_fetch_value(it) for it in items_in_scope]
            ):
                if err is None:
                    values.append(
                        {
                            "item": it,
                            "value": val if isinstance(val, dict) else {},
                        }
                    )
                elif _is_404(err):
                    missing_values.append(
                        {
                            "gradeObjectId": gid,
                            "name": it.get("Name"),
                            "weightPct": float(it.get("Weight", 0) or 0),
                            "reason": "not_released_or_no_value",
                        }
                    )
                    values.append({"item": it, "value": {}})
                else:
                    qc_flags.append(
                        {
                            "type": "grade_value_failed",
                            "gradeObjectId": gid,
                            "message": str(err),
                        }
                    )
                    values.append({"item": it, "value": {}})

            _now = datetime.now(timezone.utc)
            # Regla de fechas heredadas: vencido real = fecha pasada PERO
            # posterior al inicio del curso (las anteriores vienen de
            # importar contenido de un curso previo).
            _course_start = await self._course_start_date(orgUnitId)

            graded: List[Tuple[float, float]] = []
            total_weight = 0.0
            graded_weight = 0.0
            graded_items_count = 0
            total_items_count = 0

            pending_ungraded_count = 0
            pending_ungraded_weight = 0.0

            overdue_unscored_count = 0
            overdue_unscored_weight = 0.0

            evidences: List[Dict[str, Any]] = []
            pending_items: List[Dict[str, Any]] = []

            for row in values:
                it = row["item"]
                val = row["value"] or {}

                item_name = it.get("Name")
                w = float(it.get("Weight", 0) or 0.0)

                # Detect "Corte" / summary items: these are aggregated running totals
                # (Corte 1/2/3, C1, Cohorte, etc.). We DISPLAY them but DO NOT count
                # them in weighted averages — they'd double-count the component grades.
                is_corte = _is_corte_item(item_name)
                corte_period = _extract_corte_period(item_name) if is_corte else None

                points_num = val.get("PointsNumerator")
                points_den = val.get("PointsDenominator")
                weighted_num = val.get("WeightedNumerator")
                weighted_den = val.get("WeightedDenominator")

                due_dt = _due_date_for_grade_item(it, dropbox_due_by_folder_id)
                is_overdue = bool(
                    due_dt and due_dt < _now
                    and (_course_start is None or due_dt >= _course_start)
                )

                has_grade = _is_graded(points_num, points_den)

                score_pct = None
                evidence_status = "pending"

                if has_grade:
                    try:
                        score_pct = round((float(points_num) / float(points_den)) * 100.0, 2)
                    except Exception:
                        score_pct = None
                    evidence_status = "graded"
                else:
                    if is_overdue:
                        evidence_status = "overdue_unscored"
                    else:
                        evidence_status = "pending"

                # Only non-Corte items contribute to aggregate counts/weights
                if not is_corte:
                    total_weight += w
                    total_items_count += 1

                    if has_grade:
                        graded_items_count += 1
                        graded_weight += w
                    else:
                        if is_overdue:
                            overdue_unscored_count += 1
                            overdue_unscored_weight += w
                        else:
                            pending_ungraded_count += 1
                            pending_ungraded_weight += w

                    if has_grade and weighted_num is not None and weighted_den is not None:
                        if _num(weighted_den, 0.0) > 0:
                            graded.append((float(weighted_num), float(weighted_den)))

                if include_evidences:
                    # Find linked dropbox folder ID for download/feedback links
                    _assoc = it.get("AssociatedTool") or {}
                    _tool_id = _assoc.get("ToolId")
                    _tool_item = _assoc.get("ToolItemId")
                    linked_dropbox_id = None
                    if _tool_id in (1, 2000) and _tool_item is not None:
                        try:
                            linked_dropbox_id = int(_tool_item)
                        except Exception:
                            linked_dropbox_id = None

                    # Extract category + formula metadata. Brightspace exposes:
                    #   CategoryId          - numeric id (or null if uncategorized)
                    #   Category.Name       - when the grade item is nested under a
                    #                         category on certain API versions
                    #   GradeType           - "Numeric", "Formula", "Calculated",
                    #                         "PassFail", "SelectBox", "Text"
                    #   Formula / FormulaExpression / Expression - for Formula type
                    _cat_obj = it.get("Category") if isinstance(it.get("Category"), dict) else None
                    category_id = it.get("CategoryId")
                    if category_id is None and _cat_obj is not None:
                        category_id = _cat_obj.get("Id")
                    # CategoryId=0 means "uncategorized" in Brightspace, treat as None
                    if category_id == 0:
                        category_id = None
                    # Fall back to the item→category lookup from the
                    # categories endpoint (some tenants don't echo CategoryId
                    # on the /grades/ list response)
                    if category_id is None:
                        gid_key = str(it.get("Id"))
                        if gid_key in item_to_category:
                            category_id = item_to_category[gid_key]
                    category_name = None
                    if _cat_obj is not None:
                        category_name = _cat_obj.get("Name")
                    if not category_name:
                        category_name = it.get("CategoryName")
                    # Fall back to the categories lookup we fetched above
                    if not category_name and category_id is not None:
                        category_name = categories_by_id.get(str(category_id))

                    grade_type = it.get("GradeType") or ""
                    formula_text = (
                        it.get("Formula")
                        or it.get("FormulaExpression")
                        or it.get("Expression")
                        or ""
                    )

                    evidences.append(
                        {
                            "gradeObjectId": int(it.get("Id")),
                            "name": item_name,
                            "weightPct": w,
                            "scorePct": score_pct,
                            "status": evidence_status,
                            "isGraded": has_grade,
                            "isOverdue": is_overdue,
                            "isCorte": is_corte,
                            "cortePeriod": corte_period,
                            "dueDate": due_dt.isoformat() if due_dt else None,
                            "lastModified": val.get("LastModified"),
                            "linkedDropboxId": linked_dropbox_id,
                            "categoryId": category_id,
                            "categoryName": category_name,
                            "gradeType": grade_type,
                            "formula": formula_text,
                        }
                    )

                    # Don't mark Corte items as pending items
                    if not has_grade and not is_corte:
                        pending_items.append(
                            {
                                "gradeObjectId": int(it.get("Id")),
                                "name": item_name,
                                "weightPct": w,
                                "status": evidence_status,
                                "isOverdue": is_overdue,
                                "dueDate": due_dt.isoformat() if due_dt else None,
                            }
                        )

            weighted_earned = sum(a for a, _ in graded) if graded else 0.0
            weighted_possible = sum(b for _, b in graded) if graded else 0.0

            current_perf_pct: Optional[float] = (
                round((weighted_earned / weighted_possible) * 100.0, 2)
                if weighted_possible
                else None
            )

            # Fallback si no hay ponderados (también excluye Corte)
            if current_perf_pct is None:
                acc: List[Tuple[float, float]] = []
                for row in values:
                    it = row["item"]
                    val = row["value"] or {}
                    if _is_corte_item(it.get("Name")):
                        continue
                    w = float(it.get("Weight", 0) or 0.0)
                    pn = val.get("PointsNumerator")
                    pd = val.get("PointsDenominator")
                    if not _is_graded(pn, pd):
                        continue
                    try:
                        acc.append(((float(pn) / float(pd)) * 100.0, w))
                    except Exception:
                        pass
                if acc and sum(w for _, w in acc) > 0:
                    current_perf_pct = round(weighted_avg(acc), 2)

            coverage_pct = (
                round((graded_weight / total_weight) * 100.0, 2)
                if total_weight else 0.0
            )

            pending_ungraded_weight_pct = (
                round((pending_ungraded_weight / total_weight) * 100.0, 2)
                if total_weight else 0.0
            )

            overdue_unscored_weight_pct = (
                round((overdue_unscored_weight / total_weight) * 100.0, 2)
                if total_weight else 0.0
            )

            out: Dict[str, Any] = {
                "currentPerformancePct": current_perf_pct,
                "coveragePct": coverage_pct,
                "pendingWeightPct": round(max(0.0, 100.0 - coverage_pct), 2),
                "pendingUngradedCount": pending_ungraded_count,
                "pendingUngradedWeightPct": pending_ungraded_weight_pct,
                "overdueUnscoredCount": overdue_unscored_count,
                "overdueUnscoredWeightPct": overdue_unscored_weight_pct,
                "gradedItemsCount": graded_items_count,
                "totalItemsCount": total_items_count,
                "status": status_from_pct(current_perf_pct, thresholds),
            }

            if include_evidences:
                out["evidences"] = evidences
                out["pendingItems"] = sorted(
                    pending_items,
                    key=lambda x: float(x.get("weightPct") or 0.0),
                    reverse=True,
                )
                out["missingValues"] = sorted(
                    missing_values,
                    key=lambda x: float(x.get("weightPct") or 0.0),
                    reverse=True,
                )
                # Expose the category structure so the frontend can render
                # cortes grouped by their gradebook category (most reliable
                # source of grouping, especially when the Formula text isn't
                # exposed by the API).
                out["gradeCategories"] = grade_categories_out

            return out

        try:
            # Include evidences for BOTH teachers and students.
            # Students need to see their own evidences (graded, pending, overdue)
            # in the portal view.
            gradebook_block = await _compute_gradebook(include_evidences=True) or {}
        except Exception as e:
            qc_flags.append({"type": "gradebook_compute_failed", "message": str(e)})
            gradebook_block = {}

        globalPct = (
            round(sum(u["pct"] for u in units) / len(units), 1) if units else None
        )
        risk = (
            self._risk_from_global(globalPct, thresholds)
            if globalPct is not None
            else self._risk_from_performance(
                gradebook_block.get("currentPerformancePct"), thresholds
            )
        )

        prescription = self._apply_prescription(cfg, units, thresholds)

        if (
            is_teacher
            and gradebook_block
            and gradebook_block.get("coveragePct") is not None
            and gradebook_block.get("currentPerformancePct") is not None
        ):
            try:
                course_dict = _as_dict(course_cfg)
                proj_cfg = course_dict.get("projection") or {}
                proj_cfg = proj_cfg if isinstance(proj_cfg, dict) else {}
                scen = proj_cfg.get("scenarioPendingPct") or {}
                scen = scen if isinstance(scen, dict) else {}

                risk_assump = float(scen.get("risk", 50))
                improve_assump = float(scen.get("improve", 70))

                coverage_pct = float(gradebook_block.get("coveragePct") or 0.0)
                current_perf_pct = float(
                    gradebook_block.get("currentPerformancePct") or 0.0
                )
                c = coverage_pct / 100.0
                p = current_perf_pct

                if coverage_pct >= 99.999:
                    projection_block = {
                        "coveragePct": coverage_pct,
                        "currentPerformancePct": current_perf_pct,
                        "isFinal": True,
                        "finalPct": current_perf_pct,
                        "scenarios": [],
                        "note": "Cobertura 100%: la proyección coincide con el desempeño final.",
                    }
                else:
                    projection_block = {
                        "coveragePct": coverage_pct,
                        "currentPerformancePct": current_perf_pct,
                        "isFinal": False,
                        "finalPct": None,
                        "scenarios": [
                            {
                                "id": "risk",
                                "assumptionPendingPct": risk_assump,
                                "projectedFinalPct": round(
                                    (c * p) + ((1 - c) * risk_assump), 2
                                ),
                            },
                            {
                                "id": "base",
                                "assumptionPendingPct": p,
                                "projectedFinalPct": round(p, 2),
                            },
                            {
                                "id": "improve",
                                "assumptionPendingPct": improve_assump,
                                "projectedFinalPct": round(
                                    (c * p) + ((1 - c) * improve_assump), 2
                                ),
                            },
                        ],
                    }
            except Exception as e:
                qc_flags.append(
                    {"type": "projection_compute_failed", "message": str(e)}
                )
                projection_block = {}

        model_type = None
        if cfg is not None:
            model_type = (
                cfg.modelType
                if hasattr(cfg, "modelType")
                else (cfg.get("modelType") if isinstance(cfg, dict) else None)
            )
        if model_type is None:
            cd = _as_dict(course_cfg)
            model_type = cd.get("modelType") or cd.get("maturityProfile")

        macro_units = build_macro_units(units, cfg, thresholds)

        capabilities = {
            "gradebook": bool(gradebook_block),
            "projection": bool(projection_block) if is_teacher else False,
            "competencies": bool(units),
            "prescription": bool(prescription),
            "accessLevel": access_level,
            "view": view,
        }

        if not is_admin and role_ctx:
            role_ctx = {
                "accessLevel": role_ctx.get("accessLevel"),
                "view": role_ctx.get("view"),
                "classlistRoleName": role_ctx.get("classlistRoleName"),
            }

        if not is_teacher:
            gradebook_block = {
                "currentPerformancePct": gradebook_block.get("currentPerformancePct"),
                "coveragePct": gradebook_block.get("coveragePct"),
                "pendingWeightPct": gradebook_block.get("pendingWeightPct"),
                "gradedItemsCount": gradebook_block.get("gradedItemsCount"),
                "totalItemsCount": gradebook_block.get("totalItemsCount"),
                "status": gradebook_block.get("status"),
            }
            projection_block = {}

        graded_items_count = int(gradebook_block.get("gradedItemsCount") or 0)
        total_items_count = int(gradebook_block.get("totalItemsCount") or 0)

        return {
            "orgUnitId": orgUnitId,
            "userId": userId,
            "course": {
                "maturityProfile": (
                    getattr(course_cfg, "maturityProfile", None)
                    if course_cfg is not None
                    else None
                ),
                "modelType": model_type,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
            "access": role_ctx,
            "capabilities": capabilities,
            "summary": {
                "globalPct": globalPct,
                "risk": risk,
                "coveragePct": (
                    gradebook_block.get("coveragePct") if gradebook_block else None
                ),
                "currentPerformancePct": (
                    gradebook_block.get("currentPerformancePct")
                    if gradebook_block
                    else None
                ),
                "gradedItemsCount": graded_items_count,
                "totalItemsCount": total_items_count,
                "pendingUngradedCount": gradebook_block.get("pendingUngradedCount", 0),
                "pendingUngradedWeightPct": gradebook_block.get("pendingUngradedWeightPct", 0.0),
                "overdueUnscoredCount": gradebook_block.get("overdueUnscoredCount", 0),
                "overdueUnscoredWeightPct": gradebook_block.get("overdueUnscoredWeightPct", 0.0),
                "coverageCountText": (
                    f"{graded_items_count}/{total_items_count}"
                    if total_items_count
                    else "0/0"
                ),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
            "macro": {"units": macro_units},
            "units": units,
            "prescription": prescription,
            "macroUnits": macro_units,
            "gradebook": gradebook_block,
            "projection": projection_block,
            "qualityFlags": qc_flags,
        }
