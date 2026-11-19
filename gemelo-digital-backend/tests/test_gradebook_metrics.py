"""Métricas masivas de gradebook (compute_students_gradebook_metrics) con un
cliente Brightspace falso: cobertura, rendimiento ponderado, vencidos vs.
pendientes (incluida la regla de fechas heredadas) e include/exclude ids."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.gemelo import caches
from app.services.gemelo.gradebook import GradebookMixin


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


AHORA = datetime.now(timezone.utc)
PASADO = _iso(AHORA - timedelta(days=10))
FUTURO = _iso(AHORA + timedelta(days=10))
INICIO_CURSO = _iso(AHORA - timedelta(days=100))
ANTES_DEL_CURSO = _iso(AHORA - timedelta(days=400))


class FakeBS:
    def __init__(self, items, values_by_user, course_info=None, folders=None):
        self.items = items
        self.values_by_user = values_by_user
        self.course_info = course_info if course_info is not None else {"StartDate": INICIO_CURSO}
        self.folders = folders or []

    async def list_grade_items(self, ou):
        return self.items

    async def list_grade_values_for_user(self, ou, uid):
        v = self.values_by_user.get(uid)
        if isinstance(v, Exception):
            raise v
        return v or []

    async def list_dropbox_folders(self, ou):
        return self.folders

    async def get_course_info(self, ou):
        return self.course_info


class _Svc(GradebookMixin):
    def __init__(self, bs):
        self.bs = bs


@pytest.fixture(autouse=True)
def _cache_limpia():
    caches._COURSE_DATA_CACHE.clear()
    caches._COURSE_DATA_LOCKS.clear()
    yield
    caches._COURSE_DATA_CACHE.clear()
    caches._COURSE_DATA_LOCKS.clear()


ITEMS = [
    {"Id": 1, "Name": "Taller 1", "Weight": 20},
    {"Id": 2, "Name": "Parcial", "Weight": 30, "DueDate": PASADO},
    {"Id": 3, "Name": "Proyecto", "Weight": 50, "DueDate": FUTURO},
]


async def test_cobertura_rendimiento_y_vencidos():
    bs = FakeBS(ITEMS, {101: [
        {"GradeObjectIdentifier": "1", "PointsNumerator": 8, "PointsDenominator": 10,
         "WeightedNumerator": 16, "WeightedDenominator": 20},
    ]})
    out = await _Svc(bs).compute_students_gradebook_metrics(10, [101], None)
    m = out[101]
    assert m["coveragePct"] == 20.0
    assert m["gradedItemsCount"] == 1
    assert m["totalItemsCount"] == 3
    assert m["coverageCountText"] == "1/3"
    assert m["currentPerformancePct"] == 80.0
    assert m["overdueUnscoredCount"] == 1
    assert m["overdueUnscoredWeightPct"] == 30.0
    assert m["pendingUngradedCount"] == 1
    assert m["pendingUngradedWeightPct"] == 50.0
    # Alias de compatibilidad
    assert m["notSubmittedCount"] == 1
    assert m["notSubmittedWeightPct"] == 30.0


async def test_sin_notas_rendimiento_es_none():
    bs = FakeBS(ITEMS, {101: []})
    m = (await _Svc(bs).compute_students_gradebook_metrics(10, [101], None))[101]
    assert m["currentPerformancePct"] is None
    assert m["coveragePct"] == 0.0
    assert m["coverageCountText"] == "0/3"


async def test_fallback_a_puntos_cuando_no_hay_ponderados():
    bs = FakeBS(ITEMS, {101: [
        {"GradeObjectIdentifier": 1, "PointsNumerator": 10, "PointsDenominator": 10},
        {"GradeObjectIdentifier": 2, "PointsNumerator": 5, "PointsDenominator": 10},
    ]})
    m = (await _Svc(bs).compute_students_gradebook_metrics(10, [101], None))[101]
    # (100*20 + 50*30) / 50 = 70
    assert m["currentPerformancePct"] == 70.0
    assert m["coveragePct"] == 50.0


async def test_fecha_heredada_anterior_al_curso_no_cuenta_como_vencida():
    items = [{"Id": 1, "Name": "Importado", "Weight": 100, "DueDate": ANTES_DEL_CURSO}]
    m = (await _Svc(FakeBS(items, {101: []})).compute_students_gradebook_metrics(10, [101], None))[101]
    assert m["overdueUnscoredCount"] == 0
    assert m["pendingUngradedCount"] == 1


async def test_sin_fecha_de_inicio_usa_regla_clasica():
    items = [{"Id": 1, "Name": "Importado", "Weight": 100, "DueDate": ANTES_DEL_CURSO}]
    bs = FakeBS(items, {101: []}, course_info={})
    m = (await _Svc(bs).compute_students_gradebook_metrics(10, [101], None))[101]
    assert m["overdueUnscoredCount"] == 1


async def test_vencimiento_desde_dropbox_asociado():
    items = [{"Id": 1, "Name": "Entrega", "Weight": 100,
              "AssociatedTool": {"ToolId": 2000, "ToolItemId": 77}}]
    bs = FakeBS(items, {101: []}, folders={"Items": [{"Id": 77, "DueDate": PASADO}]})
    m = (await _Svc(bs).compute_students_gradebook_metrics(10, [101], None))[101]
    assert m["overdueUnscoredCount"] == 1


async def test_include_y_exclude_ids_de_la_politica():
    cfg = {"gradingPolicy": {"includeGradeObjectIds": [1, 2], "excludeGradeObjectIds": [2]}}
    m = (await _Svc(FakeBS(ITEMS, {101: []})).compute_students_gradebook_metrics(10, [101], cfg))[101]
    assert m["totalItemsCount"] == 1


async def test_un_estudiante_con_error_no_tumba_a_los_demas():
    bs = FakeBS(ITEMS, {101: RuntimeError("boom"), 102: []})
    out = await _Svc(bs).compute_students_gradebook_metrics(10, [101, 102], None)
    assert set(out) == {102}


async def test_sin_metodos_del_cliente_devuelve_vacio():
    class Vacio:
        pass
    assert await _Svc(Vacio()).compute_students_gradebook_metrics(10, [1], None) == {}


async def test_pesos_en_cero_no_dividen_por_cero():
    items = [{"Id": 1, "Name": "Sin peso", "Weight": 0}]
    bs = FakeBS(items, {101: [{"GradeObjectIdentifier": 1, "PointsNumerator": 3, "PointsDenominator": 4}]})
    m = (await _Svc(bs).compute_students_gradebook_metrics(10, [101], None))[101]
    assert m["coveragePct"] == 0.0
    assert m["currentPerformancePct"] is None


async def test_items_corte_excluidos_de_las_metricas_masivas():
    items = [
        {"Id": 1, "Name": "Taller 1", "Weight": 50},
        {"Id": 2, "Name": "Corte 1", "Weight": 50},
    ]
    bs = FakeBS(items, {101: [
        {"GradeObjectIdentifier": 1, "PointsNumerator": 10, "PointsDenominator": 10,
         "WeightedNumerator": 50, "WeightedDenominator": 50},
        {"GradeObjectIdentifier": 2, "PointsNumerator": 5, "PointsDenominator": 10,
         "WeightedNumerator": 25, "WeightedDenominator": 50},
    ]})
    m = (await _Svc(bs).compute_students_gradebook_metrics(10, [101], None))[101]
    assert m["totalItemsCount"] == 1
    assert m["currentPerformancePct"] == 100.0
