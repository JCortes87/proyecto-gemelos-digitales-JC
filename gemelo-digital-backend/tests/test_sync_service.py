"""SyncService con un BrightspaceClient falso y SQLite en memoria (nunca la BD
real): classlist (insert/update/desactivar), grade items, carpetas de
dropbox, outcome sets, snapshots de métricas y ruta de error con tracking."""
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db import models as m
from app.services import sync_service as ss
from app.services import sync_tracking_service as sts

OU = 555


class FakeBS:
    def __init__(self):
        self.classlist = []
        self.grade_items = []
        self.folders = []
        self.outcome_sets = []
        self.fail_classlist = None

    async def list_classlist(self, ou):
        if self.fail_classlist:
            raise self.fail_classlist
        return self.classlist

    async def list_grade_items(self, ou):
        return self.grade_items

    async def list_dropbox_folders(self, ou):
        return self.folders

    async def list_outcome_sets(self, ou):
        return self.outcome_sets


@pytest.fixture
def Session(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    S = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(ss, "SessionLocal", S)
    monkeypatch.setattr(sts, "SessionLocal", S)
    yield S
    engine.dispose()


@pytest.fixture
def bs():
    return FakeBS()


@pytest.fixture
def svc(bs, Session):
    return ss.SyncService(bs)


def _all(S, model, **filtros):
    with S() as db:
        q = select(model)
        for k, v in filtros.items():
            q = q.where(getattr(model, k) == v)
        return db.execute(q).scalars().all()


def _alumno(uid, nombre, email=None, rol="Estudiante"):
    return {"Identifier": str(uid), "DisplayName": nombre, "Email": email,
            "ClasslistRoleDisplayName": rol}


# ──────────────────────────────────────────────────────────────────────────
# Classlist
# ──────────────────────────────────────────────────────────────────────────
async def test_classlist_inserta_solo_estudiantes(svc, bs, Session):
    bs.classlist = [
        _alumno(1, "Ana", "ana@x.co"),
        _alumno(2, "Beto", rol="Student"),
        _alumno(3, "Profe", rol="Instructor"),
        _alumno(4, "Servicio al estudiante", rol="Servicio"),
        {"DisplayName": "Sin id", "ClasslistRoleDisplayName": "Estudiante"},
        {"Identifier": "no-num", "ClasslistRoleDisplayName": "Estudiante"},
    ]
    r = await svc.sync_classlist(OU)
    assert r["inserted_students"] == 2
    assert r["inserted_enrollments"] == 2
    assert r["deactivated_enrollments"] == 0
    assert r["classlist_count"] == 6
    assert sorted(s.brightspace_user_id for s in _all(Session, m.Student)) == [1, 2]
    enr = _all(Session, m.Enrollment, org_unit_id=OU)
    assert {e.brightspace_user_id: e.role_name for e in enr} == {1: "Estudiante", 2: "Student"}
    assert all(e.is_active for e in enr)

    run = _all(Session, m.SyncRun)[0]
    assert (run.sync_type, run.status, run.inserted_count) == ("classlist", "success", 4)
    state = _all(Session, m.SyncState)[0]
    assert state.last_status == "success" and state.last_success_at is not None


async def test_classlist_actualiza_y_desactiva_removidos(svc, bs, Session):
    bs.classlist = [_alumno(1, "Ana"), _alumno(2, "Beto"), _alumno(3, "Caro")]
    await svc.sync_classlist(OU)

    # Ana cambia de nombre, Beto sale del curso, Caro sigue igual.
    bs.classlist = [_alumno(1, "Ana María", "ana@x.co"), _alumno(3, "Caro")]
    r = await svc.sync_classlist(OU)
    assert r["inserted_students"] == 0
    assert r["updated_students"] == 1
    assert r["deactivated_enrollments"] == 1

    ana = _all(Session, m.Student, brightspace_user_id=1)[0]
    assert (ana.display_name, ana.email) == ("Ana María", "ana@x.co")
    activos = {e.brightspace_user_id: e.is_active for e in _all(Session, m.Enrollment)}
    assert activos == {1: True, 2: False, 3: True}

    # Si Beto vuelve, se reactiva (update, no insert).
    bs.classlist = [_alumno(1, "Ana María"), _alumno(2, "Beto"), _alumno(3, "Caro")]
    r = await svc.sync_classlist(OU)
    assert r["inserted_enrollments"] == 0
    assert r["updated_enrollments"] == 1
    assert all(e.is_active for e in _all(Session, m.Enrollment))


async def test_classlist_no_toca_otros_cursos(svc, bs, Session):
    bs.classlist = [_alumno(1, "Ana")]
    await svc.sync_classlist(OU)
    await svc.sync_classlist(OU + 1)
    bs.classlist = []
    r = await svc.sync_classlist(OU)
    assert r["deactivated_enrollments"] == 1
    otro = _all(Session, m.Enrollment, org_unit_id=OU + 1)[0]
    assert otro.is_active is True


async def test_classlist_acepta_dict_items(svc, bs, Session):
    bs.classlist = {"Items": [_alumno(9, "Dani")]}
    r = await svc.sync_classlist(OU)
    assert r["inserted_students"] == 1


async def test_classlist_rol_de_instructor_desactiva_enrollment_viejo(svc, bs, Session):
    bs.classlist = [_alumno(1, "Ana")]
    await svc.sync_classlist(OU)
    # Ahora Ana figura como monitora: ya no es estudiante del curso.
    bs.classlist = [_alumno(1, "Ana", rol="Monitor")]
    r = await svc.sync_classlist(OU)
    assert r["deactivated_enrollments"] == 1


async def test_classlist_error_de_persistencia_registra_y_relanza(svc, bs, Session):
    # Un row que no es dict revienta dentro de _persist (row.get) → rollback.
    bs.classlist = [_alumno(1, "Ana"), "row-corrupto"]
    with pytest.raises(AttributeError):
        await svc.sync_classlist(OU)
    assert _all(Session, m.Student) == []  # rollback: nada persistido
    run = _all(Session, m.SyncRun)[0]
    assert run.status == "failed" and run.error_count == 1
    errs = _all(Session, m.SyncError)
    assert len(errs) == 1
    assert errs[0].sync_run_id == run.id and errs[0].sync_type == "classlist"
    assert _all(Session, m.SyncState)[0].last_status == "failed"


async def test_classlist_error_de_brightspace_queda_registrado(svc, bs, Session):
    bs.fail_classlist = RuntimeError("Brightspace error 503")
    with pytest.raises(RuntimeError):
        await svc.sync_classlist(OU)
    run = _all(Session, m.SyncRun)[0]
    assert run.status == "failed"
    assert len(_all(Session, m.SyncError)) == 1


# ──────────────────────────────────────────────────────────────────────────
# Grade items
# ──────────────────────────────────────────────────────────────────────────
async def test_grade_items_insert_update(svc, bs, Session):
    bs.grade_items = [
        {"Id": 1, "Name": "Taller", "MaxPoints": 10, "Weight": 20, "DueDate": "2026-03-01T00:00:00Z",
         "GradeType": "Numeric", "CategoryId": 7,
         "AssociatedTool": {"ToolId": 2000, "ToolItemId": 44}},
        {"Id": "2", "Name": "Parcial", "MaxPoints": 50, "Weight": 30},
        {"Name": "sin id"},
        {"Id": "x"},
    ]
    r = await svc.sync_grade_items(OU)
    assert (r["count"], r["inserted"], r["updated"]) == (4, 2, 0)
    t = _all(Session, m.GradeItem, brightspace_grade_object_id=1)[0]
    assert (t.name, t.max_points, t.weight, t.grade_type, t.category_id) == ("Taller", 10.0, 20.0, "Numeric", 7)
    assert (t.associated_tool_id, t.associated_tool_item_id) == (2000, 44)
    assert t.due_date == "2026-03-01T00:00:00Z"

    bs.grade_items = [
        {"Id": 1, "Name": "Taller 1", "MaxPoints": 10, "Weight": 25},
        {"Id": 2, "Name": "Parcial", "MaxPoints": 50, "Weight": 30},
    ]
    r = await svc.sync_grade_items(OU)
    assert (r["inserted"], r["updated"]) == (0, 1)
    t = _all(Session, m.GradeItem, brightspace_grade_object_id=1)[0]
    assert (t.name, t.weight) == ("Taller 1", 25.0)
    # Valores ausentes en la respuesta no borran lo que ya había.
    assert t.grade_type == "Numeric" and t.category_id == 7


async def test_grade_items_peso_cero_se_conserva(svc, bs, Session):
    bs.grade_items = [{"Id": 1, "Name": "Formativo", "Weight": 0}]
    await svc.sync_grade_items(OU)
    assert _all(Session, m.GradeItem)[0].weight == 0.0


async def test_grade_items_error_registra_y_relanza(svc, bs, Session):
    bs.grade_items = [{"Id": 1, "Name": "ok"}, {"Id": 2, "MaxPoints": "no-numero"}]
    with pytest.raises(ValueError):
        await svc.sync_grade_items(OU)
    assert _all(Session, m.GradeItem) == []
    assert _all(Session, m.SyncRun)[0].status == "failed"
    assert _all(Session, m.SyncError)[0].sync_type == "grade_items"


# ──────────────────────────────────────────────────────────────────────────
# Dropbox
# ──────────────────────────────────────────────────────────────────────────
async def test_dropbox_folders_fechas_y_update(svc, bs, Session):
    bs.folders = [
        {"Id": 10, "Name": "Entrega 1", "Category": 3, "GradeItemId": 1,
         "Availability": {"StartDate": "2026-01-01T00:00:00Z", "EndDate": "2026-02-01T00:00:00Z"}},
        {"Id": 11, "Name": "Entrega 2", "DueDate": "2026-03-01T00:00:00Z"},
        {"Name": "sin id"},
    ]
    r = await svc.sync_dropbox_folders(OU)
    assert (r["count"], r["inserted"], r["updated"]) == (3, 2, 0)
    f10 = _all(Session, m.DropboxFolder, brightspace_folder_id=10)[0]
    # Sin DueDate propio: cae a Availability.EndDate
    assert f10.due_date == "2026-02-01T00:00:00Z"
    assert f10.start_date == "2026-01-01T00:00:00Z"
    assert (f10.category, f10.grade_item_id) == ("3", 1)

    bs.folders = [{"Id": 11, "Name": "Entrega 2 (v2)", "DueDate": "2026-03-05T00:00:00Z"}]
    r = await svc.sync_dropbox_folders(OU)
    assert (r["inserted"], r["updated"]) == (0, 1)
    f11 = _all(Session, m.DropboxFolder, brightspace_folder_id=11)[0]
    assert (f11.name, f11.due_date) == ("Entrega 2 (v2)", "2026-03-05T00:00:00Z")


async def test_dropbox_sin_cambios_no_cuenta_update(svc, bs, Session):
    bs.folders = [{"Id": 10, "Name": "Entrega"}]
    await svc.sync_dropbox_folders(OU)
    r = await svc.sync_dropbox_folders(OU)
    assert (r["inserted"], r["updated"]) == (0, 0)


# ──────────────────────────────────────────────────────────────────────────
# Outcome sets
# ──────────────────────────────────────────────────────────────────────────
async def test_outcome_sets_dict_o_lista(svc, bs, Session):
    bs.outcome_sets = {"Items": [{"Id": 1, "Name": "RA", "Description": "d1"}, {"Id": None}]}
    r = await svc.sync_outcome_sets(OU)
    assert (r["count"], r["inserted"]) == (2, 1)

    bs.outcome_sets = [{"Id": 1, "Name": "RA programa", "Description": "d2"}]
    r = await svc.sync_outcome_sets(OU)
    assert (r["inserted"], r["updated"]) == (0, 1)
    o = _all(Session, m.OutcomeSet)[0]
    assert (o.name, o.description) == ("RA programa", "d2")


async def test_sync_master_encadena_todo(svc, bs, Session):
    bs.classlist = [_alumno(1, "Ana")]
    bs.grade_items = [{"Id": 1, "Name": "Taller"}]
    bs.folders = [{"Id": 2, "Name": "Entrega"}]
    bs.outcome_sets = [{"Id": 3, "Name": "RA"}]
    r = await svc.sync_master(OU)
    assert r["classlist"]["inserted_students"] == 1
    assert r["grade_items"]["inserted"] == 1
    assert r["dropbox_folders"]["inserted"] == 1
    assert r["outcome_sets"]["inserted"] == 1
    assert sorted(x.sync_type for x in _all(Session, m.SyncRun)) == [
        "classlist", "dropbox_folders", "grade_items", "outcome_sets",
    ]


# ──────────────────────────────────────────────────────────────────────────
# Snapshots de métricas
# ──────────────────────────────────────────────────────────────────────────
def _metricas(perf, cov=50.0, overdue=0):
    return {
        "currentPerformancePct": perf, "coveragePct": cov,
        "gradedItemsCount": 2, "totalItemsCount": 4,
        "overdueUnscoredCount": overdue, "overdueUnscoredWeightPct": 10.0 * overdue,
        "notSubmittedCount": overdue, "notSubmittedWeightPct": 10.0 * overdue,
        "pendingUngradedCount": 1, "pendingUngradedWeightPct": 25.0,
    }


@pytest.fixture
def fake_metrics(svc, monkeypatch):
    llamadas = {}
    datos = {}

    async def fake(orgUnitId, student_ids, course_cfg):
        llamadas["ids"] = list(student_ids)
        return datos

    monkeypatch.setattr(svc.gemelo, "compute_students_gradebook_metrics", fake)
    return llamadas, datos


async def test_snapshots_insert_update_y_riesgo(svc, bs, Session, fake_metrics):
    llamadas, datos = fake_metrics
    bs.classlist = [_alumno(1, "Ana"), _alumno(2, "Beto"), _alumno(3, "Caro"),
                    _alumno(4, "Profe", rol="Instructor")]
    datos.update({1: _metricas(85.0), 2: _metricas(40.0, overdue=2)})  # 3 sin métricas
    r = await svc.sync_student_metric_snapshots(OU)
    assert llamadas["ids"] == [1, 2, 3]  # el instructor no se calcula
    assert (r["count"], r["inserted"], r["updated"]) == (3, 3, 0)

    snaps = {s.brightspace_user_id: s for s in _all(Session, m.StudentCourseMetricSnapshot)}
    assert snaps[1].risk_level == "bajo" and snaps[1].current_performance_pct == 85.0
    assert snaps[2].risk_level == "alto"
    assert snaps[2].not_submitted_weight_pct == 20.0
    assert snaps[3].risk_level == "pending" and snaps[3].current_performance_pct is None
    assert snaps[1].graded_items_count == 2 and snaps[1].total_items_count == 4

    # Segunda corrida: cambia una nota → 3 updates (updated_at siempre cambia).
    datos[1] = _metricas(60.0)
    r = await svc.sync_student_metric_snapshots(OU)
    assert (r["inserted"], r["updated"]) == (0, 3)
    s1 = _all(Session, m.StudentCourseMetricSnapshot, brightspace_user_id=1)[0]
    assert s1.risk_level == "medio" and s1.current_performance_pct == 60.0
    assert _all(Session, m.SyncState, sync_type="student_metric_snapshots")[0].last_status == "success"


async def test_snapshots_umbral_exacto(svc, bs, Session, fake_metrics):
    _, datos = fake_metrics
    bs.classlist = [_alumno(1, "Ana"), _alumno(2, "Beto")]
    datos.update({1: _metricas(50.0), 2: _metricas(70.0)})
    await svc.sync_student_metric_snapshots(OU)
    snaps = {s.brightspace_user_id: s.risk_level for s in _all(Session, m.StudentCourseMetricSnapshot)}
    assert snaps == {1: "medio", 2: "bajo"}


async def test_snapshots_guardan_conteo_de_vencidos(svc, bs, Session, fake_metrics):
    _, datos = fake_metrics
    bs.classlist = [_alumno(1, "Ana")]
    datos[1] = _metricas(40.0, overdue=2)
    await svc.sync_student_metric_snapshots(OU)
    s = _all(Session, m.StudentCourseMetricSnapshot)[0]
    assert s.overdue_count == 2
    assert s.open_count == 1


async def test_snapshots_error_registra_y_relanza(svc, bs, Session, fake_metrics, monkeypatch):
    _, datos = fake_metrics
    bs.classlist = [_alumno(1, "Ana")]
    datos[1] = {"gradedItemsCount": "no-entero"}
    with pytest.raises(ValueError):
        await svc.sync_student_metric_snapshots(OU)
    assert _all(Session, m.StudentCourseMetricSnapshot) == []
    run = _all(Session, m.SyncRun)[0]
    assert run.status == "failed"
    err = _all(Session, m.SyncError)[0]
    assert err.sync_type == "student_metric_snapshots" and "no-entero" in err.error_message


async def test_snapshots_usa_el_calculo_real_de_gradebook(svc, bs, Session, monkeypatch):
    """Integración liviana: sin fake de métricas, el SyncService le pasa los ids
    al GemeloService real (que consulta el FakeBS)."""
    from app.services.gemelo import caches
    caches._COURSE_DATA_CACHE.clear()
    caches._COURSE_DATA_LOCKS.clear()

    bs.classlist = [_alumno(1, "Ana")]
    bs.grade_items = [{"Id": 1, "Name": "Taller", "Weight": 100}]

    async def values(ou, uid):
        return [{"GradeObjectIdentifier": 1, "PointsNumerator": 9, "PointsDenominator": 10,
                 "WeightedNumerator": 90, "WeightedDenominator": 100}]

    bs.list_grade_values_for_user = values
    try:
        await svc.sync_student_metric_snapshots(OU + 7)
    finally:
        caches._COURSE_DATA_CACHE.clear()
        caches._COURSE_DATA_LOCKS.clear()
    s = _all(Session, m.StudentCourseMetricSnapshot)[0]
    assert (s.current_performance_pct, s.coverage_pct, s.risk_level) == (90.0, 100.0, "bajo")
