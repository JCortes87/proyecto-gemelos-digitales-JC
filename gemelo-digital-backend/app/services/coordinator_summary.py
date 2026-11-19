"""Resumen de actividad docente por curso para la vista de coordinador.

La vista de coordinador supervisa PROFESORES: reporte de notas por corte,
cantidad de contenido publicado, actividades creadas, entregas pendientes de
calificar y (secundario) estudiantes en riesgo.

Diseño:
  - Toda la lectura de datos pasa por un "source" (``BrightspaceSummarySource``
    en producción; un fake en los tests) para que la agregación sea pura y
    testeable sin red.
  - Cada sección es independiente y tolerante a fallos: si una falla, esa
    sección devuelve ``{"error": "<mensaje>"}`` y el resto del resumen sigue.
  - Las lecturas compartidas entre secciones (classlist, carpetas de dropbox)
    se hacen UNA vez por resumen (``_Shared``).
  - Caché en memoria de 10 minutos por orgUnitId (solo resúmenes sin errores,
    para no fijar un fallo transitorio ni la falta de permisos de un usuario).
"""
from __future__ import annotations

import asyncio
import copy
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Tuple

from app.services.common_utils import _parse_iso_dt
from app.services.gemelo.due_dates import _due_date_for_grade_item, _fill_dropbox_due_dates
from app.services.role_utils import (
    _display_name,
    _extract_role_name,
    _extract_user_id,
    _is_student_role,
)
from app.services.text_utils import _extract_corte_period, _is_corte_item, _strip_html

logger = logging.getLogger("uvicorn.error")

#|---------- Parámetros ----------|
SUMMARY_TTL_S = 600.0            # caché de 10 minutos por curso
SUMMARY_CACHE_MAX = 500
CORTE_PUBLISHED_PCT = 90.0       # ≥ 90% de estudiantes con nota → publicado
CORTE_PERIODS = (1, 2, 3)
VALUES_CONCURRENCY = 4           # lecturas de valores por ítem en paralelo
SECTION_TIMEOUT_S = 90.0
BATCH_MAX = 60
BATCH_CONCURRENCY = 4
OVERVIEW_FRESH_MINUTES = 60      # overview desde Postgres si es más reciente

_INSTRUCTOR_KEYWORDS = ("instructor", "profesor", "docente", "teacher", "facilitador")
_LAST_ACCESS_KEYS = ("LastAccessed", "LastAccessDate", "LastAccess", "LastCourseAccess")

# ActivityType (ACTIVITYTYPE_T de Brightspace) de los topics del TOC
_ACT_FILE = 1
_ACT_LINK = 2
_ACT_LTI = 7


#|---------- Normalización de respuestas ----------|
def _rows(data: Any) -> List[Dict[str, Any]]:
    """Lista de dicts desde una respuesta de Brightspace (lista directa o
    envuelta en Items/items/Objects/objects)."""
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("Items", "items", "Objects", "objects"):
            v = data.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


#|---------- Utilidades de fechas ----------|
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Fechas sin zona horaria se interpretan como UTC (así las da Brightspace)."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat().replace("+00:00", "Z") if dt else None


#|---------- Reporte de notas por corte ----------|
def classify_corte_status(pct: Optional[float], due: Optional[datetime], now: datetime) -> str:
    """publicado (≥90%), vencido_sin_reporte (fecha pasada y <90%),
    pendiente (0%) o parcial."""
    p = float(pct or 0.0)
    if p >= CORTE_PUBLISHED_PCT:
        return "publicado"
    due = _aware(due)
    if due is not None and due < _aware(now):
        return "vencido_sin_reporte"
    if p <= 0:
        return "pendiente"
    return "parcial"


def has_grade_value(row: Any) -> bool:
    """True si la fila (UserGradeValue o GradeValue plano) tiene una nota."""
    if not isinstance(row, dict):
        return False
    gv = row.get("GradeValue") if "GradeValue" in row else row
    if not isinstance(gv, dict):
        return False
    for k in ("PointsNumerator", "WeightedNumerator"):
        if gv.get(k) is not None:
            return True
    dg = gv.get("DisplayedGrade")
    return isinstance(dg, str) and dg.strip() not in ("", "-", "--")


