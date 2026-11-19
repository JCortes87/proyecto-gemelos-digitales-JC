# app/services/rubric_builder.py
"""BETA — Generador de rúbricas por RA (Resultados de Aprendizaje).

Dos partes:

1. Funciones PURAS (sin red, testeables): extraer los RA de los outcome sets
   del curso, validar la solicitud y construir el `RubricInput` exacto que se
   envía a Brightspace (`POST /d2l/api/le/(v)/(ou)/rubrics/`, LE 1.97+).
2. `create_rubric_with_alignments`: crea la rúbrica (scope
   `rubrics:objects:write`) y alinea cada criterio a su RA
   (`POST /lo/alignments/activity/RubricCriterion/{rubricId}_R_{criterionId}`,
   scope `outcomes:alignments:manage`). Nunca borra la rúbrica si alguna
   alineación falla: devuelve éxito parcial con el detalle por criterio.

La asociación rúbrica → tarea solo existe desde LE 1.100 (el tenant aún no la
soporta), así que NO se implementa: el usuario la vincula desde Brightspace.
"""
from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

from app.services.auto_lo_config import _norm_desc, _parse_description

logger = logging.getLogger(__name__)

# ── Constantes del API de rúbricas (RubricInput) ─────────────────────────────
RUBRIC_TYPE_ANALYTIC = 1
RUBRIC_STATE_PUBLISHED = 0
RUBRIC_STATE_DRAFT = 2
SCORING_POINTS = 1
VISIBILITY_ALWAYS = 0

MIN_OUTCOMES, MAX_OUTCOMES = 1, 30
MIN_LEVELS, MAX_LEVELS = 2, 6
MAX_NAME_LEN = 256
MAX_LEVEL_NAME_LEN = 128
MAX_CELL_LEN = 2000
MAX_CRITERION_NAME_LEN = 120
MAX_TITLE_IN_NAME = 80

DEFAULT_LEVELS: List[Dict[str, Any]] = [
    {"name": "Insuficiente", "points": 1},
    {"name": "En desarrollo", "points": 2},
    {"name": "Logrado", "points": 3},
    {"name": "Destacado", "points": 4},
]

GROUP_NAME = "Resultados de aprendizaje"
RUBRIC_DESCRIPTION = (
    "Rúbrica generada por Gemelo Digital (BETA) a partir de los resultados "
    "de aprendizaje del curso. Cada criterio está alineado a su RA."
)

MISSING_SCOPE_MESSAGE = (
    "Brightspace rechazó la creación de la rúbrica (403). Lo más probable es que "
    "la aplicación OAuth no tenga el scope 'rubrics:objects:write'. Un "
    "administrador debe agregarlo en Brightspace (Herramientas de administración "
    "→ Manage Extensibility → OAuth 2.0 → la app de Gemelo Digital) y también en "
    "la variable BRIGHTSPACE_SCOPE del backend; después hay que cerrar sesión y "
    "volver a entrar. También puede faltar el permiso para crear rúbricas en "
    "este curso."
)

NEXT_STEP_MESSAGE = (
    "La rúbrica quedó creada en el curso. Para usarla en una tarea, ábrela en "
    "Brightspace (Actividades → Tareas → editar la tarea → Evaluación y "
    "retroalimentación → Agregar rúbrica) y selecciónala. Si la creaste como "
    "borrador, revísala y publícala desde la herramienta Rúbricas antes de "
    "asociarla."
)


# Verificado en cesa.brightspace.com (LE 1.99, 2026-10): la API de alineación
# por criterio (RubricCriterion) responde 404 "Activity object not found",
# aunque desde el editor de rúbricas sí se pueden alinear. Mientras se
# resuelve, se indica el paso manual exacto por cada criterio no alineado.
MANUAL_ALIGN_MESSAGE = (
    "Brightspace no permitió vincular automáticamente {n} criterio(s) a su RA. "
    "Hazlo en el editor de la rúbrica: Rúbricas → abrir la rúbrica → en cada "
    "criterio, enlace \"Resultados\" → agregar el RA indicado ({codes})."
)


