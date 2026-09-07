"""Tests de course_auth: clasificación de roles y gates de autorización
por curso (fail-closed). Se monkeypatchean los accesos a Brightspace y a la
sesión para probar la lógica pura de autorización.
"""
import pytest
from fastapi import HTTPException

from app.api import course_auth as ca


class TestClassifyRoleName:
    def test_roles_de_estudiante(self):
        assert ca.classify_role_name("Estudiante EF") == "student"
        assert ca.classify_role_name("Student") == "student"
        assert ca.classify_role_name("Alumno oyente") == "student"

    def test_roles_de_profesor(self):
        assert ca.classify_role_name("Instructor") == "instructor"
        assert ca.classify_role_name("Profesor titular") == "instructor"
        assert ca.classify_role_name("Coordinador Administrativo") == "instructor"
        assert ca.classify_role_name("Facilitador") == "instructor"

    def test_estudiante_gana_si_hay_ambiguedad(self):
        # "Estudiante" se evalúa primero: jamás escalar por otra palabra
        assert ca.classify_role_name("Estudiante administrador de grupo") == "student"

    def test_desconocido_o_vacio_no_clasifica(self):
        assert ca.classify_role_name("") is None
        assert ca.classify_role_name(None) is None
        assert ca.classify_role_name("Guest") is None


def _patch_common(monkeypatch, session, role_name):
    """Simula sesión válida y el rol devuelto por Brightspace para el curso."""
    monkeypatch.setattr(ca, "_require_token_from_request", lambda r: ("tok", None))
    monkeypatch.setattr(ca, "_session_from_request", lambda r: session)

    async def fake_role(headers, uid, ou):
        return role_name

    monkeypatch.setattr(ca, "_role_name_in_course", fake_role)


class TestRoleNameInCourse:
    """Parsing real de la respuesta de Brightspace (regresión: el endpoint
    LP enrollments trae el rol en Role.Name, no en Access.ClasslistRoleName)."""

    async def test_lee_el_rol_desde_Role_Name(self, monkeypatch):
        async def fake_get(url, headers, params=None):
            return 200, {
                "Items": [
                    {"OrgUnit": {"Id": 45559}, "Role": {"Id": 109, "Name": "Instructor"},
                     "Access": {"IsActive": True}},  # sin ClasslistRoleName
                ],
                "PagingInfo": {"HasMoreItems": False, "Bookmark": "x"},
            }
        monkeypatch.setattr(ca, "_bs_get_cached", fake_get)
        rn = await ca._role_name_in_course({}, "412", 45559)
        assert rn == "Instructor"
        assert ca.classify_role_name(rn) == "instructor"

    async def test_fallback_a_ClasslistRoleName(self, monkeypatch):
        async def fake_get(url, headers, params=None):
            return 200, {
                "Items": [
                    {"OrgUnit": {"Id": 77}, "Access": {"ClasslistRoleName": "Estudiante EF"}},
                ],
                "PagingInfo": {"HasMoreItems": False},
            }
        monkeypatch.setattr(ca, "_bs_get_cached", fake_get)
        rn = await ca._role_name_in_course({}, "1", 77)
        assert ca.classify_role_name(rn) == "student"

    async def test_no_matriculado_devuelve_None(self, monkeypatch):
        async def fake_get(url, headers, params=None):
            return 200, {"Items": [{"OrgUnit": {"Id": 999}, "Role": {"Name": "Instructor"}}],
                         "PagingInfo": {"HasMoreItems": False}}
        monkeypatch.setattr(ca, "_bs_get_cached", fake_get)
        rn = await ca._role_name_in_course({}, "1", 45559)
        assert rn is None


class TestRequireCourseStaff:
    async def test_instructor_del_curso_pasa(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, "Instructor")
        access = await ca.require_course_staff(object(), 123)
        assert access["isInstructor"] is True
        assert access["userId"] == "42"

    async def test_estudiante_recibe_403(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, "Estudiante EF")
        with pytest.raises(HTTPException) as ei:
            await ca.require_course_staff(object(), 123)
        assert ei.value.status_code == 403

    async def test_no_matriculado_recibe_403(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, None)
        with pytest.raises(HTTPException) as ei:
            await ca.require_course_staff(object(), 123)
        assert ei.value.status_code == 403

    async def test_rol_desconocido_no_escala_a_profesor(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, "Auditor externo")
        with pytest.raises(HTTPException) as ei:
            await ca.require_course_staff(object(), 123)
        assert ei.value.status_code == 403

    async def test_superadmin_por_id_pasa_sin_matricula(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "999"}, None)
        monkeypatch.setattr(ca, "_SUPERADMIN_IDS", {"999"})
        access = await ca.require_course_staff(object(), 123)
        assert access["isSuperAdmin"] is True
        assert access["isInstructor"] is True

    async def test_superadmin_por_rol_de_sistema_pasa(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "7", "role": "Super Administrator"}, None)
        access = await ca.require_course_staff(object(), 123)
        assert access["isSuperAdmin"] is True

    async def test_sin_sesion_recibe_401(self, monkeypatch):
        monkeypatch.setattr(
            ca, "_require_token_from_request", lambda r: (None, object())
        )
        with pytest.raises(HTTPException) as ei:
            await ca.require_course_staff(object(), 123)
        assert ei.value.status_code == 401


class TestRequireCourseMember:
    async def test_estudiante_matriculado_pasa(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, "Estudiante EF")
        access = await ca.require_course_member(object(), 123)
        assert access["isMember"] is True
        assert access["isInstructor"] is False

    async def test_rol_desconocido_matriculado_pasa_como_estudiante(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, "Auditor externo")
        access = await ca.require_course_member(object(), 123)
        assert access["isMember"] is True
        assert access["role"] == "student"

    async def test_no_matriculado_recibe_403(self, monkeypatch):
        _patch_common(monkeypatch, {"user_id": "42"}, None)
        with pytest.raises(HTTPException) as ei:
            await ca.require_course_member(object(), 123)
        assert ei.value.status_code == 403
