"""Feedback de una entrega de dropbox: texto, nota (con fallback al
gradebook), rúbricas (API moderna LE 1.93 y fallback legacy), comentario de
la entrega y RA alineados. Helper del proxy Brightspace."""
from __future__ import annotations

import asyncio
import logging

from app.api.deps import BRIGHTSPACE_BASE_URL, LP_VERSION, LE_VERSION, _bs_get
from app.services.brightspace.dropbox import _group_ids_for_user

logger = logging.getLogger("uvicorn.error")


def _flatten_groups(rubric_obj: dict) -> tuple[list, list]:
    """Flatten CriteriaGroups → (criteria, levels)."""
    all_crit = []
    all_lvl = []
    groups = rubric_obj.get("CriteriaGroups") or rubric_obj.get("criteriaGroups") or []
    for g in groups:
        if not isinstance(g, dict):
            continue
        for lvl in (g.get("Levels") or []):
            if isinstance(lvl, dict):
                all_lvl.append(lvl)
        for c in (g.get("Criteria") or []):
            if isinstance(c, dict):
                all_crit.append(c)
    # Older shape: flat Criteria/Levels at top
    if not all_crit:
        for c in (rubric_obj.get("Criteria") or []):
            if isinstance(c, dict): all_crit.append(c)
    if not all_lvl:
        for l in (rubric_obj.get("Levels") or []):
            if isinstance(l, dict): all_lvl.append(l)
    return all_crit, all_lvl