class RubricValidationError(ValueError):
    """Solicitud inválida (se traduce a HTTP 400 con mensaje en español)."""


class RubricCreateError(Exception):
    """Fallo al crear la rúbrica en Brightspace (antes de alinear)."""

    def __init__(self, reason: str, message: str, status: Optional[int] = None,
                 detail: Any = None):
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.status = status
        self.detail = detail


# ── RA del curso ─────────────────────────────────────────────────────────────
def _rich_to_text(v: Any) -> str:
    """Description de un outcome puede venir como string o RichText {Text,Html}."""
    if isinstance(v, dict):
        v = v.get("Text") or v.get("Content") or v.get("Html") or ""
    return _norm_desc(v)


def extract_course_outcomes(raw_sets: Any) -> List[Dict[str, Any]]:
    """Aplana los outcome sets del curso a [{id, code, title, description, setName}].

    El id es el GUID que acepta el API de alineaciones (SourceId/OutcomeId).
    Se recorren los hijos (Children/Outcomes…) y se ignoran duplicados.
    """
    out: List[Dict[str, Any]] = []
    seen: set = set()

    if isinstance(raw_sets, dict):
        items = (raw_sets.get("Items") or raw_sets.get("Objects")
                 or raw_sets.get("outcomeSets") or raw_sets.get("OutcomeSets") or [])
    elif isinstance(raw_sets, list):
        items = raw_sets
    else:
        items = []

    def walk(nodes: Any, set_name: str) -> None:
        for n in nodes or []:
            if not isinstance(n, dict):
                continue
            oid = n.get("SourceId") or n.get("OutcomeId") or n.get("Id")
            desc = _rich_to_text(n.get("Description") or n.get("description"))
            if oid and desc and str(oid) not in seen:
                seen.add(str(oid))
                parsed = _parse_description(desc)
                code = (parsed or {}).get("code") or _norm_desc(
                    n.get("ShortCode") or n.get("Notation") or ""
                )
                title = (parsed or {}).get("title") or desc
                out.append({
                    "id": str(oid),
                    "code": code,
                    "title": title,
                    "description": desc,
                    "setName": set_name,
                })
            for k in ("Children", "Outcomes", "SubOutcomes", "ChildOutcomes"):
                if isinstance(n.get(k), list):
                    walk(n[k], set_name)

    for s in items:
        if not isinstance(s, dict):
            continue
        walk(s.get("Outcomes") or s.get("outcomes") or [], _norm_desc(s.get("Name") or ""))

    out.sort(key=lambda o: (_natural_key(o["code"] or o["title"])))
    return out


def _natural_key(s: str) -> List[Any]:
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s or "")]


# ── Textos por defecto ───────────────────────────────────────────────────────
def _shorten(text: str, limit: int) -> str:
    text = _norm_desc(text)
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0] or text[: limit - 1]
    return cut.rstrip(" ,;:.-") + "…"


def criterion_name(outcome: Mapping[str, Any]) -> str:
    """Nombre del criterio: código del RA + título corto."""
    code = _norm_desc(outcome.get("code") or "")
    title = _shorten(outcome.get("title") or outcome.get("description") or "", MAX_TITLE_IN_NAME)
    name = f"{code} – {title}" if code and title else (code or title or "Resultado de aprendizaje")
    return _shorten(name, MAX_CRITERION_NAME_LEN)


def default_cell_description(level_index: int, n_levels: int, ra_text: str) -> str:
    """Descriptor por nivel (plantilla en español) a partir del texto del RA."""
    ra = _norm_desc(ra_text)
    last = n_levels - 1
    if level_index <= 0:
        prefix = "Aún no evidencia el logro de"
    elif level_index >= last:
        prefix = "Demuestra de forma destacada"
    elif level_index == last - 1:
        prefix = "Demuestra de forma satisfactoria"
    else:
        prefix = "Demuestra de forma parcial"
    return f"{prefix}: {ra}"


