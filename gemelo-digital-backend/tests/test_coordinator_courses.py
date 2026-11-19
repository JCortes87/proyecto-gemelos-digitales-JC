"""Cursos del coordinador por semestre real de Brightspace (los nombres de
los cursos actuales no traen el código del período)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import gemelo_coordinator as gc

SEMESTRES = [
    {"Identifier": "45558", "Code": "202620", "Name": "202620 2DO PREGRADO / POSGRADO"},
    {"Identifier": "40081", "Code": "202610", "Name": "202610 1ER PREGRADO / POSGRADO"},
]
OFERTAS = [
    {"id": "29120", "name": "Analítica", "code": "A1", "semesterCode": "202620", "semesterName": "202620 2DO"},
    {"id": "30001", "name": "Finanzas", "code": "F1", "semesterCode": "202620", "semesterName": "202620 2DO"},
    {"id": "30002", "name": "Mercadeo", "code": "M1", "semesterCode": "202620", "semesterName": "202620 2DO"},
]
MATRICULAS = [
    {"OrgUnit": {"Id": 29120}, "Access": {"ClasslistRoleName": "Coordinador Administrativo"}},
    {"OrgUnit": {"Id": 30001}, "Access": {"ClasslistRoleName": "Estudiante EF"}},
    {"OrgUnit": {"Id": 99999}, "Role": {"Id": 109}},
]


@pytest.fixture
def client(monkeypatch):
    async def fake_collect(headers, out):
        out.extend(SEMESTRES)

    async def fake_offerings(headers, sem):
        return [o for o in OFERTAS if sem["Code"] == "202620"]

    async def fake_whoami(headers):
        return "777", None

    async def fake_merged(headers, uid, err, limit):
        return [], [], MATRICULAS

    monkeypatch.setattr(gc, "_require_token_from_request", lambda r: ("tok", None))
    monkeypatch.setattr(gc, "_collect_semesters", fake_collect)
    monkeypatch.setattr(gc, "fetch_semester_course_offerings", fake_offerings)
    monkeypatch.setattr(gc, "_get_whoami_id", fake_whoami)
    monkeypatch.setattr(gc, "merged_own_enrollments", fake_merged)
    app = FastAPI()
    app.include_router(gc.router)
    return TestClient(app)


def test_roles_de_staff_excluyen_estudiantes():
    staff = gc._own_staff_roles(MATRICULAS)
    assert staff == {"29120": "Coordinador Administrativo", "99999": "Instructor"}


def test_coordinador_solo_ve_sus_cursos_del_semestre(client, monkeypatch):
    monkeypatch.setattr(gc, "_session_from_request", lambda r: {"user_id": "777", "role": None})
    r = client.get("/coordinator/courses?semesterId=45558")
    assert r.status_code == 200
    body = r.json()
    assert body["semester"] == {"id": 45558, "code": "202620", "name": "202620 2DO PREGRADO / POSGRADO"}
    assert [c["id"] for c in body["items"]] == ["29120"]
    assert body["items"][0]["roleName"] == "Coordinador Administrativo"


def test_superadmin_ve_todos_los_cursos_del_semestre(client, monkeypatch):
    monkeypatch.setattr(gc, "_session_from_request", lambda r: {"user_id": "1", "role": "Super Administrator"})
    r = client.get("/coordinator/courses?semesterId=45558")
    assert r.status_code == 200
    assert r.json()["count"] == 3


def test_semestre_inexistente_es_404(client, monkeypatch):
    monkeypatch.setattr(gc, "_session_from_request", lambda r: {"user_id": "777"})
    r = client.get("/coordinator/courses?semesterId=1")
    assert r.status_code == 404
