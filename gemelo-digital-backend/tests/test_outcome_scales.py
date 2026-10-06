"""BETA — escalas de logro (lo/outcomeScales) como umbrales sugeridos."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import gemelo_scales
from app.api.course_auth import require_course_staff
from app.api.gemelo_shared import get_service
from app.rate_limit import limiter
from app.services import outcome_scales as osc
from app.services.outcome_scales import normalize_scale, pick_main_scale, suggest_thresholds

BASE = "https://bs.test"


def _raw_scale(levels, *, uses_pct=True, threshold=None, scale_id=7, name="Escala CESA"):
    return {
        "ScaleId": scale_id,
        "Name": name,
        "UsesPercentages": uses_pct,
        "AchievementThresholdLevelId": threshold,
        "Levels": [
            {"LevelId": lid, "Name": n, "Color": c, **({"PercentThreshold": p} if p is not None else {})}
            for lid, n, c, p in levels
        ],
    }


LEVELS_4 = [
    (1, "Inicial", "#D32F2F", 0),
    (2, "En desarrollo", "#F9A825", 50),
    (3, "Logrado", "#388E3C", 70),
    (4, "Destacado", "#1565C0", 90),
]


# ── Función pura de sugerencia ───────────────────────────────────────────────

def test_sugerencia_con_umbral_de_escala():
    scale = normalize_scale(_raw_scale(LEVELS_4, threshold=4))
    out = suggest_thresholds(scale)
    assert out["suggested"] == {"critical": 70.0, "watch": 90.0}
    assert "escala" in out["basis"]


def test_sugerencia_con_umbral_del_conjunto():
    scale = normalize_scale(_raw_scale(LEVELS_4, threshold=None))
    out = suggest_thresholds(scale, set_threshold_id=3)
    assert out["suggested"] == {"critical": 50.0, "watch": 70.0}
    assert "conjunto" in out["basis"]


def test_sugerencia_por_nombre_sin_tildes_ni_mayusculas():
    levels = [
        (1, "Bajo", "#000000", 0),
        (2, "Básico", "#111111", 40),
        (3, "SATISFACTÓRIO", "#222222", 65),
        (4, "Alto", "#333333", 85),
    ]
    out = suggest_thresholds(normalize_scale(_raw_scale(levels)))
    assert out["suggested"] == {"critical": 40.0, "watch": 65.0}


def test_sugerencia_nivel_inferior_cero_usa_menos_20():
    # "No logrado" contiene "logrado" pero es negativo: se ignora.
    levels = [(1, "No logrado", "#000000", 0), (2, "Proficient", "#111111", 60)]
    out = suggest_thresholds(normalize_scale(_raw_scale(levels)))
    assert out["suggested"] == {"critical": 40.0, "watch": 60.0}
    assert "20" in out["basis"]


def test_umbral_en_primer_nivel_no_es_valido():
    # Umbral explícito en el nivel 0 % → watch=0, critical=0 → sin sugerencia.
    levels = [(1, "Inicial", "#000000", 0), (2, "Alto", "#111111", 60)]
    out = suggest_thresholds(normalize_scale(_raw_scale(levels, threshold=1)))
    assert out["suggested"] is None


def test_sugerencia_mediana_sin_umbral_ni_nombre():
    levels = [(1, "A", "#000", 0), (2, "B", "#000", 30), (3, "C", "#000", 60), (4, "D", "#000", 80)]
    out = suggest_thresholds(normalize_scale(_raw_scale(levels)))
    assert out["suggested"] == {"critical": 30.0, "watch": 60.0}
    assert "intermedio" in out["basis"]


def test_escala_sin_porcentajes():
    levels = [(1, "Inicial", "#000", None), (2, "Logrado", "#000", None)]
    out = suggest_thresholds(normalize_scale(_raw_scale(levels, uses_pct=False)))
    assert out["suggested"] is None
    assert "no usa porcentajes" in out["basis"]


def test_orden_invalido():
    levels = [(1, "Inicial", "#000", 0), (2, "Medio", "#000", 70), (3, "Logrado", "#000", 60)]
    out = suggest_thresholds(normalize_scale(_raw_scale(levels)))
    assert out["suggested"] is None
    assert "orden creciente" in out["basis"]


def test_escala_vacia_o_ausente():
    assert suggest_thresholds(None)["suggested"] is None
    assert suggest_thresholds(normalize_scale(_raw_scale([])))["suggested"] is None


def test_escala_mas_usada_y_empate():
    sets = [{"ScaleId": 1}, {"ScaleId": 2}, {"ScaleId": 2}, {"ScaleId": None}]
    assert pick_main_scale(sets)[0] == "2"
    assert pick_main_scale([{"ScaleId": 5}, {"ScaleId": 6}])[0] == "5"
    assert pick_main_scale([{"ScaleId": None}]) == (None, None)


# ── Endpoint con Brightspace falso ───────────────────────────────────────────

class FakeBS:
    def __init__(self, routes, lo_version="1.99"):
        self.base_url = BASE
        self.lo_version = lo_version
        self.routes = routes  # {(ver, path): (status, json)}
        self.calls = []

    async def _raw_request(self, method, url, **kw):
        self.calls.append(url)
        path = url[len(f"{BASE}/d2l/api/le/"):]
        ver, rest = path.split("/", 1)
        status, body = self.routes.get((ver, "/" + rest), (404, None))
        return {"status": status, "ok": status == 200, "json": body, "text": None}


class FakeSvc:
    def __init__(self, bs):
        self.bs = bs


@pytest.fixture(autouse=True)
def _limpiar_cache():
    osc.clear_cache()
    yield
    osc.clear_cache()


def _client(bs):
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(gemelo_scales.router, prefix="/gemelo")
    app.dependency_overrides[get_service] = lambda: FakeSvc(bs)

    async def _staff(orgUnitId: int):
        return {"userId": "1", "isInstructor": True}

    app.dependency_overrides[require_course_staff] = _staff
    return TestClient(app)


SETS_PATH = "/123/lo/outcomeSets/"
SETS = [
    {"OutcomeSetId": "s1", "Name": "RA programa", "ScaleId": 7, "AchievementThresholdLevelId": None},
    {"OutcomeSetId": "s2", "Name": "RA curso", "ScaleId": 7, "AchievementThresholdLevelId": 3},
]


def test_endpoint_200():
    bs = FakeBS({
        ("1.99", SETS_PATH): (200, SETS),
        ("1.99", "/lo/outcomeScales/7"): (200, _raw_scale(LEVELS_4, threshold=3)),
    })
    r = _client(bs).get("/gemelo/course/123/outcome-scales")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True and body["beta"] is True
    assert len(body["scales"]) == 2
    sc = body["scales"][0]
    assert sc["scaleName"] == "Escala CESA" and sc["usesPercentages"] is True
    assert [lv["percentThreshold"] for lv in sc["levels"]] == [0, 50, 70, 90]
    assert [lv["isAchievementThreshold"] for lv in sc["levels"]] == [False, False, True, False]
    assert sc["levels"][2]["color"] == "#388E3C"
    sug = body["suggestedThresholds"]
    assert sug["critical"] == 50 and sug["watch"] == 70 and sug["basis"]
    # La escala se pidió una sola vez (dedupe) y queda en caché.
    assert sum("outcomeScales" in c for c in bs.calls) == 1
    _client(bs).get("/gemelo/course/123/outcome-scales")
    assert sum("outcomeScales" in c for c in bs.calls) == 1


def test_endpoint_403_missing_scope():
    bs = FakeBS({
        ("1.99", SETS_PATH): (200, SETS),
        ("1.99", "/lo/outcomeScales/7"): (403, None),
    })
    body = _client(bs).get("/gemelo/course/123/outcome-scales").json()
    assert body["available"] is False
    assert body["reason"] == "missing_scope"
    assert "outcomes:scales:read" in body["detail"]
    assert "BRIGHTSPACE_SCOPE" in body["detail"]


def test_endpoint_404_en_todas_las_versiones():
    bs = FakeBS({("1.99", SETS_PATH): (200, SETS)})
    body = _client(bs).get("/gemelo/course/123/outcome-scales").json()
    assert body["available"] is False and body["reason"] == "not_supported"
    tried = [c for c in bs.calls if "outcomeScales" in c]
    assert [c.split("/le/")[1].split("/")[0] for c in tried] == ["1.99", "1.98", "1.97"]


def test_endpoint_fallback_de_version():
    bs = FakeBS({
        ("1.99", SETS_PATH): (200, SETS),
        ("1.98", "/lo/outcomeScales/7"): (200, _raw_scale(LEVELS_4)),
    })
    body = _client(bs).get("/gemelo/course/123/outcome-scales").json()
    assert body["available"] is True
    # Sin umbral en la escala → usa el del conjunto s1? s1 no tiene; el
    # conjunto principal (primero con la escala) es s1 → heurística de nombre.
    assert body["suggestedThresholds"]["watch"] == 70


def test_endpoint_sin_scale_id():
    sets = [{"OutcomeSetId": "s1", "Name": "RA", "ScaleId": None}, {"OutcomeSetId": "s2", "Name": "X"}]
    bs = FakeBS({("1.99", SETS_PATH): (200, sets)})
    body = _client(bs).get("/gemelo/course/123/outcome-scales").json()
    assert body["available"] is False and body["reason"] == "no_scale"
    assert not any("outcomeScales" in c for c in bs.calls)


def test_endpoint_sets_403():
    bs = FakeBS({("1.99", SETS_PATH): (403, None)})
    body = _client(bs).get("/gemelo/course/123/outcome-scales").json()
    assert body["reason"] == "missing_scope"
    assert "outcomes:sets:read" in body["detail"]


def test_endpoint_escala_sin_porcentajes():
    bs = FakeBS({
        ("1.99", SETS_PATH): (200, SETS[:1]),
        ("1.99", "/lo/outcomeScales/7"): (200, _raw_scale(
            [(1, "Inicial", "#000", None), (2, "Logrado", "#000", None)], uses_pct=False)),
    })
    body = _client(bs).get("/gemelo/course/123/outcome-scales").json()
    assert body["available"] is True
    assert body["suggestedThresholds"] is None
    assert "porcentajes" in body["suggestionNote"]