def _rich(text: str) -> Dict[str, str]:
    return {"Content": text, "Type": "Text"}


# ── Validación ───────────────────────────────────────────────────────────────
def _as_number(v: Any) -> Optional[float]:
    if isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def normalize_levels(levels: Iterable[Any]) -> List[Dict[str, Any]]:
    """Valida y normaliza los niveles: 2–6, nombres únicos, puntos ≥0 no decrecientes."""
    norm: List[Dict[str, Any]] = []
    for i, lv in enumerate(list(levels or [])):
        if hasattr(lv, "model_dump"):
            lv = lv.model_dump()
        if not isinstance(lv, Mapping):
            raise RubricValidationError(f"El nivel {i + 1} no es válido.")
        name = _norm_desc(lv.get("name") or "")
        if not name:
            raise RubricValidationError(f"El nivel {i + 1} no tiene nombre.")
        if len(name) > MAX_LEVEL_NAME_LEN:
            raise RubricValidationError(f"El nombre del nivel {i + 1} es demasiado largo.")
        pts = _as_number(lv.get("points"))
        if pts is None or pts < 0:
            raise RubricValidationError(
                f"El nivel «{name}» debe tener un puntaje numérico mayor o igual a 0."
            )
        norm.append({"name": name, "points": int(pts) if pts.is_integer() else pts})

    if not (MIN_LEVELS <= len(norm) <= MAX_LEVELS):
        raise RubricValidationError(
            f"La rúbrica debe tener entre {MIN_LEVELS} y {MAX_LEVELS} niveles de desempeño."
        )
    lowered = [lv["name"].casefold() for lv in norm]
    if len(set(lowered)) != len(lowered):
        raise RubricValidationError("Los nombres de los niveles deben ser únicos.")
    for a, b in zip(norm, norm[1:]):
        if b["points"] < a["points"]:
            raise RubricValidationError(
                "Los puntajes de los niveles no pueden disminuir: ordénalos del "
                "menor al mayor desempeño."
            )
    return norm


def normalize_outcome_ids(outcome_ids: Iterable[Any]) -> List[str]:
    """Quita vacíos y duplicados (conserva el orden). Exige 1–30 RA."""
    ids: List[str] = []
    for o in outcome_ids or []:
        s = str(o or "").strip()
        if s and s not in ids:
            ids.append(s)
    if not (MIN_OUTCOMES <= len(ids) <= MAX_OUTCOMES):
        raise RubricValidationError(
            f"Selecciona entre {MIN_OUTCOMES} y {MAX_OUTCOMES} resultados de aprendizaje."
        )
    return ids


def normalize_name(name: Any) -> str:
    n = _norm_desc(name or "")
    if not n:
        raise RubricValidationError("La rúbrica necesita un nombre.")
    if len(n) > MAX_NAME_LEN:
        raise RubricValidationError(f"El nombre no puede superar {MAX_NAME_LEN} caracteres.")
    return n


def normalize_cell_overrides(
    cells: Optional[Iterable[Any]], outcome_ids: List[str], n_levels: int
) -> Dict[Tuple[str, int], str]:
    """[{outcomeId, levelIndex, description}] → {(outcomeId, levelIndex): texto}.

    Se ignoran los RA no seleccionados (p. ej. ediciones de un RA que luego se
    desmarcó); un levelIndex fuera de rango o un texto vacío/demasiado largo es
    un error explícito.
    """
    out: Dict[Tuple[str, int], str] = {}
    selected = set(outcome_ids)
    for c in cells or []:
        if hasattr(c, "model_dump"):
            c = c.model_dump()
        if not isinstance(c, Mapping):
            raise RubricValidationError("Una descripción editada no es válida.")
        oid = str(c.get("outcomeId") or "").strip()
        if oid not in selected:
            continue
        idx = c.get("levelIndex")
        if isinstance(idx, bool) or not isinstance(idx, int) or not (0 <= idx < n_levels):
            raise RubricValidationError("Una descripción editada apunta a un nivel inexistente.")
        text = str(c.get("description") or "").strip()
        if not text:
            raise RubricValidationError("Las descripciones de las celdas no pueden quedar vacías.")
        if len(text) > MAX_CELL_LEN:
            raise RubricValidationError(
                f"Una descripción supera el máximo de {MAX_CELL_LEN} caracteres."
            )
        out[(oid, idx)] = text
    return out


