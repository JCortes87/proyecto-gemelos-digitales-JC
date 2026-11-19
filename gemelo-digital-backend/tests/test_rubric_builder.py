"""BETA — Generador de rúbricas por RA: builder puro, validación y endpoints
(preview sin red y creación contra un Brightspace falso)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import gemelo_rubrics
from app.api.course_auth import require_course_staff
from app.api.gemelo_shared import get_service
from app.rate_limit import limiter
from app.config import settings
from app.services import rubric_builder as rb

LE = settings.brightspace_le_version

G1 = "11111111-1111-1111-1111-111111111111"
G2 = "22222222-2222-2222-2222-222222222222"
G3 = "33333333-3333-3333-3333-333333333333"

OUTCOME_SETS = [
    {
        "OutcomeSetId": 7,
        "Name": "RA Finanzas",
        "Outcomes": [
            {"OutcomeId": G1, "Description": "RA1 - Analiza estados financieros", "Children": [
                {"OutcomeId": G3, "Description": {"Text": "RA3: Evalúa riesgos", "Html": ""}},
            ]},
            {"OutcomeId": G2, "Description": "RA2 – Formula presupuestos de inversión"},
        ],
    },
    {"OutcomeSetId": 0, "Outcomes": []},
]

LEVELS = [{"name": n, "points": p} for n, p in
          [("Insuficiente", 1), ("En desarrollo", 2), ("Logrado", 3), ("Destacado", 4)]]


def _outcomes():
    return rb.extract_course_outcomes(OUTCOME_SETS)


# ── RA del curso ──────────────────────────────────────────────────────────────
def test_extrae_ra_planos_con_codigo_y_hijos():
    outs = _outcomes()
    assert [o["code"] for o in outs] == ["RA1", "RA2", "RA3"]
    ra3 = next(o for o in outs if o["id"] == G3)
    assert ra3["title"] == "Evalúa riesgos" and ra3["setName"] == "RA Finanzas"


# ── Builder ───────────────────────────────────────────────────────────────────
def test_builder_estructura_completa_y_borrador_por_defecto():
    outs = _outcomes()
    ri = rb.build_rubric_input("Rúbrica final", outs[:2], LEVELS)
    for k in ("Name", "Description", "RubricType", "RubricStateId", "ScoringMethod", "Visibility",
              "IsScoreVisibleToAssessedUsers", "ReverseLevelDisplayOrder", "CriteriaGroups",
              "OverallLevels"):
        assert k in ri
    assert ri["RubricStateId"] == rb.RUBRIC_STATE_DRAFT == 2
    assert ri["RubricType"] == 1 and ri["ScoringMethod"] == 1
    assert ri["Description"] == {"Content": rb.RUBRIC_DESCRIPTION, "Type": "Text"}
    grp = ri["CriteriaGroups"][0]
    assert [lv["Points"] for lv in grp["Levels"]] == [1, 2, 3, 4]
    assert grp["Criteria"][0]["Name"].startswith("RA1 – Analiza")
    # una celda por nivel, mismo orden, descriptor plantillado con el RA
    for crit in grp["Criteria"]:
        assert len(crit["Cells"]) == 4
        assert all(set(c) == {"Feedback", "Description", "Points"} for c in crit["Cells"])
    last = grp["Criteria"][0]["Cells"][3]["Description"]
    assert last["Type"] == "Text"
    assert last["Content"] == "Demuestra de forma destacada: RA1 - Analiza estados financieros"
    assert [o["RangeStart"] for o in ri["OverallLevels"]] == [0, 4, 6, 8]
    assert "Id" not in str(list(grp.keys()))


def test_builder_publicada():
    ri = rb.build_rubric_input("R", _outcomes()[:1], LEVELS, publish=True)
    assert ri["RubricStateId"] == rb.RUBRIC_STATE_PUBLISHED == 0


def test_builder_aplica_overrides_por_ra_y_nivel():
    outs = _outcomes()
    ri = rb.build_rubric_input("R", outs[:2], LEVELS, cell_overrides={(G2, 1): "Texto propio"})
    crits = ri["CriteriaGroups"][0]["Criteria"]
    assert crits[1]["Cells"][1]["Description"]["Content"] == "Texto propio"
    assert crits[0]["Cells"][1]["Description"]["Content"].startswith("Demuestra de forma parcial")


def test_prepare_ignora_overrides_de_ra_no_seleccionados_y_mapea():
    p = rb.prepare_rubric(
        name="  Mi rúbrica ", outcome_ids=[G2, G2, G1], levels=LEVELS, publish=False,
        cells=[{"outcomeId": G3, "levelIndex": 0, "description": "x"},
               {"outcomeId": G1, "levelIndex": 0, "description": "Editado"}],
        course_outcomes=_outcomes(),
    )
    assert [m["outcomeId"] for m in p["mapping"]] == [G2, G1]
    assert p["rubricInput"]["Name"] == "Mi rúbrica"
    assert p["rubricInput"]["CriteriaGroups"][0]["Criteria"][1]["Cells"][0]["Description"]["Content"] == "Editado"
    assert p["state"] == "draft"


# ── Validación ────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("kwargs,msg", [
    ({"outcome_ids": []}, "entre 1 y 30"),
    ({"outcome_ids": [f"g{i}" for i in range(31)]}, "entre 1 y 30"),
    ({"levels": LEVELS[:1]}, "entre 2 y 6"),
    ({"levels": LEVELS + LEVELS[:3]}, "entre 2 y 6"),
    ({"levels": [{"name": "A", "points": 1}, {"name": "a", "points": 2}]}, "únicos"),
    ({"levels": [{"name": "A", "points": 3}, {"name": "B", "points": 2}]}, "no pueden disminuir"),
    ({"levels": [{"name": "A", "points": None}, {"name": "B", "points": 2}]}, "puntaje"),
    ({"name": "  "}, "nombre"),
    ({"outcome_ids": ["no-existe"]}, "no pertenecen"),
    ({"cells": [{"outcomeId": G1, "levelIndex": 9, "description": "x"}]}, "nivel inexistente"),
    ({"cells": [{"outcomeId": G1, "levelIndex": 0, "description": " "}]}, "vacías"),
])
def test_validaciones(kwargs, msg):
    base = dict(name="R", outcome_ids=[G1], levels=LEVELS, publish=False, cells=None,
                course_outcomes=_outcomes())
    base.update(kwargs)
    with pytest.raises(rb.RubricValidationError, match=msg):
        rb.prepare_rubric(**base)


def test_puntos_iguales_generan_advertencia():
    lv = [{"name": "A", "points": 1}, {"name": "B", "points": 1}]
    p = rb.prepare_rubric(name="R", outcome_ids=[G1], levels=lv, publish=False, cells=None,
                          course_outcomes=_outcomes())
    assert p["warnings"]


# ── Brightspace falso ─────────────────────────────────────────────────────────
class FakeBS:
    base_url = "https://bs.test"
    align_version = "1.99"

    def __init__(self, create=None, detail=None, align_status=None):
        self.calls = []
        self._create = create
        self._detail = detail
        self._align_status = align_status or {}

    async def list_outcome_sets(self, ou):
        self.calls.append(("GET", f"outcomeSets/{ou}", None))
        return OUTCOME_SETS

    async def _raw_request(self, method, url, *, json_body=None, params=None, timeout=30.0):
        self.calls.append((method, url, json_body))
        if method == "POST" and url.endswith("/rubrics/"):
            return self._create
        if method == "GET" and "/rubrics/" in url:
            return self._detail or {"status": 404, "ok": False, "json": None, "text": "nf"}
        if "/lo/alignments/activity/RubricCriterion/" in url:
            cid = url.rsplit("_R_", 1)[1]
            st = self._align_status.get(cid, 200)
            return {"status": st, "ok": st == 200, "json": [] if st == 200 else {"Detail": "locked"},
                    "text": None}
        raise AssertionError(f"llamada inesperada {method} {url}")

    @property
    def writes(self):
        return [c for c in self.calls if c[0] == "POST"]


def _created(rid=55, ids=(101, 102)):
    return {"status": 201, "ok": True, "text": None, "json": {
        "RubricId": rid, "Name": "R",
        "CriteriaGroups": [{"Name": "g", "Criteria": [
            {"Id": i, "Name": n} for i, n in zip(ids, ["RA1 – Analiza estados financieros",
                                                       "RA2 – Formula presupuestos de inversión"])
        ]}],
    }}


@pytest.fixture
def make_client():
    def _make(bs):
        app = FastAPI()
        app.state.limiter = limiter
        app.include_router(gemelo_rubrics.router, prefix="/gemelo")
        app.dependency_overrides[get_service] = lambda: type("Svc", (), {"bs": bs})()
        app.dependency_overrides[require_course_staff] = lambda: {"isInstructor": True}
        return TestClient(app)
    old = limiter.enabled
    limiter.enabled = False
    yield _make
    limiter.enabled = old


BODY = {"name": "Rúbrica RA", "outcomeIds": [G1, G2], "levels": LEVELS, "publish": False}


def test_endpoint_outcomes_lista_ra(make_client):
    r = make_client(FakeBS()).get("/gemelo/course/10/rubrics/outcomes")
    assert r.status_code == 200
    assert len(r.json()["outcomes"]) == 3 and len(r.json()["defaultLevels"]) == 4


def test_preview_no_escribe_en_brightspace(make_client):
    bs = FakeBS()
    r = make_client(bs).post("/gemelo/course/10/rubrics/preview", json=BODY)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["dryRun"] is True and j["rubricInput"]["RubricStateId"] == 2
    assert [m["outcomeId"] for m in j["mapping"]] == [G1, G2]
    assert bs.writes == []


def test_preview_valida_con_400(make_client):
    r = make_client(FakeBS()).post("/gemelo/course/10/rubrics/preview",
                                   json={**BODY, "levels": LEVELS[:1]})
    assert r.status_code == 400 and "niveles" in r.json()["detail"]


def test_crear_exige_confirmacion(make_client):
    bs = FakeBS(create=_created())
    r = make_client(bs).post("/gemelo/course/10/rubrics", json=BODY)
    assert r.status_code == 400 and bs.writes == []


def test_crear_y_alinear_happy_path(make_client):
    bs = FakeBS(create=_created())
    r = make_client(bs).post("/gemelo/course/10/rubrics", json={**BODY, "confirm": True})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["rubricId"] == "55" and j["state"] == "draft" and j["partial"] is False
    assert j["manualAlignment"] is None
    assert [(c["criterionId"], c["outcomeId"], c["aligned"]) for c in j["criteria"]] == [
        ("101", G1, True), ("102", G2, True)]
    assert j["brightspaceUrl"] == "https://bs.test/d2l/lp/rubrics/list.d2l?ou=10"
    assert "Brightspace" in j["nextStep"]
    posts = bs.writes
    assert posts[0][1] == f"https://bs.test/d2l/api/le/{LE}/10/rubrics/"
    assert posts[1][1].endswith("/10/lo/alignments/activity/RubricCriterion/55_R_101")
    assert posts[1][2] == {"Action": "add", "OutcomeIds": [G1]}


def test_crear_403_missing_scope(make_client):
    bs = FakeBS(create={"status": 403, "ok": False, "json": None, "text": "Forbidden"})
    r = make_client(bs).post("/gemelo/course/10/rubrics", json={**BODY, "confirm": True})
    assert r.status_code == 403
    d = r.json()["detail"]
    assert d["reason"] == "missing_scope" and "rubrics:objects:write" in d["message"]
    assert len(bs.writes) == 1  # no intenta alinear


def test_alineacion_parcial_no_borra_la_rubrica(make_client):
    bs = FakeBS(create=_created(), align_status={"102": 403})
    r = make_client(bs).post("/gemelo/course/10/rubrics", json={**BODY, "confirm": True})
    assert r.status_code == 200
    j = r.json()
    assert j["partial"] is True and j["alignedCount"] == 1
    # Paso manual explícito para los criterios que no se pudieron vincular.
    assert "Resultados" in j["manualAlignment"] and "1 criterio" in j["manualAlignment"]
    fail = j["criteria"][1]
    assert fail["aligned"] is False and "bloqueada" in fail["error"]
    assert not any(c[0] == "DELETE" for c in bs.calls)


def test_sin_ids_de_criterio_hace_get_de_la_rubrica(make_client):
    created = {"status": 201, "ok": True, "text": None, "json": {"RubricId": 77}}
    detail = _created(rid=77, ids=(201, 202))
    detail["status"] = 200
    bs = FakeBS(create=created, detail=detail)
    r = make_client(bs).post("/gemelo/course/10/rubrics", json={**BODY, "confirm": True})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["fetchedDetail"] is True
    assert [c["criterionId"] for c in j["criteria"]] == ["201", "202"]
    assert ("GET", f"https://bs.test/d2l/api/le/{LE}/10/rubrics/77", None) in bs.calls
    assert all(c["aligned"] for c in j["criteria"])
