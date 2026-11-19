"""Tests del resumen de actividad docente (vista de coordinador).

Todo con fakes: ni red ni base de datos.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.services import coordinator_summary as cs

NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


# ── Clasificación de estado de corte ─────────────────────────────────────────
class TestCorteStatus:
    def test_publicado_con_90_por_ciento(self):
        assert cs.classify_corte_status(90.0, None, NOW) == "publicado"
        assert cs.classify_corte_status(100.0, NOW - timedelta(days=3), NOW) == "publicado"

    def test_pendiente_sin_notas(self):
        assert cs.classify_corte_status(0.0, None, NOW) == "pendiente"
        assert cs.classify_corte_status(None, NOW + timedelta(days=5), NOW) == "pendiente"

    def test_parcial(self):
        assert cs.classify_corte_status(45.0, None, NOW) == "parcial"
        assert cs.classify_corte_status(89.9, NOW + timedelta(days=1), NOW) == "parcial"

    def test_vencido_sin_reporte(self):
        past = NOW - timedelta(days=2)
        assert cs.classify_corte_status(50.0, past, NOW) == "vencido_sin_reporte"
        assert cs.classify_corte_status(0.0, past, NOW) == "vencido_sin_reporte"

    def test_fecha_sin_zona_se_trata_como_utc(self):
        naive_past = datetime(2026, 10, 1, 0, 0)
        assert cs.classify_corte_status(10.0, naive_past, NOW) == "vencido_sin_reporte"


class TestGradeValues:
    def test_has_grade_value(self):
        assert cs.has_grade_value({"GradeValue": {"PointsNumerator": 0}})
        assert cs.has_grade_value({"GradeValue": {"DisplayedGrade": "4.5"}})
        assert not cs.has_grade_value({"GradeValue": None})
        assert not cs.has_grade_value({"GradeValue": {"DisplayedGrade": " - "}})
        assert cs.has_grade_value({"PointsNumerator": 3})  # GradeValue plano

    def test_summarize_corte_solo_cuenta_estudiantes(self):
        rows = [
            {"User": {"Identifier": "1"}, "GradeValue": {"PointsNumerator": 4}},
            {"User": {"Identifier": "2"}, "GradeValue": None},
            {"User": {"Identifier": "99"}, "GradeValue": {"PointsNumerator": 5}},  # profesor
        ]
        out = cs.summarize_corte(1, {"Id": 10, "Name": "Corte 1"}, rows, {1, 2}, None, NOW)
        assert out["studentsTotal"] == 2
        assert out["studentsWithGrade"] == 1
        assert out["pct"] == 50.0
        assert out["status"] == "parcial"
        assert out["itemId"] == 10 and out["period"] == 1

    def test_pick_corte_items_prefiere_visible(self):
        items = [
            {"Id": 1, "Name": "Corte 1", "IsHidden": True},
            {"Id": 2, "Name": "Corte 1 (30%)", "IsHidden": False},
            {"Id": 3, "Name": "Taller 1"},
            {"Id": 4, "Name": "Segundo corte"},
        ]
        picked = cs.pick_corte_items(items)
        assert picked[1]["Id"] == 2
        assert picked[2]["Id"] == 4
        assert 3 not in picked

    def test_student_ids_filtra_roles(self):
        cl = [
            {"Identifier": "1", "ClasslistRoleDisplayName": "Estudiante"},
            {"Identifier": "2", "ClasslistRoleDisplayName": "Instructor"},
        ]
        assert cs.student_ids_from_classlist(cl) == {1}
        # Sin campo de rol: todos cuentan como estudiantes
        assert cs.student_ids_from_classlist([{"Identifier": "5"}, {"Identifier": "6"}]) == {5, 6}


# ── Contenido ────────────────────────────────────────────────────────────────
class TestContent:
    def test_count_content_toc(self):
        toc = {"Modules": [
            {"Title": "M1", "LastModifiedDate": "2026-09-01T00:00:00Z", "Topics": [
                {"TypeIdentifier": "File", "Url": "/content/a.pdf"},
                {"TypeIdentifier": "Link", "Url": "https://youtube.com/x"},
                {"TypeIdentifier": "Link", "ActivityType": 7, "Url": "/d2l/le/lti/1"},
                {"TypeIdentifier": "Link", "ActivityType": 4, "Url": "/d2l/lms/quizzing/1"},
                {"TypeIdentifier": "File", "IsHidden": True,
                 "LastModifiedDate": "2026-09-20T10:00:00Z"},
            ], "Modules": [
                {"Title": "M1.1", "Topics": [{"ActivityType": 1}]},
            ]},
            {"Title": "Oculto", "IsHidden": True, "Topics": [{"TypeIdentifier": "File"}]},
        ]}
        out = cs.count_content_toc(toc)
        assert out["modules"] == 2
        assert out["hiddenModules"] == 1
        assert out["topics"] == 5
        assert out["hiddenTopics"] == 2
        assert out["topicsByType"] == {"file": 2, "link": 1, "lti": 1, "other": 1}
        assert out["lastModified"] == "2026-09-20T10:00:00Z"

    def test_toc_vacio(self):
        out = cs.count_content_toc({})
        assert out["modules"] == 0 and out["topics"] == 0 and out["lastModified"] is None


# ── Backlog de calificación ──────────────────────────────────────────────────
class TestBacklog:
    def test_antiguedad_del_mas_antiguo(self):
        status = {"items": [
            {"ok": True, "pendingGrading": [
                {"id": "1", "submittedAt": "2026-09-26T12:00:00Z"},
                {"id": "2", "submittedAt": "2026-10-04T12:00:00Z"},
            ]},
            {"ok": True, "pendingGrading": []},
            {"ok": False, "pendingGrading": [{"id": "3", "submittedAt": "2020-01-01T00:00:00Z"}]},
            {"ok": True, "pendingGrading": [{"id": "4"}]},
        ], "partial": True}
        out = cs.grading_backlog_from_status(status, NOW)
        assert out["pending"] == 3
        assert out["foldersWithPending"] == 2
        assert out["oldestPendingDays"] == 10
        assert out["partial"] is True

    def test_sin_pendientes(self):
        out = cs.grading_backlog_from_status({"items": []}, NOW)
        assert out["pending"] == 0 and out["oldestPendingDays"] is None


# ── Profesores ───────────────────────────────────────────────────────────────
def test_teachers_con_ultimo_acceso():
    instructors = [{"Identifier": "7", "DisplayName": "Ana Pérez", "RoleName": "Instructor"}]
    classlist = [{"Identifier": "7", "Email": "ana@cesa.edu.co", "LastAccessed": "2026-10-05T08:00:00Z"}]
    out = cs.teachers_from(instructors, classlist)
    assert out == [{
        "userId": 7, "name": "Ana Pérez", "email": "ana@cesa.edu.co",
        "roleName": "Instructor", "lastAccess": "2026-10-05T08:00:00Z",
    }]


def test_teachers_fallback_al_classlist():
    classlist = [
        {"Identifier": "7", "DisplayName": "Ana", "ClasslistRoleDisplayName": "Profesor"},
        {"Identifier": "8", "DisplayName": "Beto", "ClasslistRoleDisplayName": "Estudiante"},
    ]
    out = cs.teachers_from([], classlist)
    assert [t["userId"] for t in out] == [7]
    assert out[0]["lastAccess"] is None


# ── Agregación completa con un source falso ──────────────────────────────────
class FakeSource:
    def __init__(self, fail=()):
        self.fail = set(fail)
        self.calls = {}

    def _hit(self, name):
        self.calls[name] = self.calls.get(name, 0) + 1
        if name in self.fail:
            raise RuntimeError(f"Brightspace error 403 en /{name}")

    async def instructors(self, ou):
        self._hit("instructors")
        return [{"Identifier": "100", "DisplayName": "Prof X", "RoleName": "Instructor"}]

    async def classlist(self, ou):
        self._hit("classlist")
        return [
            {"Identifier": "100", "ClasslistRoleDisplayName": "Instructor", "LastAccessed": "2026-10-01T00:00:00Z"},
            {"Identifier": "1", "ClasslistRoleDisplayName": "Estudiante"},
            {"Identifier": "2", "ClasslistRoleDisplayName": "Estudiante"},
        ]

    async def grade_items(self, ou):
        self._hit("grade_items")
        return [
            {"Id": 11, "Name": "Corte 1"},
            {"Id": 12, "Name": "Corte 2", "AssociatedTool": {"ToolId": 2000, "ToolItemId": 5}},
            {"Id": 13, "Name": "Quiz 1"},
        ]

    async def grade_values_for_item(self, ou, item_id):
        self._hit("values")
        if item_id == 11:
            return [{"User": {"Identifier": "1"}, "GradeValue": {"PointsNumerator": 4}},
                    {"User": {"Identifier": "2"}, "GradeValue": {"PointsNumerator": 3}}]
        return []

    async def content_toc(self, ou):
        self._hit("content")
        return {"Modules": [{"Topics": [{"TypeIdentifier": "File"}]}]}

    async def dropbox_folders(self, ou):
        self._hit("folders")
        return [{"Id": 5, "Name": "Entrega", "DueDate": "2026-10-01T00:00:00Z"},
                {"Id": 6, "Name": "Oculta", "IsHidden": True}]

    async def quizzes(self, ou):
        self._hit("quizzes")
        return [{"QuizId": 1}, {"QuizId": 2}]

    async def discussion_forums(self, ou):
        self._hit("forums")
        return [{"ForumId": 1}]

    async def grading_status(self, ou):
        self._hit("grading")
        return {"items": [{"ok": True, "pendingGrading": [{"id": "1", "submittedAt": "2026-09-28T12:00:00Z"}]}]}

    async def overview(self, ou):
        self._hit("overview")
        return {
            "studentsCount": 2,
            "courseGradebook": {"avgCurrentPerformancePct": 71.5, "avgCoveragePct": 60.0},
            "globalRiskDistribution": {"alto": 1, "medio": 0, "bajo": 1, "pending": 0},
            "studentsAtRisk": [{"userId": 2, "displayName": "Beto", "risk": "alto",
                                "currentPerformancePct": 30.0, "coveragePct": 40}],
        }


class TestBuildSummary:
    async def test_resumen_completo(self):
        src = FakeSource()
        out = await cs.build_course_summary(src, 555, now=NOW)
        assert out["orgUnitId"] == 555
        assert out["generatedAt"]
        assert out["teachers"][0]["lastAccess"] == "2026-10-01T00:00:00Z"

        gr = out["gradeReporting"]
        assert gr["usesCortes"] is True
        assert gr["gradeItemsTotal"] == 3
        assert gr["missingCortes"] == [3]
        c1, c2 = gr["cortes"]
        assert (c1["period"], c1["pct"], c1["status"]) == (1, 100.0, "publicado")
        # Corte 2 ligado a la carpeta 5 que venció el 1-oct sin notas
        assert c2["dueDate"] == "2026-10-01T00:00:00Z"
        assert c2["status"] == "vencido_sin_reporte"

        assert out["content"]["topics"] == 1
        assert out["activities"]["assignments"] == 1
        assert out["activities"]["quizzes"] == 2
        assert out["activities"]["discussions"] == 1
        assert out["gradingBacklog"]["pending"] == 1
        assert out["gradingBacklog"]["oldestPendingDays"] == 8
        assert out["risk"]["studentsCount"] == 2
        assert out["risk"]["studentsAtRisk"] == [
            {"userId": 2, "displayName": "Beto", "risk": "alto", "currentPerformancePct": 30.0}
        ]
        # Lecturas compartidas: una sola vez por resumen
        assert src.calls["classlist"] == 1
        assert src.calls["folders"] == 1

    async def test_curso_sin_cortes(self):
        class NoCortes(FakeSource):
            async def grade_items(self, ou):
                return [{"Id": 1, "Name": "Taller"}]
        out = await cs.build_course_summary(NoCortes(), 1, now=NOW)
        assert out["gradeReporting"]["usesCortes"] is False
        assert out["gradeReporting"]["cortes"] == []
        assert out["gradeReporting"]["missingCortes"] == []

    async def test_fallo_parcial_aislado(self):
        src = FakeSource(fail={"content", "grading", "overview"})
        out = await cs.build_course_summary(src, 1, now=NOW)
        assert "error" in out["content"] and "403" in out["content"]["error"]
        assert "error" in out["gradingBacklog"]
        assert "error" in out["risk"]
        # El resto sigue disponible
        assert out["gradeReporting"]["usesCortes"] is True
        assert isinstance(out["teachers"], list)
        assert out["activities"]["quizzes"] == 2

    async def test_fallo_del_valor_de_un_corte_no_tumba_la_seccion(self):
        class OneFails(FakeSource):
            async def grade_values_for_item(self, ou, item_id):
                if item_id == 12:
                    raise RuntimeError("boom")
                return await super().grade_values_for_item(ou, item_id)
        out = await cs.build_course_summary(OneFails(), 1, now=NOW)
        cortes = out["gradeReporting"]["cortes"]
        assert cortes[0]["status"] == "publicado"
        assert cortes[1]["status"] == "error" and "error" in cortes[1]

    async def test_corte_de_formula_usa_valores_por_estudiante(self):
        """La ruta por ítem responde 400 con ítems de tipo Fórmula (verificado en
        cesa); entonces se leen los valores de cada estudiante una sola vez."""
        class Formula(FakeSource):
            async def grade_values_for_item(self, ou, item_id):
                raise RuntimeError("Brightspace error 400 en /grades/x/values/: Bad Request")

            async def grade_values_for_user(self, ou, user_id):
                self._hit("user_values")
                if user_id == 1:
                    return [{"GradeObjectIdentifier": "11", "PointsNumerator": 4},
                            {"GradeObjectIdentifier": "12", "PointsNumerator": 2}]
                return [{"GradeObjectIdentifier": "11", "PointsNumerator": 3}]
        src = Formula()
        out = await cs.build_course_summary(src, 1, now=NOW)
        cortes = {c["period"]: c for c in out["gradeReporting"]["cortes"]}
        assert cortes[1]["studentsWithGrade"] == 2 and cortes[1]["status"] == "publicado"
        assert cortes[2]["studentsWithGrade"] == 1 and cortes[2]["pct"] == 50.0
        # Una lectura por estudiante, compartida entre los dos cortes.
        assert src.calls["user_values"] == 2

    async def test_corte_de_formula_sin_lecturas_es_error_no_pendiente(self):
        class TodoFalla(FakeSource):
            async def grade_values_for_item(self, ou, item_id):
                raise RuntimeError("Brightspace error 400 en x")

            async def grade_values_for_user(self, ou, user_id):
                raise RuntimeError("Brightspace error 403 en y")
        out = await cs.build_course_summary(TodoFalla(), 1, now=NOW)
        assert all(c["status"] == "error" for c in out["gradeReporting"]["cortes"])

    async def test_timeout_de_seccion(self):
        class Slow(FakeSource):
            async def content_toc(self, ou):
                await asyncio.sleep(5)
        out = await cs.build_course_summary(Slow(), 1, now=NOW, section_timeout=0.05)
        assert "tiempo de espera" in out["content"]["error"]


# ── Caché ────────────────────────────────────────────────────────────────────
class TestCache:
    @pytest.fixture(autouse=True)
    def _limpia(self):
        cs.clear_summary_cache()
        yield
        cs.clear_summary_cache()

    async def test_cachea_10_minutos_por_curso(self):
        src = FakeSource()
        t = [1000.0]
        clock = lambda: t[0]  # noqa: E731
        a = await cs.get_course_summary(src, 1, clock=clock)
        b = await cs.get_course_summary(src, 1, clock=clock)
        assert a["fromCache"] is False and b["fromCache"] is True
        assert src.calls["content"] == 1
        await cs.get_course_summary(src, 2, clock=clock)  # otra clave
        assert src.calls["content"] == 2
        t[0] += cs.SUMMARY_TTL_S + 1
        c = await cs.get_course_summary(src, 1, clock=clock)
        assert c["fromCache"] is False
        assert src.calls["content"] == 3

    async def test_refresh_ignora_cache(self):
        src = FakeSource()
        await cs.get_course_summary(src, 1)
        await cs.get_course_summary(src, 1, refresh=True)
        assert src.calls["content"] == 2

    async def test_no_cachea_resumenes_con_errores(self):
        src = FakeSource(fail={"content"})
        await cs.get_course_summary(src, 1)
        await cs.get_course_summary(src, 1)
        assert src.calls["content"] == 2

    async def test_la_cache_devuelve_copia(self):
        src = FakeSource()
        a = await cs.get_course_summary(src, 1)
        a["content"]["topics"] = 999
        b = await cs.get_course_summary(src, 1)
        assert b["content"]["topics"] == 1


# ── Lote ─────────────────────────────────────────────────────────────────────
class TestBatch:
    async def test_salta_cursos_no_autorizados(self):
        seen = []

        async def authorize(ou):
            if ou == 3:
                raise RuntimeError("403")
            return ou != 2

        async def summarize(ou):
            seen.append(ou)
            return {"orgUnitId": ou}

        out = await cs.build_summaries_batch([1, 2, 3, 1], authorize=authorize, summarize=summarize)
        assert out["items"] == {
            "1": {"orgUnitId": 1},
            "2": {"error": "forbidden"},
            "3": {"error": "forbidden"},
        }
        assert seen == [1]

    async def test_error_de_un_curso_no_tumba_el_lote(self):
        async def authorize(ou):
            return True

        async def summarize(ou):
            if ou == 2:
                raise RuntimeError("boom")
            return {"orgUnitId": ou}

        out = await cs.build_summaries_batch([1, 2], authorize=authorize, summarize=summarize)
        assert out["items"]["1"] == {"orgUnitId": 1}
        assert "error" in out["items"]["2"]

    async def test_concurrencia_acotada(self):
        active = [0]
        peak = [0]

        async def authorize(ou):
            return True

        async def summarize(ou):
            active[0] += 1
            peak[0] = max(peak[0], active[0])
            await asyncio.sleep(0.01)
            active[0] -= 1
            return {}

        await cs.build_summaries_batch(range(12), authorize=authorize, summarize=summarize, concurrency=4)
        assert peak[0] <= 4


# ── Rutas montadas ───────────────────────────────────────────────────────────
def test_rutas_montadas_bajo_gemelo():
    from app.api.gemelo import router
    paths = {getattr(r, "path", "") for r in router.routes}
    assert "/gemelo/coordinator/course/{orgUnitId}/summary" in paths
    assert "/gemelo/coordinator/summary/batch" in paths


# ── Cliente: valores de un grade object (paginado) ───────────────────────────
async def test_list_grade_values_for_item_pagina(monkeypatch):
    import httpx
    from app.services import brightspace_client as bc

    base = "https://bs.test"
    monkeypatch.setattr(bc.settings, "brightspace_base_url", base)
    vistos = []

    def handler(request: httpx.Request) -> httpx.Response:
        vistos.append(str(request.url))
        if "bookmark" not in str(request.url) and len(vistos) == 1:
            return httpx.Response(200, json={
                "Objects": [{"User": {"Identifier": "1"}, "GradeValue": None}],
                "Next": f"{base}/d2l/api/le/1.99/7/grades/9/values/?bookmark=abc",
            })
        if len(vistos) == 2:
            return httpx.Response(200, json={
                "Items": [{"User": {"Identifier": "2"}, "GradeValue": {"PointsNumerator": 1}}],
                "PagingInfo": {"HasMoreItems": True, "Bookmark": "zz"},
            })
        return httpx.Response(200, json={"Items": [], "PagingInfo": {"HasMoreItems": False}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(bc, "get_http_client", lambda: client)
    bs = bc.BrightspaceClient(tokens={"access_token": "t"})
    rows = await bs.list_grade_values_for_item(7, 9)
    assert [r["User"]["Identifier"] for r in rows] == ["1", "2"]
    assert len(vistos) == 3
    assert "/grades/9/values/" in vistos[0]
    assert "bookmark=zz" in vistos[2]

def test_riesgo_sin_notas_no_es_promedio_cero_ni_riesgo():
    ov = {
        "studentsCount": 3,
        "globalRiskDistribution": {"alto": 0, "medio": 1, "bajo": 0, "pending": 2},
        "courseGradebook": {"avgCurrentPerformancePct": 40.0, "avgCoveragePct": 10.0},
        "studentsAtRisk": [
            {"userId": 1, "displayName": "A", "risk": "medio", "currentPerformancePct": 55.0},
            {"userId": 2, "displayName": "B", "risk": "pending", "currentPerformancePct": None},
        ],
    }
    r = cs.risk_from_overview(ov)
    assert [s["userId"] for s in r["studentsAtRisk"]] == [1]
    assert r["avgCurrentPerformancePct"] == 40.0 and r["studentsWithoutGrades"] == 2

    sin_notas = {**ov, "globalRiskDistribution": {"pending": 3},
                 "courseGradebook": {"avgCurrentPerformancePct": 0, "avgCoveragePct": 0}}
    r2 = cs.risk_from_overview(sin_notas)
    assert r2["avgCurrentPerformancePct"] is None and r2["avgCoveragePct"] is None