# ── Builder puro ─────────────────────────────────────────────────────────────
def build_rubric_input(
    name: str,
    outcomes: List[Mapping[str, Any]],
    levels: List[Mapping[str, Any]],
    publish: bool = False,
    cell_overrides: Optional[Mapping[Tuple[str, int], str]] = None,
) -> Dict[str, Any]:
    """Construye el RubricInput (todos los campos requeridos, sin IDs).

    - Analítica, puntuación por puntos, un grupo de criterios.
    - Un criterio por RA (en el orden recibido), una celda por nivel.
    - Borrador (RubricStateId 2) salvo que `publish` sea True (0 = Publicada).
    - Niveles globales (OverallLevels) con el mismo nombre; RangeStart =
      puntos del nivel × nº de criterios (el primero arranca en 0).
    `outcomes` y `levels` deben venir ya validados/normalizados.
    """
    overrides = cell_overrides or {}
    n_levels = len(levels)
    n_crit = len(outcomes)

    criteria = []
    for o in outcomes:
        oid = str(o.get("id"))
        ra_text = o.get("description") or o.get("title") or ""
        cells = []
        for i in range(n_levels):
            text = overrides.get((oid, i)) or default_cell_description(i, n_levels, ra_text)
            cells.append({"Feedback": None, "Description": _rich(text), "Points": None})
        criteria.append({"Name": criterion_name(o), "Cells": cells})

    overall = []
    for i, lv in enumerate(levels):
        start = 0 if i == 0 else lv["points"] * n_crit
        overall.append({
            "Name": lv["name"],
            "RangeStart": start,
            "Description": None,
            "Feedback": None,
        })

    return {
        "Name": name,
        "Description": _rich(RUBRIC_DESCRIPTION),
        "RubricType": RUBRIC_TYPE_ANALYTIC,
        "RubricStateId": RUBRIC_STATE_PUBLISHED if publish else RUBRIC_STATE_DRAFT,
        "ScoringMethod": SCORING_POINTS,
        "Visibility": VISIBILITY_ALWAYS,
        "IsScoreVisibleToAssessedUsers": True,
        "ReverseLevelDisplayOrder": False,
        "CriteriaGroups": [{
            "Name": GROUP_NAME,
            "Levels": [{"Name": lv["name"], "Points": lv["points"]} for lv in levels],
            "Criteria": criteria,
        }],
        "OverallLevels": overall,
    }


def build_warnings(levels: List[Mapping[str, Any]]) -> List[str]:
    warns: List[str] = []
    pts = [lv["points"] for lv in levels]
    if len(set(pts)) != len(pts):
        warns.append(
            "Hay niveles con el mismo puntaje: Brightspace podría rechazar los "
            "rangos de los niveles globales."
        )
    return warns