def _row_user_id(row: Dict[str, Any]) -> Optional[int]:
    user = row.get("User")
    if isinstance(user, dict):
        uid = _extract_user_id(user)
        if uid is not None:
            return uid
    return _extract_user_id(row)


def student_ids_from_classlist(classlist: Iterable[Dict[str, Any]]) -> set:
    """Ids de los estudiantes del classlist. Si ninguna fila trae rol (tenant
    sin ese campo), se consideran estudiantes todas las filas."""
    rows = [r for r in classlist if isinstance(r, dict)]
    if not any(_extract_role_name(r) for r in rows):
        return {uid for uid in (_extract_user_id(r) for r in rows) if uid is not None}
    out = set()
    for r in rows:
        if _is_student_role(_extract_role_name(r)):
            uid = _extract_user_id(r)
            if uid is not None:
                out.add(uid)
    return out


def pick_corte_items(grade_items: Iterable[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """Un grade item por corte (1..3). Si hay varios para el mismo corte se
    prefiere el primero visible para estudiantes."""
    by_period: Dict[int, Dict[str, Any]] = {}
    for it in grade_items:
        if not isinstance(it, dict) or it.get("Id") is None:
            continue
        name = it.get("Name")
        if not _is_corte_item(name):
            continue
        period = _extract_corte_period(name)
        if period not in CORTE_PERIODS:
            continue
        cur = by_period.get(period)
        if cur is None or (cur.get("IsHidden") is True and it.get("IsHidden") is not True):
            by_period[period] = it
    return by_period


def summarize_corte(
    period: int,
    item: Dict[str, Any],
    value_rows: List[Dict[str, Any]],
    student_ids: set,
    due: Optional[datetime],
    now: datetime,
) -> Dict[str, Any]:
    """Entrada de gradeReporting para un corte (solo cuenta estudiantes)."""
    graded = set()
    for row in value_rows:
        if not isinstance(row, dict):
            continue
        uid = _row_user_id(row)
        if uid is not None and uid in student_ids and has_grade_value(row):
            graded.add(uid)
    total = len(student_ids)
    pct = round(len(graded) * 100.0 / total, 1) if total else 0.0
    return {
        "period": period,
        "itemId": item.get("Id"),
        "name": _strip_html(item.get("Name")) or f"Corte {period}",
        "dueDate": _iso(_aware(due)),
        "isHidden": item.get("IsHidden") is True,
        "studentsTotal": total,
        "studentsWithGrade": len(graded),
        "pct": pct,
        "status": classify_corte_status(pct, due, now),
    }


#|---------- Contenido (TOC) ----------|
def classify_topic(topic: Dict[str, Any]) -> str:
    """file / link / lti / other según los campos del TOC disponibles."""
    type_id = str(topic.get("TypeIdentifier") or "").strip().lower()
    url = str(topic.get("Url") or "").strip().lower()
    try:
        act = int(topic.get("ActivityType")) if topic.get("ActivityType") is not None else None
    except (TypeError, ValueError):
        act = None
    if act == _ACT_LTI or "lti" in type_id or "/lti/" in url:
        return "lti"
    if act == _ACT_FILE or type_id == "file":
        return "file"
    if act == _ACT_LINK:
        return "link"
    if act is not None and act > 0:
        # Quiz, dropbox, foro, encuesta… enlazados desde el contenido
        return "other"
    if type_id == "link" or url.startswith(("http://", "https://")):
        return "link"
    return "other"


def count_content_toc(toc: Any) -> Dict[str, Any]:
    """Cuenta módulos y temas (visibles) del TOC, temas por tipo y la última
    fecha de modificación disponible. Un tema dentro de un módulo oculto se
    cuenta como oculto."""
    modules_raw = toc.get("Modules") if isinstance(toc, dict) else toc
    counts = {"modules": 0, "topics": 0, "hiddenModules": 0, "hiddenTopics": 0}
    by_type = {"file": 0, "link": 0, "lti": 0, "other": 0}
    last: List[Optional[datetime]] = [None]

    def _touch(obj: Dict[str, Any]) -> None:
        for k in ("LastModifiedDate", "LastModified", "ModifiedDate"):
            dt = _aware(_parse_iso_dt(obj.get(k)))
            if dt and (last[0] is None or dt > last[0]):
                last[0] = dt

    def _walk(mods: Any, hidden_parent: bool, depth: int) -> None:
        if depth > 20 or not isinstance(mods, list):
            return
        for m in mods:
            if not isinstance(m, dict):
                continue
            hidden = hidden_parent or m.get("IsHidden") is True
            counts["hiddenModules" if hidden else "modules"] += 1
            _touch(m)
            for t in (m.get("Topics") or []):
                if not isinstance(t, dict):
                    continue
                _touch(t)
                if hidden or t.get("IsHidden") is True:
                    counts["hiddenTopics"] += 1
                    continue
                counts["topics"] += 1
                by_type[classify_topic(t)] += 1
            _walk(m.get("Modules"), hidden, depth + 1)

    _walk(modules_raw, False, 0)
    return {**counts, "topicsByType": by_type, "lastModified": _iso(last[0])}


#|---------- Backlog de calificación ----------|
def grading_backlog_from_status(status: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    """Resume la salida de course_grading_status: entregas sin calificar y
    antigüedad (días) de la más antigua."""
    pending = 0
    folders_with = 0
    oldest: Optional[datetime] = None
    for f in (status.get("items") or []):
        if not isinstance(f, dict) or not f.get("ok"):
            continue
        pg = [p for p in (f.get("pendingGrading") or []) if isinstance(p, dict)]
        if not pg:
            continue
        folders_with += 1
        pending += len(pg)
        for p in pg:
            dt = _aware(_parse_iso_dt(p.get("submittedAt")))
            if dt and (oldest is None or dt < oldest):
                oldest = dt
    days = None
    if oldest is not None:
        days = max(0, int((_aware(now) - oldest).total_seconds() // 86400))
    return {
        "pending": pending,
        "foldersWithPending": folders_with,
        "oldestPendingDays": days,
        "oldestPendingAt": _iso(oldest),
        "partial": bool(status.get("partial")),
    }


#|---------- Profesores ----------|
def _last_access(*rows: Dict[str, Any]) -> Optional[str]:
    for row in rows:
        if not isinstance(row, dict):
            continue
        for k in _LAST_ACCESS_KEYS:
            v = row.get(k)
            if v:
                return str(v)
    return None


def teachers_from(instructors: List[Dict[str, Any]], classlist: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Profesores del curso enriquecidos con email y último acceso del
    classlist. Si el listado de instructores viene vacío se usan las filas del
    classlist con rol docente."""
    by_id: Dict[int, Dict[str, Any]] = {}
    for row in classlist:
        uid = _extract_user_id(row)
        if uid is not None:
            by_id[uid] = row
    source = [i for i in instructors if isinstance(i, dict)]
    if not source:
        source = [
            r for r in classlist
            if any(k in _extract_role_name(r).lower() for k in _INSTRUCTOR_KEYWORDS)
            and not _is_student_role(_extract_role_name(r))
        ]
    out: List[Dict[str, Any]] = []
    seen = set()
    for ins in source:
        uid = _extract_user_id(ins)
        if uid is not None and uid in seen:
            continue
        seen.add(uid)
        row = by_id.get(uid, {}) if uid is not None else {}
        out.append({
            "userId": uid,
            "name": ins.get("DisplayName") or _display_name(row) or _display_name(ins),
            "email": row.get("Email") or ins.get("Email") or None,
            "roleName": ins.get("RoleName") or _extract_role_name(ins) or _extract_role_name(row),
            "lastAccess": _last_access(row, ins),
        })
    out.sort(key=lambda t: str(t.get("name") or "").lower())
    return out


#|---------- Riesgo (overview existente) ----------|
_AT_RISK_LEVELS = {"alto", "medio"}


def risk_from_overview(ov: Dict[str, Any]) -> Dict[str, Any]:
    gb = ov.get("courseGradebook") or {}
    dist = dict(ov.get("globalRiskDistribution") or {})
    students = int(ov.get("studentsCount") or 0)
    pending = int(dist.get("pending") or 0)
    # Sin ningún estudiante con nota, el overview reporta promedio/cobertura 0:
    # eso no es una nota real y hundía el promedio ponderado del coordinador.
    has_grades = students > pending
    at_risk = []
    for s in (ov.get("studentsAtRisk") or []):
        if not isinstance(s, dict):
            continue
        # Solo riesgo real (con nota): los "pending" no tienen calificaciones aún.
        if str(s.get("risk") or "").lower() not in _AT_RISK_LEVELS:
            continue
        if s.get("currentPerformancePct") is None:
            continue
        at_risk.append({
            "userId": s.get("userId"),
            "displayName": s.get("displayName") or str(s.get("userId")),
            "risk": s.get("risk"),
            "currentPerformancePct": s.get("currentPerformancePct"),
        })
    return {
        "studentsCount": students,
        "studentsWithoutGrades": pending,
        "avgCurrentPerformancePct": gb.get("avgCurrentPerformancePct") if has_grades else None,
        "avgCoveragePct": gb.get("avgCoveragePct") if has_grades else None,
        "riskDistribution": dist,
        "studentsAtRisk": at_risk,
        "source": ov.get("source"),
        "lastSyncAt": ov.get("lastSyncAt"),
    }


#|---------- Mensajes de error por sección ----------|
_SECTION_ERRORS = {
    "teachers": "No se pudo obtener la lista de profesores",
    "gradeReporting": "No se pudo leer el libro de calificaciones",
    "content": "No se pudo leer el contenido del curso",
    "activities": "No se pudieron contar las actividades",
    "gradingBacklog": "No se pudo leer el estado de calificación de las tareas",
    "risk": "No se pudo calcular el riesgo de los estudiantes",
}
_STATUS_RE = re.compile(r"error (\d{3})", re.IGNORECASE)


def _http_status_of(exc: BaseException) -> Optional[int]:
    for attr in ("status", "status_code"):
        v = getattr(exc, attr, None)
        if isinstance(v, int):
            return v
    m = _STATUS_RE.search(str(exc))
    return int(m.group(1)) if m else None


def section_error(section: str, exc: BaseException) -> Dict[str, str]:
    base = _SECTION_ERRORS.get(section, "No se pudo calcular esta sección")
    if isinstance(exc, asyncio.TimeoutError):
        return {"error": f"{base} (tiempo de espera agotado)"}
    st = _http_status_of(exc)
    if st in (401, 403):
        return {"error": f"{base}: sin permisos en Brightspace (HTTP {st})"}
    if st:
        return {"error": f"{base} (HTTP {st})"}
    return {"error": base}


#|---------- Lecturas compartidas entre secciones ----------|
class _Shared:
    """Ejecuta cada lectura compartida una sola vez por resumen."""

    def __init__(self) -> None:
        self._tasks: Dict[str, "asyncio.Future[Any]"] = {}

    def get(self, key: str, factory: Callable[[], Awaitable[Any]]) -> "asyncio.Future[Any]":
        t = self._tasks.get(key)
        if t is None:
            t = asyncio.ensure_future(factory())
            self._tasks[key] = t
        return t

    def cancel_pending(self) -> None:
        for t in self._tasks.values():
            if not t.done():
                t.cancel()
            elif not t.cancelled():
                t.exception()  # marca la excepción como recuperada


#|---------- Secciones ----------|
async def _sec_teachers(src, ou: int, shared: _Shared, now: datetime):
    instructors_t = shared.get("instructors", lambda: src.instructors(ou))
    classlist_t = shared.get("classlist", lambda: src.classlist(ou))
    instructors = await instructors_t
    try:
        classlist = _rows(await classlist_t)
    except Exception:
        classlist = []  # sin classlist: sin email / último acceso
    return teachers_from(_rows(instructors), classlist)


async def _sec_grade_reporting(src, ou: int, shared: _Shared, now: datetime):
    grade_items = _rows(await src.grade_items(ou))
    cortes = pick_corte_items(grade_items)
    result: Dict[str, Any] = {
        "gradeItemsTotal": len(grade_items),
        "usesCortes": bool(cortes),
        "cortes": [],
        "missingCortes": [],
    }
    if not cortes:
        return result

    student_ids = student_ids_from_classlist(
        _rows(await shared.get("classlist", lambda: src.classlist(ou)))
    )
    due_by_folder: Dict[int, Optional[datetime]] = {}
    try:
        _fill_dropbox_due_dates(
            _rows(await shared.get("folders", lambda: src.dropbox_folders(ou))), due_by_folder
        )
    except Exception:
        pass  # sin fechas de dropbox: solo fechas propias del ítem

    sem = asyncio.Semaphore(VALUES_CONCURRENCY)

    async def _values_by_student() -> Dict[int, List[Dict[str, Any]]]:
        """Valores de TODOS los ítems por estudiante (grades/values/{userId}/).
        Respaldo para los cortes de tipo Fórmula: la ruta por ítem
        (grades/{id}/values/) responde 400 con ellos (verificado en cesa)."""
        async def _for(uid: int):
            async with sem:
                try:
                    return uid, _rows(await src.grade_values_for_user(ou, uid)), None
                except Exception as e:  # noqa: BLE001 — un estudiante no tumba el corte
                    logger.warning("coordinator values ou=%s user=%s: %s", ou, uid, e)
                    return uid, [], e
        results = await asyncio.gather(*(_for(uid) for uid in sorted(student_ids)))
        errors = [e for _, _, e in results if e is not None]
        if results and len(errors) == len(results):
            # Ningún estudiante se pudo leer: reportar error, no "pendiente".
            raise errors[0]
        return {uid: values for uid, values, _ in results}

    def _rows_for_item(by_student: Dict[int, List[Dict[str, Any]]], item_id: int) -> List[Dict[str, Any]]:
        out = []
        for uid, values in by_student.items():
            for gv in values:
                try:
                    gid = int(gv.get("GradeObjectIdentifier"))
                except (TypeError, ValueError):
                    continue
                if gid == item_id:
                    out.append({"User": {"Identifier": uid}, "GradeValue": gv})
        return out

    async def _one(period: int, item: Dict[str, Any]):
        due = _due_date_for_grade_item(item, due_by_folder)
        try:
            try:
                async with sem:
                    rows = await src.grade_values_for_item(ou, int(item["Id"]))
            except Exception as item_err:  # noqa: BLE001
                # Ítems de fórmula / calculados: la ruta por ítem no los admite.
                logger.info(
                    "coordinator corte ou=%s item=%s: ruta por ítem falló (%s); se usan valores por estudiante",
                    ou, item.get("Id"), item_err,
                )
                by_student = await shared.get("values_by_student", _values_by_student)
                rows = _rows_for_item(by_student, int(item["Id"]))
        except Exception as e:  # noqa: BLE001 — aislar el corte que falla
            logger.warning("coordinator gradeReporting ou=%s item=%s: %s", ou, item.get("Id"), e)
            return {
                "period": period,
                "itemId": item.get("Id"),
                "name": _strip_html(item.get("Name")) or f"Corte {period}",
                "dueDate": _iso(_aware(due)),
                "status": "error",
                **section_error("gradeReporting", e),
            }
        return summarize_corte(period, item, _rows(rows), student_ids, due, now)

    result["cortes"] = list(await asyncio.gather(
        *(_one(p, it) for p, it in sorted(cortes.items()))
    ))
    result["missingCortes"] = [p for p in CORTE_PERIODS if p not in cortes]
    return result


async def _sec_content(src, ou: int, shared: _Shared, now: datetime):
    return count_content_toc(await src.content_toc(ou))


async def _sec_activities(src, ou: int, shared: _Shared, now: datetime):
    out: Dict[str, Any] = {"assignments": None, "quizzes": None, "discussions": None, "notes": []}
    try:
        folders = await shared.get("folders", lambda: src.dropbox_folders(ou))
        items = _rows(folders)
        out["assignments"] = sum(1 for f in items if f.get("IsHidden") is not True)
    except Exception as e:  # noqa: BLE001
        out["notes"].append(section_error("activities", e)["error"] + " (tareas)")
    try:
        out["quizzes"] = len(_rows(await src.quizzes(ou)))
    except Exception as e:  # noqa: BLE001
        out["notes"].append(section_error("activities", e)["error"] + " (quizzes)")
    try:
        forums = _rows(await src.discussion_forums(ou))
        out["discussions"] = sum(1 for f in forums if f.get("IsHidden") is not True)
    except Exception as e:  # noqa: BLE001
        out["notes"].append(section_error("activities", e)["error"] + " (foros)")
    if out["discussions"] is not None:
        out["notes"].append("Foros: se cuentan foros, no temas de discusión.")
    if all(out[k] is None for k in ("assignments", "quizzes", "discussions")):
        raise RuntimeError("; ".join(out["notes"]) or "sin datos")
    return out


async def _sec_grading_backlog(src, ou: int, shared: _Shared, now: datetime):
    return grading_backlog_from_status(await src.grading_status(ou) or {}, now)


async def _sec_risk(src, ou: int, shared: _Shared, now: datetime):
    return risk_from_overview(await src.overview(ou) or {})


SECTIONS: Tuple[Tuple[str, Callable[..., Awaitable[Any]]], ...] = (
    ("teachers", _sec_teachers),
    ("gradeReporting", _sec_grade_reporting),
    ("content", _sec_content),
    ("activities", _sec_activities),
    ("gradingBacklog", _sec_grading_backlog),
    ("risk", _sec_risk),
)


async def build_course_summary(
    src,
    ou: int,
    *,
    now: Optional[datetime] = None,
    section_timeout: float = SECTION_TIMEOUT_S,
) -> Dict[str, Any]:
    """Resumen completo de un curso. Nunca lanza por el fallo de una sección."""
    now = _aware(now) or _utcnow()
    shared = _Shared()

    async def _safe(name: str, fn):
        try:
            return await asyncio.wait_for(fn(src, ou, shared, now), timeout=section_timeout)
        except Exception as e:  # noqa: BLE001 — cada sección aislada
            logger.warning("coordinator summary ou=%s seccion=%s fallo: %s", ou, name, e)
            return section_error(name, e)

    try:
        results = await asyncio.gather(*(_safe(n, fn) for n, fn in SECTIONS))
    finally:
        shared.cancel_pending()
    summary: Dict[str, Any] = {"orgUnitId": ou}
    for (name, _fn), res in zip(SECTIONS, results):
        summary[name] = res
    summary["generatedAt"] = _iso(_utcnow())
    return summary


def summary_has_errors(summary: Dict[str, Any]) -> bool:
    for name, _fn in SECTIONS:
        sec = summary.get(name)
        if isinstance(sec, dict) and "error" in sec:
            return True
    return False


#|---------- Caché por curso ----------|
_SUMMARY_CACHE: Dict[int, Tuple[float, Dict[str, Any]]] = {}


def clear_summary_cache() -> None:
    _SUMMARY_CACHE.clear()


async def get_course_summary(
    src,
    ou: int,
    *,
    refresh: bool = False,
    clock: Callable[[], float] = time.monotonic,
) -> Dict[str, Any]:
    """Resumen con caché de 10 minutos por orgUnitId. Solo se cachean
    resúmenes sin errores de sección. La autorización se valida ANTES de
    llamar a esta función (el contenido no depende del usuario)."""
    now_m = clock()
    key = int(ou)
    hit = _SUMMARY_CACHE.get(key)
    if hit and not refresh and (now_m - hit[0]) < SUMMARY_TTL_S:
        out = copy.deepcopy(hit[1])
        out["fromCache"] = True
        return out

    summary = await build_course_summary(src, key)
    if not summary_has_errors(summary):
        if len(_SUMMARY_CACHE) >= SUMMARY_CACHE_MAX:
            expired = [k for k, v in _SUMMARY_CACHE.items() if (now_m - v[0]) >= SUMMARY_TTL_S]
            for k in expired:
                _SUMMARY_CACHE.pop(k, None)
            if len(_SUMMARY_CACHE) >= SUMMARY_CACHE_MAX:
                _SUMMARY_CACHE.clear()
        _SUMMARY_CACHE[key] = (now_m, copy.deepcopy(summary))
    summary["fromCache"] = False
    return summary


#|---------- Lote ----------|
async def build_summaries_batch(
    ou_ids: Iterable[int],
    *,
    authorize: Callable[[int], Awaitable[bool]],
    summarize: Callable[[int], Awaitable[Dict[str, Any]]],
    concurrency: int = BATCH_CONCURRENCY,
) -> Dict[str, Any]:
    """Resúmenes de varios cursos con concurrencia acotada. Los cursos que el
    usuario no puede ver devuelven {"error": "forbidden"}."""
    uniq = list(dict.fromkeys(int(x) for x in ou_ids))
    sem = asyncio.Semaphore(max(1, concurrency))
    items: Dict[str, Any] = {}

    async def _one(ou: int) -> None:
        async with sem:
            try:
                allowed = bool(await authorize(ou))
            except Exception:  # noqa: BLE001 — fail-closed
                allowed = False
            if not allowed:
                items[str(ou)] = {"error": "forbidden"}
                return
            try:
                items[str(ou)] = await summarize(ou)
            except Exception as e:  # noqa: BLE001
                logger.warning("coordinator batch ou=%s fallo: %s", ou, e)
                items[str(ou)] = {"error": "No se pudo generar el resumen del curso"}

    await asyncio.gather(*(_one(ou) for ou in uniq))
    return {"items": {str(ou): items[str(ou)] for ou in uniq}}


#|---------- Source de producción (Brightspace + Postgres) ----------|
class BrightspaceSummarySource:
    """Lecturas reales. Reutiliza el cliente de Brightspace, los helpers del
    proxy (instructores, estado de calificación) y el overview DB-first."""

    def __init__(self, bs, headers: Dict[str, str], svc) -> None:
        self.bs = bs
        self.headers = headers
        self.svc = svc

    async def instructors(self, ou: int):
        from app.services.brightspace.content import list_course_instructors
        res = await list_course_instructors(self.headers, ou)
        return res.get("items") or []

    async def classlist(self, ou: int):
        return await self.bs.list_classlist(ou)

    async def grade_items(self, ou: int):
        return await self.bs.list_grade_items(ou)

    async def grade_values_for_item(self, ou: int, item_id: int):
        return await self.bs.list_grade_values_for_item(ou, item_id)

    async def grade_values_for_user(self, ou: int, user_id: int):
        return await self.bs.list_grade_values_for_user(ou, user_id)

    async def content_toc(self, ou: int):
        return await self.bs.get_content_toc(ou)

    async def dropbox_folders(self, ou: int):
        return await self.bs.list_dropbox_folders(ou)

    async def quizzes(self, ou: int):
        return await self.bs.list_quizzes(ou)

    async def discussion_forums(self, ou: int):
        return await self.bs.list_discussion_forums(ou)

    async def grading_status(self, ou: int):
        from app.services.brightspace.dropbox import course_grading_status
        return await course_grading_status(self.headers, ou)

    async def overview(self, ou: int):
        from app.services.db_freshness import is_fresh
        from app.services.gemelo_db_service import build_course_overview_from_db
        try:
            db = await build_course_overview_from_db(ou)
            if db.get("hasData") and is_fresh(db.get("lastSyncAt"), OVERVIEW_FRESH_MINUTES):
                db["source"] = "db"
                return db
        except Exception as e:  # noqa: BLE001
            logger.warning("coordinator overview ou=%s: lectura DB fallo (%s)", ou, e)
        ov = await self.svc.build_course_overview(ou)
        if isinstance(ov, dict):
            ov.setdefault("source", "brightspace")
        return ov
