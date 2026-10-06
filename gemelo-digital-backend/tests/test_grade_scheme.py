"""Esquema de calificación del curso: lectura (default → setup) y conversión
de porcentaje al rango del esquema."""
import pytest

from app.services import grade_scheme as gs

ESQUEMA_0_5 = {
    "Id": 77, "Name": "Escala 0-5", "ShortName": "0-5",
    "Ranges": [
        {"PercentStart": 60, "Symbol": "Aprobado", "AssignedValue": 3.0, "Colour": "#00AA00"},
        {"PercentStart": 0, "Symbol": "Reprobado", "AssignedValue": 0.0, "Colour": "#CC0000"},
        {"PercentStart": 90, "Symbol": "Excelente", "AssignedValue": 4.5, "Colour": "#0055FF"},
    ],
}


class FakeBS:
    base_url = "https://bs.test"
    grade_version = "1.99"

    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.urls = []

    async def _request_json(self, method, url, **kw):
        self.urls.append(url)
        for sufijo, valor in self.respuestas.items():
            if url.endswith(sufijo):
                if isinstance(valor, Exception):
                    raise valor
                return valor
        raise RuntimeError(f"Brightspace error 404 en {url}: no encontrado")


@pytest.fixture(autouse=True)
def _limpiar_cache():
    gs._CACHE.clear()
    yield
    gs._CACHE.clear()


def test_normaliza_y_ordena_rangos():
    s = gs.normalize_scheme(ESQUEMA_0_5)
    assert [r["start"] for r in s["ranges"]] == [0.0, 60.0, 90.0]
    assert s["ranges"][1] == {"start": 60.0, "symbol": "Aprobado", "assignedValue": 3.0, "color": "#00AA00"}


def test_esquema_sin_rangos_es_none():
    assert gs.normalize_scheme({"Id": 1, "Ranges": []}) is None
    assert gs.normalize_scheme(None) is None


@pytest.mark.parametrize("pct,simbolo", [(0, "Reprobado"), (59.9, "Reprobado"), (60, "Aprobado"),
                                          (89.99, "Aprobado"), (90, "Excelente"), (100, "Excelente")])
def test_rango_para_porcentaje(pct, simbolo):
    s = gs.normalize_scheme(ESQUEMA_0_5)
    assert gs.range_for_pct(s, pct)["symbol"] == simbolo


def test_rango_sin_dato_es_none():
    s = gs.normalize_scheme(ESQUEMA_0_5)
    assert gs.range_for_pct(s, None) is None
    assert gs.range_for_pct(None, 50) is None


async def test_usa_la_ruta_default_si_existe():
    bs = FakeBS({"/grades/schemes/default": ESQUEMA_0_5})
    r = await gs.fetch_course_grade_scheme(bs, 10)
    assert r["available"] and r["source"] == "default" and r["scheme"]["id"] == 77
    assert bs.urls == ["https://bs.test/d2l/api/le/1.99/10/grades/schemes/default"]


async def test_fallback_a_setup_si_no_hay_ruta_default():
    bs = FakeBS({"/grades/setup/": {"DefaultGradeSchemeId": 77}, "/grades/schemes/77": ESQUEMA_0_5})
    r = await gs.fetch_course_grade_scheme(bs, 10)
    assert r["available"] and r["source"] == "setup"


async def test_sin_esquema_no_es_error():
    bs = FakeBS({"/grades/setup/": {"DefaultGradeSchemeId": None}})
    r = await gs.fetch_course_grade_scheme(bs, 10)
    assert r == {"available": False, "source": None, "scheme": None, "reason": "no_scheme"}


async def test_403_reporta_falta_de_permiso_sin_reintentar_setup():
    bs = FakeBS({"/grades/schemes/default": RuntimeError("Brightspace error 403 en x: forbidden")})
    r = await gs.fetch_course_grade_scheme(bs, 10)
    assert r["available"] is False and r["reason"] == "forbidden"
    assert len(bs.urls) == 1


async def test_usa_cache():
    bs = FakeBS({"/grades/schemes/default": ESQUEMA_0_5})
    await gs.fetch_course_grade_scheme(bs, 10)
    await gs.fetch_course_grade_scheme(bs, 10)
    assert len(bs.urls) == 1


def test_esquema_porcentual_generico_no_es_informativo():
    pct = {"Id": 0, "Name": "Percentage", "Ranges": [
        {"PercentStart": 0, "Symbol": "", "AssignedValue": 0},
        {"PercentStart": 50, "Symbol": "", "AssignedValue": 50},
    ]}
    assert gs.normalize_scheme(pct)["informative"] is False
    assert gs.normalize_scheme(ESQUEMA_0_5)["informative"] is True