def prepare_rubric(
    *,
    name: Any,
    outcome_ids: Iterable[Any],
    levels: Iterable[Any],
    publish: bool,
    cells: Optional[Iterable[Any]],
    course_outcomes: List[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Valida la solicitud contra los RA del curso y arma el preview completo.

    Devuelve {rubricInput, mapping:[{criterionIndex, criterionName, outcomeId,
    code, title}], levels, state, warnings}.
    """
    nm = normalize_name(name)
    ids = normalize_outcome_ids(outcome_ids)
    lvls = normalize_levels(levels)
    by_id = {str(o["id"]): o for o in course_outcomes}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise RubricValidationError(
            "Estos RA no pertenecen al curso: " + ", ".join(missing[:5])
            + ("…" if len(missing) > 5 else "")
        )
    selected = [by_id[i] for i in ids]
    overrides = normalize_cell_overrides(cells, ids, len(lvls))
    rubric_input = build_rubric_input(nm, selected, lvls, publish=publish,
                                      cell_overrides=overrides)
    crits = rubric_input["CriteriaGroups"][0]["Criteria"]
    mapping = [
        {
            "criterionIndex": i,
            "criterionName": crits[i]["Name"],
            "outcomeId": o["id"],
            "code": o.get("code") or "",
            "title": o.get("title") or "",
        }
        for i, o in enumerate(selected)
    ]
    return {
        "rubricInput": rubric_input,
        "mapping": mapping,
        "levels": lvls,
        "state": "published" if publish else "draft",
        "warnings": build_warnings(lvls),
    }


# ── Lectura defensiva de la respuesta de Brightspace ─────────────────────────
def extract_rubric_id(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    rid = data.get("RubricId") or data.get("Id") or data.get("RubricID")
    return str(rid) if rid not in (None, "") else None


def extract_criterion_ids(data: Any, expected_names: List[str]) -> List[Optional[str]]:
    """Ids de criterio en el mismo orden que `expected_names`.

    Primero por nombre (robusto si Brightspace reordena); si no casa, por
    posición. Devuelve None donde no se encuentra el id.
    """
    found: List[Tuple[str, Optional[str]]] = []
    if isinstance(data, dict):
        for g in data.get("CriteriaGroups") or []:
            if not isinstance(g, dict):
                continue
            for c in g.get("Criteria") or []:
                if not isinstance(c, dict):
                    continue
                cid = c.get("Id") or c.get("CriterionId")
                found.append((_norm_desc(c.get("Name") or ""),
                              str(cid) if cid not in (None, "") else None))
    result: List[Optional[str]] = []
    used: set = set()
    for i, nm in enumerate(expected_names):
        cid = None
        for j, (fname, fid) in enumerate(found):
            if j not in used and fid and fname == _norm_desc(nm):
                cid = fid
                used.add(j)
                break
        if cid is None and i < len(found) and i not in used and found[i][1]:
            cid = found[i][1]
            used.add(i)
        result.append(cid)
    return result


def _bs_error_text(res: Mapping[str, Any]) -> str:
    j = res.get("json")
    if isinstance(j, dict):
        for k in ("Detail", "detail", "Message", "message", "Title"):
            if j.get(k):
                return str(j[k])[:300]
    return str(res.get("text") or res.get("error") or "")[:300]


def rubrics_tool_url(base_url: str, org_unit_id: int) -> str:
    """URL (best-effort) de la herramienta Rúbricas del curso en Brightspace."""
    return f"{base_url.rstrip('/')}/d2l/lp/rubrics/list.d2l?ou={org_unit_id}"


# ── Creación + alineación ────────────────────────────────────────────────────
async def create_rubric_with_alignments(
    bs: Any,
    org_unit_id: int,
    prepared: Mapping[str, Any],
    *,
    le_version: str,
) -> Dict[str, Any]:
    """Crea la rúbrica y alinea cada criterio a su RA.

    `bs` debe exponer `base_url`, `align_version` y `_raw_request` (no lanza:
    devuelve {status, ok, json, text}). Lanza RubricCreateError si la creación
    falla; las fallas de alineación se reportan por criterio (éxito parcial).
    """
    base = str(bs.base_url).rstrip("/")
    rubric_input = prepared["rubricInput"]
    mapping = prepared["mapping"]
    create_url = f"{base}/d2l/api/le/{le_version}/{org_unit_id}/rubrics/"

    res = await bs._raw_request("POST", create_url, json_body=rubric_input)
    status = res.get("status")
    if not res.get("ok"):
        text = _bs_error_text(res)
        if status == 403:
            raise RubricCreateError("missing_scope", MISSING_SCOPE_MESSAGE, 403, text)
        if status in (401,):
            raise RubricCreateError(
                "unauthorized", "La sesión de Brightspace expiró. Vuelve a iniciar sesión.",
                401, text)
        if status == 404:
            raise RubricCreateError(
                "not_supported",
                f"Brightspace no expone el API de rúbricas en la versión LE {le_version} "
                "(requiere 1.97 o superior) o el curso no existe.",
                404, text)
        if status == 400:
            raise RubricCreateError(
                "invalid_request",
                "Brightspace rechazó la rúbrica por datos inválidos: " + (text or "sin detalle"),
                400, text)
        raise RubricCreateError(
            "brightspace_error",
            f"Brightspace respondió con un error ({status or 'sin respuesta'}) al crear la rúbrica.",
            status, text)

    created = res.get("json")
    rubric_id = extract_rubric_id(created)
    if not rubric_id:
        raise RubricCreateError(
            "unexpected_response",
            "Brightspace respondió sin el id de la rúbrica; revisa en la herramienta "
            "Rúbricas del curso si se creó antes de reintentar.",
            status, _bs_error_text(res))

    names = [m["criterionName"] for m in mapping]
    crit_ids = extract_criterion_ids(created, names)
    fetched_detail = False
    if any(c is None for c in crit_ids):
        # La respuesta de creación no trajo los ids: leer la rúbrica creada.
        detail = await bs._raw_request(
            "GET", f"{base}/d2l/api/le/{le_version}/{org_unit_id}/rubrics/{rubric_id}"
        )
        fetched_detail = True
        if detail.get("ok"):
            again = extract_criterion_ids(detail.get("json"), names)
            crit_ids = [a or b for a, b in zip(crit_ids, again)]
        else:
            logger.warning("rubric detail %s/%s fallo: %s", org_unit_id, rubric_id,
                           detail.get("status"))

    align_version = getattr(bs, "align_version", None) or le_version
    criteria_out: List[Dict[str, Any]] = []
    for m, cid in zip(mapping, crit_ids):
        item: Dict[str, Any] = {
            "criterionId": cid,
            "criterionName": m["criterionName"],
            "outcomeId": m["outcomeId"],
            "code": m.get("code") or "",
            "aligned": False,
        }
        if not cid:
            item["error"] = "No se obtuvo el id del criterio desde Brightspace."
            criteria_out.append(item)
            continue
        url = (
            f"{base}/d2l/api/le/{align_version}/{org_unit_id}"
            f"/lo/alignments/activity/RubricCriterion/{rubric_id}_R_{cid}"
        )
        ar = await bs._raw_request(
            "POST", url, json_body={"Action": "add", "OutcomeIds": [m["outcomeId"]]}
        )
        if ar.get("ok"):
            item["aligned"] = True
        else:
            st = ar.get("status")
            if st == 403:
                item["error"] = (
                    "403: la rúbrica está bloqueada o falta el scope "
                    "outcomes:alignments:manage."
                )
            else:
                item["error"] = f"Error {st or 'de red'} al alinear: {_bs_error_text(ar)}".strip()
        criteria_out.append(item)

    aligned = sum(1 for c in criteria_out if c["aligned"])
    return {
        "rubricId": rubric_id,
        "name": rubric_input["Name"],
        "state": prepared.get("state") or "draft",
        "criteria": criteria_out,
        "alignedCount": aligned,
        "totalCriteria": len(criteria_out),
        "partial": aligned < len(criteria_out),
        "fetchedDetail": fetched_detail,
        "brightspaceUrl": rubrics_tool_url(base, org_unit_id),
        "brightspaceUrlBestEffort": True,
        "nextStep": NEXT_STEP_MESSAGE,
        "manualAlignment": (
            MANUAL_ALIGN_MESSAGE.format(
                n=sum(1 for c in criteria_out if not c.get("aligned")),
                codes=", ".join(str(c.get("code") or c.get("outcomeId")) for c in criteria_out if not c.get("aligned")),
            )
            if any(not c.get("aligned") for c in criteria_out) else None
        ),
    }