async def build_dropbox_feedback(
    bs, headers: dict, org_unit_id: int, folder_id: int, user_id: int
) -> dict:
    """Arma el payload completo de feedback de la entrega de `user_id`."""
    # 1. Feedback (the correct LE path uses /feedback/{userId} directly, no entityType)
    feedback_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/feedback/{user_id}"
    )
    # 2. Folder info (for rubric IDs + name + instructions)
    folder_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    # 3. Submissions (for the student's own comment when uploading)
    subs_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/submissions/"
    )

    (fb_status, fb_data), (_, folder_data), (_, subs_data) = await asyncio.gather(
        _bs_get(feedback_url, headers),
        _bs_get(folder_url, headers),
        _bs_get(subs_url, headers),
    )

    # If feedback fetch failed, still return whatever we have
    if fb_status != 200 or not isinstance(fb_data, dict):
        fb_data = {}

    folder_data = folder_data if isinstance(folder_data, dict) else {}
    folder_name = folder_data.get("Name") or ""
    rubric_refs = (folder_data.get("Assessment") or {}).get("Rubrics") or []

    # 3. For each rubric, fetch the assessment (per-criterion levels + comments).
    # Brightspace has MANY variants of rubric endpoints depending on version
    # and how the rubric is attached. We try several in parallel and merge
    # whatever we get.
    rubrics_out: list[dict] = []

    async def _try(url: str, params: dict | None = None):
        try:
            _, data = await _bs_get(url, headers, params or {})
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    # Feedback may already include embedded RubricAssessments (newer LE)
    fb_rubric_assessments = (
        fb_data.get("RubricAssessments")
        or fb_data.get("rubricAssessments")
        or []
    )
    fb_rubric_by_id: dict = {}
    for ra in fb_rubric_assessments:
        if isinstance(ra, dict):
            rid = ra.get("RubricId") or ra.get("rubricId")
            if rid is not None:
                fb_rubric_by_id[str(rid)] = ra

    # ── PREFERRED PATH (LMS v20.26.4+, LE API 1.93+) ──────────────────────
    # New endpoints documented by D2L for the Rubrics API:
    #   GET /d2l/api/le/1.93/{ou}/rubrics?objectType=Dropbox&objectId={fid}
    #   GET /d2l/api/le/1.93/{ou}/assessment?assessmentType=Rubric&objectType=Dropbox
    #                                     &objectId={fid}&rubricId={rid}&userId={uid}
    #
    # The list endpoint returns an array of Rubric blocks with CriteriaGroups
    # (each group has Levels + Criteria with Cells). The assessment endpoint
    # returns a RubricAssessment with OverallOutcome and CriteriaOutcome.
    #
    # We try this path first; if it 404s (older tenant), we fall back to the
    # legacy probe-many-endpoints logic below.
    modern_rubrics: list[dict] = []
    modern_list_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/1.93/{org_unit_id}/rubrics"
    )
    modern_list_params = {"objectType": "Dropbox", "objectId": str(folder_id)}
    try:
        ml_status, ml_data = await _bs_get(modern_list_url, headers, modern_list_params)
        if ml_status == 200:
            # Response may be a raw array OR a paged dict with "Items"
            if isinstance(ml_data, list):
                modern_rubrics = ml_data
            elif isinstance(ml_data, dict):
                modern_rubrics = ml_data.get("Items") or ml_data.get("items") or []
    except Exception:
        modern_rubrics = []


    async def _fetch_modern_assessment(rubric_id: int) -> dict:
        url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/1.93/{org_unit_id}/assessment"
        params = {
            "assessmentType": "Rubric",
            "objectType":     "Dropbox",
            "objectId":       str(folder_id),
            "rubricId":       str(rubric_id),
            "userId":         str(user_id),
        }
        try:
            _, data = await _bs_get(url, headers, params)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    async def _build_modern(rubric_obj: dict) -> dict | None:
        rubric_id = rubric_obj.get("RubricId") or rubric_obj.get("Id")
        if rubric_id is None:
            return None
        criteria_list, levels_list = _flatten_groups(rubric_obj)
        assess = await _fetch_modern_assessment(rubric_id)

        # Build level lookup
        levels_by_id: dict = {}
        for lvl in levels_list:
            lid = lvl.get("Id")
            if lid is not None:
                levels_by_id[str(lid)] = lvl.get("Name") or ""

        # Extract CriteriaOutcome (new shape) or fall back to CriteriaResults
        outcomes_raw = (
            assess.get("CriteriaOutcome")
            or assess.get("criteriaOutcome")
            or assess.get("CriteriaResults")
            or []
        )
        crit_map: dict = {}
        for out in outcomes_raw:
            if not isinstance(out, dict):
                continue
            cid = out.get("CriterionId") or out.get("criterionId")
            if cid is None:
                continue
            fb_obj = out.get("Feedback") or {}
            fb_text = ""
            if isinstance(fb_obj, dict):
                fb_text = fb_obj.get("Html") or fb_obj.get("Text") or ""
            crit_map[str(cid)] = {
                "levelId": out.get("LevelId") or out.get("levelId"),
                "score":   out.get("Score") or out.get("score"),
                "comment": fb_text,
            }

        criteria_out = []
        for c in criteria_list:
            cid = c.get("Id")
            result = crit_map.get(str(cid)) if cid is not None else None
            level_name = ""
            level_desc = ""
            cell_points = None
            sel_level_id = (result or {}).get("levelId")
            if result and sel_level_id is not None:
                level_name = levels_by_id.get(str(sel_level_id), "")
                # The descriptive text ("por qué" del nivel) vive en la celda
                # criterio×nivel de la DEFINICIÓN de la rúbrica, no en la
                # evaluación. Unimos el LevelId seleccionado con esa celda.
                for cell in (c.get("Cells") or []):
                    if not isinstance(cell, dict):
                        continue
                    if str(cell.get("LevelId")) == str(sel_level_id):
                        dobj = cell.get("Description") or {}
                        if isinstance(dobj, dict):
                            level_desc = dobj.get("Html") or dobj.get("Text") or ""
                        cell_points = cell.get("Points")
                        break
            # Brightspace no devuelve Score cuando el criterio vale 0; si hay un
            # nivel seleccionado, usamos los puntos de esa celda (que pueden ser
            # 0) para no mostrar "—" en criterios evaluados en 0.
            crit_score = (result or {}).get("score")
            if crit_score is None and sel_level_id is not None and cell_points is not None:
                crit_score = cell_points
            criteria_out.append({
                "id":               cid,
                "name":             c.get("Name") or "",
                "level":            level_name,
                "levelDescription": level_desc,
                "points":           crit_score,
                "comment":          (result or {}).get("comment") or "",
            })

        # Overall info from OverallOutcome
        overall = assess.get("OverallOutcome") or assess.get("overallOutcome") or {}
        overall_level_name = ""
        if isinstance(overall, dict) and overall.get("LevelId") is not None:
            overall_level_name = levels_by_id.get(str(overall["LevelId"]), "")
            # If not found in criterion-group levels, try OverallLevels
            if not overall_level_name:
                for ol in (rubric_obj.get("OverallLevels") or []):
                    if isinstance(ol, dict) and str(ol.get("Id")) == str(overall["LevelId"]):
                        overall_level_name = ol.get("Name") or ""
                        break
        overall_fb_obj = overall.get("Feedback") if isinstance(overall, dict) else None
        overall_comment = ""
        if isinstance(overall_fb_obj, dict):
            overall_comment = overall_fb_obj.get("Html") or overall_fb_obj.get("Text") or ""

        # Compute max points as sum of max level points per criterion (analytic
        # rubrics). For holistic rubrics, use OverallLevels max.
        max_points = None
        try:
            per_crit_max = 0
            any_pts = False
            for c in criteria_list:
                cells = c.get("Cells") or []
                cell_max = 0
                for cell in cells:
                    pts = cell.get("Points")
                    if pts is not None:
                        any_pts = True
                        try:
                            cell_max = max(cell_max, float(pts))
                        except Exception:
                            pass
                per_crit_max += cell_max
            if any_pts and per_crit_max > 0:
                max_points = per_crit_max
        except Exception:
            max_points = None

        return {
            "rubricId":       rubric_id,
            "name":           rubric_obj.get("Name") or "",
            "outOf":          max_points,
            "score":          (overall or {}).get("Score"),
            "level":          overall_level_name,
            "overallComment": overall_comment,
            "criteria":       criteria_out,
            "_debug": {
                "source":     "le-1.93",
                "critCount":  len(criteria_list),
                "lvlCount":   len(levels_list),
                "outcomes":   len(outcomes_raw),
            },
        }

    if modern_rubrics:
        built = await asyncio.gather(*[_build_modern(r) for r in modern_rubrics])
        rubrics_out = [r for r in built if r]

    # ── LEGACY PATH ──────────────────────────────────────────────────────
    # Only used if the modern endpoint returned nothing (pre-1.93 tenant).
    if not rubrics_out and rubric_refs:
        async def _fetch_rubric(rubric_ref: dict) -> dict | None:
            rubric_id = rubric_ref.get("RubricId")
            if rubric_id is None:
                return None

            # Try BOTH the LP and LE-scoped rubric endpoints for the definition.
            # Course-scoped rubrics often require the LE path with orgUnitId.
            urls_def = [
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/rubrics/{rubric_id}",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/rubrics/{rubric_id}",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/rubrics/{rubric_id}",
            ]
            # Criteria & levels sub-endpoints (some tenants require these explicitly)
            urls_crit = [
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/rubrics/{rubric_id}/criteria/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/rubrics/{rubric_id}/criteria/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/rubrics/{rubric_id}/criteria/",
            ]
            urls_lvl = [
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/rubrics/{rubric_id}/levels/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/rubrics/{rubric_id}/levels/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/rubrics/{rubric_id}/levels/",
            ]

            # Assessment (teacher's per-criterion selection)
            assessment_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
            assess_params = {
                "assessmentType": "Rubric",
                "objectType":     "Dropbox",
                "objectId":       str(folder_id),
                "rubricId":       str(rubric_id),
                "userId":         str(user_id),
            }
            # Alternative assessment endpoint: LE dropbox rubric assessments
            alt_assessment_url = (
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                f"/{org_unit_id}/dropbox/folders/{folder_id}/rubrics/{rubric_id}/assessments/{user_id}"
            )

            # Fetch everything in parallel
            tasks = []
            for u in urls_def: tasks.append(_try(u))
            for u in urls_crit: tasks.append(_try(u))
            for u in urls_lvl: tasks.append(_try(u))
            tasks.append(_try(assessment_url, assess_params))
            tasks.append(_try(alt_assessment_url))

            results = await asyncio.gather(*tasks)
            n = len(urls_def)
            defs = results[0:n]
            crits = results[n:n*2]
            lvls = results[n*2:n*3]
            assess_primary = results[n*3] if len(results) > n*3 else {}
            assess_alt = results[n*3 + 1] if len(results) > n*3 + 1 else {}

            # Pick the first non-empty definition
            rubric_def = next((d for d in defs if d), {})
            # Pick first non-empty criteria list (may be a list or dict with Items)
            def _as_list(x):
                if isinstance(x, list): return x
                if isinstance(x, dict):
                    return x.get("Items") or x.get("items") or []
                return []
            criteria_list = []
            for c in crits:
                lst = _as_list(c)
                if lst: criteria_list = lst; break
            if not criteria_list:
                criteria_list = rubric_def.get("Criteria") or []
            levels_list = []
            for l in lvls:
                lst = _as_list(l)
                if lst: levels_list = lst; break
            if not levels_list:
                levels_list = rubric_def.get("Levels") or []

            # Assessment data: prefer embedded in feedback, then alt, then primary
            assess_data = fb_rubric_by_id.get(str(rubric_id)) or {}
            if not assess_data:
                assess_data = assess_alt or assess_primary or {}

            # Extract criterion results
            crit_results_raw = (
                assess_data.get("CriteriaResults")
                or assess_data.get("criteriaResults")
                or []
            )
            crit_map: dict = {}
            for cr in crit_results_raw:
                if not isinstance(cr, dict):
                    continue
                cid = cr.get("CriterionId") or cr.get("criterionId")
                if cid is None:
                    continue
                # level info: LevelAssessed (object) or LevelId (int)
                level_assessed = cr.get("LevelAssessed") or cr.get("levelAssessed") or {}
                level_id = None
                level_name_from_assess = ""
                if isinstance(level_assessed, dict):
                    level_id = level_assessed.get("Id") or level_assessed.get("LevelId")
                    level_name_from_assess = level_assessed.get("Name") or ""
                if level_id is None:
                    level_id = cr.get("LevelId") or cr.get("levelId")
                fb_obj_cr = cr.get("Feedback") or {}
                fb_text = ""
                if isinstance(fb_obj_cr, dict):
                    fb_text = fb_obj_cr.get("Html") or fb_obj_cr.get("Text") or ""
                points = (
                    cr.get("Score")
                    or cr.get("score")
                    or cr.get("PointsAssessed")
                    or cr.get("pointsAssessed")
                )
                crit_map[str(cid)] = {
                    "levelId":        level_id,
                    "levelNameInline": level_name_from_assess,
                    "score":          points,
                    "feedback":       fb_text,
                }

            # Build levels lookup
            levels_by_id: dict = {}
            for lvl in levels_list:
                if isinstance(lvl, dict):
                    lid = lvl.get("Id") or lvl.get("LevelId")
                    if lid is not None:
                        levels_by_id[str(lid)] = lvl.get("Name") or ""

            criteria_out = []
            for c in criteria_list:
                if not isinstance(c, dict):
                    continue
                cid = c.get("Id") or c.get("CriterionId")
                result = crit_map.get(str(cid)) if cid is not None else None
                level_name = ""
                if result:
                    level_name = result.get("levelNameInline") or ""
                    if not level_name and result.get("levelId") is not None:
                        level_name = levels_by_id.get(str(result["levelId"]), "")
                criteria_out.append({
                    "id":       cid,
                    "name":     c.get("Name") or c.get("CriterionName") or "",
                    "level":    level_name,
                    "points":   (result or {}).get("score"),
                    "comment":  (result or {}).get("feedback") or "",
                })

            # If we still have no criteria, fall back to the raw criterion results
            # (only shows IDs + levels/comments, but better than an empty state).
            if not criteria_out and crit_map:
                for cid, r in crit_map.items():
                    criteria_out.append({
                        "id":      cid,
                        "name":    f"Criterio {cid}",
                        "level":   r.get("levelNameInline") or levels_by_id.get(str(r.get("levelId")), ""),
                        "points":  r.get("score"),
                        "comment": r.get("feedback") or "",
                    })

            # Overall level (from assessment)
            overall = (
                assess_data.get("OverallLevel")
                or assess_data.get("Level")
                or {}
            )
            overall_name = ""
            if isinstance(overall, dict):
                overall_name = overall.get("Name") or overall.get("name") or ""

            # Overall comment (on the rubric itself, not per-criterion)
            overall_comment_obj = assess_data.get("Comment") or {}
            overall_comment = ""
            if isinstance(overall_comment_obj, dict):
                overall_comment = overall_comment_obj.get("Html") or overall_comment_obj.get("Text") or ""

            return {
                "rubricId":       rubric_id,
                "name":           rubric_def.get("Name") or rubric_ref.get("Name") or "",
                "outOf":          rubric_def.get("MaxPoints") or rubric_def.get("OutOf"),
                "score":          assess_data.get("Score") or assess_data.get("score"),
                "level":          overall_name,
                "overallComment": overall_comment,
                "criteria":       criteria_out,
                # For debugging; frontend ignores unless dev-mode
                "_debug": {
                    "defKeys":      list(rubric_def.keys()) if isinstance(rubric_def, dict) else [],
                    "critCount":    len(criteria_list),
                    "lvlCount":     len(levels_list),
                    "assessSource": "feedback-embedded" if fb_rubric_by_id.get(str(rubric_id))
                                    else ("alt-le" if assess_alt else "unstable"),
                    "critResults":  len(crit_results_raw),
                },
            }

        fetched = await asyncio.gather(*[_fetch_rubric(r) for r in rubric_refs])
        rubrics_out = [r for r in fetched if r]

    # Normalize feedback text (Brightspace uses Feedback.Text or Feedback.Html)
    fb_obj = fb_data.get("Feedback") if isinstance(fb_data.get("Feedback"), dict) else {}
    feedback_text = fb_obj.get("Html") or fb_obj.get("Text") or ""

    # Assignment-level instructions (lo que el docente escribió al crear la tarea)
    instr_obj = folder_data.get("Instructions") or folder_data.get("CustomInstructions") or {}
    assignment_instructions = ""
    if isinstance(instr_obj, dict):
        assignment_instructions = instr_obj.get("Html") or instr_obj.get("Text") or ""
    elif isinstance(instr_obj, str):
        assignment_instructions = instr_obj

    # Student's submission comment (lo que el estudiante escribió al subir su entrega)
    submission_comment = ""
    submitted_at = None
    subs_list = subs_data if isinstance(subs_data, list) else (
        (subs_data or {}).get("Items") or (subs_data or {}).get("items") or []
    )
    # Group assignments: /feedback/{userId} devuelve 404 porque el feedback vive
    # en la entidad GRUPO, no en el usuario. Resolvemos el grupo del estudiante
    # (vía la categoría GroupTypeId de la carpeta) para poder emparejar su
    # submission por EntityId de grupo.
    group_entity_ids: set[str] = set()
    group_type_id = folder_data.get("GroupTypeId")
    if group_type_id is not None:
        try:
            _, groups_data = await _bs_get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                f"/{org_unit_id}/groupcategories/{group_type_id}/groups/",
                headers,
            )
            group_entity_ids |= _group_ids_for_user(groups_data, user_id)
        except Exception as e:
            logger.warning(
                "group resolve failed folder=%s user=%s: %s", folder_id, user_id, e
            )

    user_subs_match = []
    for s in subs_list:
        if not isinstance(s, dict):
            continue
        eid = (
            s.get("EntityId")
            or s.get("UserId")
            or (s.get("Entity") or {}).get("EntityId")
        )
        if str(eid) == str(user_id) or str(eid) in group_entity_ids:
            user_subs_match.append(s)

    # Fallback: si /feedback/{userId} no devolvió Feedback.Text, sacarlo del bulk
    if not feedback_text and user_subs_match:
        for entry in user_subs_match:
            fb_outer = entry.get("Feedback") or {}
            fb_inner = fb_outer.get("Feedback") if isinstance(fb_outer, dict) else None
            if isinstance(fb_inner, dict):
                feedback_text = fb_inner.get("Html") or fb_inner.get("Text") or ""
                if feedback_text:
                    break
    # Comment is per-submission; pick the most recent
    if user_subs_match:
        # Try to flatten submissions inside grouped entries (Brightspace returns
        # one entry per user with a Submissions[] array)
        flat = []
        for entry in user_subs_match:
            inner = entry.get("Submissions") or entry.get("submissions") or []
            if isinstance(inner, list) and inner:
                flat.extend([sub for sub in inner if isinstance(sub, dict)])
            else:
                flat.append(entry)
        # Pick most recent by SubmissionDate
        def _sub_date(x):
            return x.get("SubmissionDate") or x.get("submissionDate") or ""
        flat.sort(key=_sub_date, reverse=True)
        if flat:
            top = flat[0]
            submitted_at = _sub_date(top) or None
            cmt = top.get("Comment") or {}
            if isinstance(cmt, dict):
                submission_comment = cmt.get("Html") or cmt.get("Text") or ""
            elif isinstance(cmt, str):
                submission_comment = cmt

    # Fallback: si /feedback/{userId} no trae Score/OutOf (caso de calificación
    # cargada directamente al gradebook), consultar el grade item asociado al folder.
    final_score = fb_data.get("Score")
    final_out_of = fb_data.get("OutOf")
    if final_score is None or final_out_of is None:
        # GradeItemId puede estar en Assessment.GradeItemId o GradeItemId top-level
        assess = folder_data.get("Assessment") or {}
        grade_item_id = (
            assess.get("GradeItemId")
            or folder_data.get("GradeItemId")
            or assess.get("GradeItem")
        )
        logger.info(
            "grades fallback folder=%s user=%s gradeItemId=%s feedbackScore=%s feedbackOutOf=%s",
            folder_id, user_id, grade_item_id, final_score, final_out_of,
        )
        if grade_item_id:
            try:
                gv_url = (
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                    f"/{org_unit_id}/grades/{grade_item_id}/values/{user_id}"
                )
                gi_url = (
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                    f"/{org_unit_id}/grades/{grade_item_id}"
                )
                (gv_status, gv_data), (gi_status, gi_data) = await asyncio.gather(
                    _bs_get(gv_url, headers),
                    _bs_get(gi_url, headers),
                )
                logger.info(
                    "grades fallback resp gv_status=%s gv_keys=%s gi_status=%s gi_keys=%s",
                    gv_status,
                    list(gv_data.keys()) if isinstance(gv_data, dict) else type(gv_data).__name__,
                    gi_status,
                    list(gi_data.keys()) if isinstance(gi_data, dict) else type(gi_data).__name__,
                )
                if isinstance(gv_data, dict):
                    pv = (
                        gv_data.get("PointsNumerator")
                        or (gv_data.get("GradeValue") or {}).get("PointsNumerator")
                        or gv_data.get("WeightedNumerator")
                    )
                    # DisplayedGrade puede ser string como "25" o "25/100"
                    if pv is None:
                        dg = gv_data.get("DisplayedGrade")
                        if dg:
                            try:
                                pv = float(str(dg).split("/")[0].strip())
                            except Exception:
                                pv = None
                    if pv is not None and final_score is None:
                        final_score = pv
                if isinstance(gi_data, dict) and final_out_of is None:
                    final_out_of = gi_data.get("MaxPoints") or gi_data.get("PointsDenominator")
                logger.info(
                    "grades fallback final folder=%s user=%s score=%s outOf=%s",
                    folder_id, user_id, final_score, final_out_of,
                )
            except Exception as e:
                logger.warning("grades fallback failed folder=%s user=%s: %s", folder_id, user_id, e)

    # Learning outcomes (RAs) aligned to this assignment's rubric(s), if any.
    # The rubric→outcome link comes from the bulk /lo/alignments/ endpoint
    # (CriteriaOutcome does not carry OutcomeId on this tenant). We resolve
    # each rubric's OutcomeId GUIDs to their real code/label via the outcome
    # sets index. Both indexes are cached in GemeloService (TTL 10 min).
    outcomes_out: list[dict] = []
    try:
        from app.services.gemelo_service import GemeloService
        _svc = GemeloService(bs)
        align_index, outcome_index = await asyncio.gather(
            _svc._get_alignment_index(org_unit_id),
            _svc._get_outcome_index(org_unit_id),
        )
        seen_oids: set[str] = set()
        rubric_ids = {str(r.get("rubricId")) for r in rubrics_out if r.get("rubricId") is not None}
        for ref in rubric_refs:
            rid = ref.get("RubricId") if isinstance(ref, dict) else None
            if rid is not None:
                rubric_ids.add(str(rid))
        for rid in rubric_ids:
            oids = align_index.get(rid) or []
            resolved = []
            for oid in oids:
                info = (outcome_index or {}).get(oid) or {}
                item = {
                    "outcomeId": oid,
                    "code": info.get("code"),
                    "label": info.get("title") or info.get("description"),
                }
                resolved.append(item)
                if oid not in seen_oids:
                    seen_oids.add(oid)
                    outcomes_out.append(item)
            # Attach per-rubric outcomes so the UI can show them inline.
            for r in rubrics_out:
                if str(r.get("rubricId")) == rid:
                    r["outcomes"] = resolved
    except Exception as e:
        logger.warning("feedback outcomes resolve failed folder=%s: %s", folder_id, e)

    return {
        "folderId":               folder_id,
        "folderName":             folder_name,
        "userId":                 user_id,
        "score":                  final_score,
        "outOf":                  final_out_of,
        "isGraded":               fb_data.get("IsGraded"),
        "feedbackText":           feedback_text,
        "files":                  fb_data.get("Files") or [],
        "rubrics":                rubrics_out,
        "outcomes":               outcomes_out,
        "assignmentInstructions": assignment_instructions,
        "submissionComment":      submission_comment,
        "submittedAt":            submitted_at,
        "raw":                    fb_data,
    }
