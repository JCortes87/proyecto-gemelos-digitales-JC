"""Tests unitarios de los helpers puros de riesgo, escalas y filtros de notas:
- risk_utils: nivel de riesgo, promedio ponderado y roll-up a macrocompetencias.
- scale_utils: bandas critico/observacion/solido, lectura de umbrales y escala,
  lookups en la estructura de rúbricas de Brightspace.
- grade_filters: predicados de "calificado" / "cero".
- text_utils: detección de ítems "Corte" (se excluyen de los promedios).
- gemelo/calc y gemelo/due_dates: % por outcome, prescripción y vencimientos.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services import grade_filters as gf
from app.services import risk_utils as ru
from app.services import scale_utils as su
from app.services.gemelo.calc import CalcMixin
from app.services.gemelo.due_dates import _due_date_for_grade_item, _fill_dropbox_due_dates
from app.services.text_utils import _extract_corte_period, _is_corte_item


# ──────────────────────────────────────────────────────────────────────────
# risk_from_pct
# ──────────────────────────────────────────────────────────────────────────
class TestRiesgoDesdePct:
    @pytest.mark.parametrize(
        "pct, esperado",
        [
            (0, "alto"),
            (49.99, "alto"),
            (50, "medio"),        # el umbral critical es exclusivo (<)
            (69.99, "medio"),
            (70, "bajo"),         # el umbral watch es exclusivo (<)
            (100, "bajo"),
            (120, "bajo"),
            (-5, "alto"),
        ],
    )
    def test_umbrales_por_defecto(self, pct, esperado):
        assert ru.risk_from_pct(pct) == esperado

    def test_sin_datos_es_pending(self):
        assert ru.risk_from_pct(None) == "pending"

    def test_valor_no_numerico_es_pending(self):
        assert ru.risk_from_pct("abc") == "pending"
        assert ru.risk_from_pct(object()) == "pending"

    def test_acepta_string_numerico(self):
        assert ru.risk_from_pct("55.5") == "medio"

    def test_umbrales_personalizados(self):
        thr = {"critical": 40.0, "watch": 60.0}
        assert ru.risk_from_pct(39.9, thr) == "alto"
        assert ru.risk_from_pct(40, thr) == "medio"
        assert ru.risk_from_pct(59.9, thr) == "medio"
        assert ru.risk_from_pct(60, thr) == "bajo"

    def test_umbrales_parciales_usan_default_en_la_clave_faltante(self):
        # Solo critical definido: watch cae al default 70.
        assert ru.risk_from_pct(65, {"critical": 30}) == "medio"
        assert ru.risk_from_pct(25, {"critical": 30}) == "alto"

    def test_dict_de_umbrales_vacio_usa_defaults(self):
        assert ru.risk_from_pct(45, {}) == "alto"

    def test_mismo_criterio_que_status_from_pct(self):
        # risk_from_pct y status_from_pct deben clasificar en las mismas bandas.
        mapa = {"alto": "critico", "medio": "observacion", "bajo": "solido", "pending": "pending"}
        thr = {"critical": 50.0, "watch": 70.0}
        for pct in (None, 0, 49.9, 50, 69.9, 70, 99):
            assert mapa[ru.risk_from_pct(pct, thr)] == su.status_from_pct(pct, thr)


# ──────────────────────────────────────────────────────────────────────────
# weighted_avg
# ──────────────────────────────────────────────────────────────────────────
class TestPromedioPonderado:
    def test_lista_vacia_es_cero(self):
        assert ru.weighted_avg([]) == 0.0

    def test_pesos_en_cero_no_dividen_por_cero(self):
        assert ru.weighted_avg([(80.0, 0.0), (60.0, 0.0)]) == 0.0

    def test_pesos_que_suman_100(self):
        assert ru.weighted_avg([(100.0, 30.0), (50.0, 70.0)]) == pytest.approx(65.0)

    def test_pesos_que_no_suman_100_se_normalizan(self):
        # 80*1 + 60*3 = 260 / 4 = 65
        assert ru.weighted_avg([(80.0, 1.0), (60.0, 3.0)]) == pytest.approx(65.0)
        # Pesos que suman 150 también se normalizan por su suma.
        assert ru.weighted_avg([(90.0, 100.0), (60.0, 50.0)]) == pytest.approx(80.0)

    def test_un_solo_item(self):
        assert ru.weighted_avg([(42.0, 7.0)]) == pytest.approx(42.0)


# ──────────────────────────────────────────────────────────────────────────
# Macrocompetencias
# ──────────────────────────────────────────────────────────────────────────
class TestMacroCompetencias:
    @pytest.mark.parametrize(
        "code, esperado",
        [
            ("C.1.3", "C1"),
            ("RA.2.3", "RA2"),
            ("PE.1", "PE1"),
            ("C.10.2", "C10"),
            ("  C.1.1  ", "C1"),
            ("Z1O1DOR3", "Z1O1DOR3"),   # RA auto-mapeado: pasa como su propia macro
            ("RUB-11483", "RUB-11483"),
            ("", None),
            (None, None),
            ("   ", None),
        ],
    )
    def test_macro_code_from_unit(self, code, esperado):
        assert ru._macro_code_from_unit(code) == esperado

    def test_peso_de_unidad_sin_config_es_1(self):
        assert ru._get_unit_weight_from_cfg(None, "C.1.1") == 1.0
        assert ru._get_unit_weight_from_cfg({}, "C.1.1") == 1.0
        assert ru._get_unit_weight_from_cfg({"rubrics": []}, "C.1.1") == 1.0

    def test_peso_de_unidad_desde_dict(self):
        cfg = {"rubrics": {
            "r1": {"learningUnits": {"C.1.1": {"weight": 3}}},
            "r2": {"learningUnits": {"C.2.1": {"weight": "0.5"}}},
        }}
        assert ru._get_unit_weight_from_cfg(cfg, "C.1.1") == 3.0
        assert ru._get_unit_weight_from_cfg(cfg, "C.2.1") == 0.5
        assert ru._get_unit_weight_from_cfg(cfg, "C.9.9") == 1.0

    def test_peso_de_unidad_desde_objeto_tipo_pydantic(self):
        cfg = SimpleNamespace(rubrics={
            "r1": SimpleNamespace(learningUnits={"C.1.1": SimpleNamespace(weight=2.5)}),
        })
        assert ru._get_unit_weight_from_cfg(cfg, "C.1.1") == 2.5

    def test_peso_invalido_cae_a_1(self):
        cfg = {"rubrics": {"r1": {"learningUnits": {"C.1.1": {"weight": "pesado"}}}}}
        assert ru._get_unit_weight_from_cfg(cfg, "C.1.1") == 1.0

    def test_build_macro_units_ponderado_y_ordenado(self):
        cfg = {"rubrics": {"r1": {"learningUnits": {
            "C.1.1": {"weight": 3}, "C.1.2": {"weight": 1},
        }}}}
        units = [
            {"code": "C.2.1", "pct": 45.0},
            {"code": "C.1.1", "pct": 80.0},
            {"code": "C.1.2", "pct": 40.0},
            {"code": "", "pct": 100.0},          # sin código: se descarta
        ]
        out = ru.build_macro_units(units, cfg, {"critical": 50.0, "watch": 70.0})
        assert [m["code"] for m in out] == ["C1", "C2"]
        c1, c2 = out
        # (80*3 + 40*1) / 4 = 70 → justo en el umbral watch → solido
        assert c1["pct"] == 70.0
        assert c1["status"] == "solido"
        assert c1["children"] == ["C.1.1", "C.1.2"]
        assert c2["pct"] == 45.0 and c2["status"] == "critico"

    def test_build_macro_units_redondea_a_un_decimal(self):
        units = [{"code": "C.1.1", "pct": 33.33}, {"code": "C.1.2", "pct": 33.34},
                 {"code": "C.1.3", "pct": 33.34}]
        out = ru.build_macro_units(units, None, {})
        assert out[0]["pct"] == 33.3

    def test_build_macro_units_pct_ausente_cuenta_como_cero(self):
        # Comportamiento actual: una unidad sin pct se trata como 0 (no "pending").
        out = ru.build_macro_units([{"code": "C.1.1", "pct": None}], None, {})
        assert out[0]["pct"] == 0.0
        assert out[0]["status"] == "critico"

    def test_build_macro_units_vacio(self):
        assert ru.build_macro_units([], None, {}) == []


# ──────────────────────────────────────────────────────────────────────────
# scale_utils
# ──────────────────────────────────────────────────────────────────────────
class TestStatusDesdePct:
    @pytest.mark.parametrize(
        "pct, esperado",
        [(None, "pending"), ("x", "pending"), (0, "critico"), (49.999, "critico"),
         (50, "observacion"), (69.9, "observacion"), (70, "solido"), ("85", "solido")],
    )
    def test_bandas_por_defecto(self, pct, esperado):
        assert su.status_from_pct(pct, {}) == esperado

    def test_umbrales_del_curso(self):
        thr = {"critical": 60.0, "watch": 80.0}
        assert su.status_from_pct(59, thr) == "critico"
        assert su.status_from_pct(60, thr) == "observacion"
        assert su.status_from_pct(80, thr) == "solido"


class TestLecturaDeUmbrales:
    def test_sin_config_devuelve_defaults(self):
        assert su._get_thresholds(None, None) == {"critical": 50.0, "watch": 70.0}
        assert su._get_thresholds(..., ...) == {"critical": 50.0, "watch": 70.0}

    def test_desde_dict(self):
        cfg = {"scale": {"thresholds": {"critical": 40, "watch": 65}}}
        assert su._get_thresholds(cfg, None) == {"critical": 40, "watch": 65}

    def test_desde_objeto(self):
        cfg = SimpleNamespace(scale=SimpleNamespace(thresholds={"critical": 30, "watch": 60}))
        assert su._get_thresholds(cfg, None) == {"critical": 30, "watch": 60}

    def test_course_cfg_gana_sobre_legacy(self):
        course = {"scale": {"thresholds": {"critical": 45, "watch": 75}}}
        legacy = {"scale": {"thresholds": {"critical": 10, "watch": 20}}}
        assert su._get_thresholds(course, legacy) == {"critical": 45, "watch": 75}

    def test_umbrales_vacios_caen_al_legacy(self):
        course = {"scale": {"thresholds": {}}}
        legacy = {"scale": {"thresholds": {"critical": 35, "watch": 55}}}
        assert su._get_thresholds(course, legacy) == {"critical": 35, "watch": 55}


class TestLecturaDeEscala:
    def test_defaults_institucionales(self):
        assert su._get_scale_settings(None) == ("level_points", 4.0)
        assert su._get_scale_settings(...) == ("level_points", 4.0)
        assert su._get_scale_settings({}) == ("level_points", 4.0)

    def test_desde_dict(self):
        cfg = {"scale": {"type": "criterion_max_points", "maxLevelPoints": "5"}}
        assert su._get_scale_settings(cfg) == ("criterion_max_points", 5.0)

    def test_max_level_points_invalido_conserva_default(self):
        cfg = {"scale": {"type": "level_points", "maxLevelPoints": "muchos"}}
        assert su._get_scale_settings(cfg) == ("level_points", 4.0)

    def test_desde_objeto(self):
        cfg = SimpleNamespace(scale=SimpleNamespace(type="level_points", maxLevelPoints=3))
        assert su._get_scale_settings(cfg) == ("level_points", 3.0)


RUBRICA = {
    "CriteriaGroups": [
        {
            "Levels": [
                {"Id": 1, "Points": 1},
                {"Id": "2", "Points": 3},
                {"Id": 3, "Points": None},
                {"Id": "basura", "Points": 9},
            ],
            "Criteria": [
                {"Id": 10, "Cells": [{"Points": 1}, {"Points": 4}, {"Points": None}]},
                {"Id": 11, "Cells": []},
            ],
        },
        {"Levels": [{"Id": 99, "Points": 50}]},  # solo se mira el primer grupo
    ]
}


class TestLookupsDeRubrica:
    @pytest.mark.parametrize(
        "level_id, esperado",
        [(1, 1.0), (2, 3.0), ("2", 3.0), (3, None), (99, None), (None, None), ("x", None)],
    )
    def test_lookup_level_points(self, level_id, esperado):
        assert su._lookup_level_points(RUBRICA, level_id) == esperado

    def test_lookup_level_points_rubrica_vacia(self):
        assert su._lookup_level_points({}, 1) is None
        assert su._lookup_level_points({"CriteriaGroups": []}, 1) is None

    @pytest.mark.parametrize(
        "criterion_id, esperado",
        [(10, 4.0), ("10", 4.0), (11, None), (12, None), (None, None), ("x", None)],
    )
    def test_lookup_criterion_max_points(self, criterion_id, esperado):
        assert su._lookup_criterion_max_points(RUBRICA, criterion_id) == esperado


# ──────────────────────────────────────────────────────────────────────────
# grade_filters
# ──────────────────────────────────────────────────────────────────────────
class TestFiltrosDeNotas:
    @pytest.mark.parametrize(
        "valor, esperado",
        [
            ({}, False),
            (None, False),
            ("no-dict", False),
            ({"PointsNumerator": 8, "PointsDenominator": 10}, True),
            ({"PointsNumerator": 0, "PointsDenominator": 10}, True),   # un 0 sí está calificado
            ({"PointsNumerator": 5, "PointsDenominator": 0}, False),
            ({"PointsNumerator": 5, "PointsDenominator": "x"}, False),
            ({"WeightedNumerator": 2, "WeightedDenominator": 5}, True),
            ({"WeightedNumerator": 2, "WeightedDenominator": 0}, False),
            ({"PointsNumerator": None, "PointsDenominator": 10,
              "WeightedNumerator": 1, "WeightedDenominator": 4}, True),
            ({"DisplayedGrade": "A"}, True),
            ({"LastModified": "2026-01-01T00:00:00Z"}, True),
            ({"DisplayedGrade": "", "Comments": "sin nota"}, False),
        ],
    )
    def test_is_graded_value(self, valor, esperado):
        assert gf._is_graded_value(valor) is esperado

    @pytest.mark.parametrize(
        "num, disp, esperado",
        [(0, None, True), ("0.0", None, True), (None, "0%", True), (None, " 0 ", True),
         (None, "0.0%", True), (None, "10%", False), (7, "70%", False), ("abc", "", False),
         (None, None, False)],
    )
    def test_is_grade_zero(self, num, disp, esperado):
        assert gf._is_grade_zero(num, disp) is esperado

    @pytest.mark.parametrize(
        "num, den, esperado",
        [(0, 10, True), (5, 10, True), (None, 10, False), (5, 0, False),
         (5, None, False), (5, "x", False), ("5", "10", True)],
    )
    def test_is_graded(self, num, den, esperado):
        assert gf._is_graded(num, den) is esperado


# ──────────────────────────────────────────────────────────────────────────
# Ítems "Corte" (totales de corte: se muestran pero NO se promedian)
# ──────────────────────────────────────────────────────────────────────────
class TestItemsCorte:
    @pytest.mark.parametrize(
        "nombre, periodo",
        [
            ("Corte 1", 1),
            ("corte 2", 2),
            ("Primer corte", 1),
            ("Segundo Corte", 2),
            ("Segunda cohorte", 2),
            ("Tercer corte", 3),
            ("3er corte", 3),
            ("Corte II", 2),
            ("Corte III: total", 3),
            ("C1", 1),
            ("Nota C2 - final", 2),
            ("Cohorte 3", 3),
            ("<p>Corte 2</p>", 2),
            ("Corte N° 1", 1),
        ],
    )
    def test_detecta_cortes_y_su_periodo(self, nombre, periodo):
        assert _is_corte_item(nombre) is True
        assert _extract_corte_period(nombre) == periodo

    @pytest.mark.parametrize(
        "nombre",
        ["Taller 1", "Parcial 2", "Ejercicio 3", "C.1.1 Ensayo", "Caso 1", "Quiz final", "", None],
    )
    def test_no_confunde_items_normales(self, nombre):
        assert _is_corte_item(nombre) is False
        assert _extract_corte_period(nombre) is None


# ──────────────────────────────────────────────────────────────────────────
# gemelo/calc
# ──────────────────────────────────────────────────────────────────────────
class _Calc(CalcMixin):
    pass


class TestCalcMixin:
    def test_riesgo_delegado(self):
        c = _Calc()
        assert c._risk_from_performance(49, {"critical": 50, "watch": 70}) == "alto"
        assert c._risk_from_global(None) == "pending"
        assert c._risk_from_global(70) == "bajo"

    def test_pct_level_points_con_score(self):
        assert _Calc()._pct_from_outcome({"Score": 3}, RUBRICA, "level_points", 4.0) == 75.0

    def test_pct_level_points_sin_score_usa_el_nivel(self):
        co = {"Score": None, "LevelId": 2}
        assert _Calc()._pct_from_outcome(co, RUBRICA, "level_points", 4.0) == 75.0

    def test_pct_level_points_sin_score_ni_nivel_es_cero(self):
        assert _Calc()._pct_from_outcome({"LevelId": 99}, RUBRICA, "level_points", 4.0) == 0.0

    def test_pct_level_points_max_cero_no_divide(self):
        assert _Calc()._pct_from_outcome({"Score": 3}, RUBRICA, "level_points", 0) == 0.0

    def test_pct_criterion_max_points(self):
        co = {"Score": 2, "CriterionId": 10}
        assert _Calc()._pct_from_outcome(co, RUBRICA, "criterion_max_points", 4.0) == 50.0

    def test_pct_criterion_desconocido_es_cero(self):
        co = {"Score": 2, "CriterionId": 404}
        assert _Calc()._pct_from_outcome(co, RUBRICA, "criterion_max_points", 4.0) == 0.0

    def test_prescripcion_por_debajo_del_umbral(self):
        cfg = {"prescription": {"rules": [
            {"when": {"code": "C1", "belowPct": 60},
             "do": {"routeId": "r1", "title": "Refuerzo", "actions": ["leer"]}},
            {"when": {"code": "C2", "belowPct": 60},
             "do": {"routeId": "r2", "title": "Otro", "actions": []}},
        ]}}
        units = [{"code": "C1", "pct": 50.0}, {"code": "C2", "pct": 60.0}]
        out = _Calc()._apply_prescription(cfg, units, {"watch": 70.0})
        # C2 = 60 no está estrictamente por debajo de 60
        assert len(out) == 1
        assert out[0]["routeId"] == "r1"
        assert out[0]["priority"] == ["C1"]
        assert out[0]["actions"] == ["leer"]
        assert out[0]["successCriteria"] == "Subir C1 a ≥70.0% en la siguiente evidencia."

    def test_prescripcion_sin_reglas(self):
        c = _Calc()
        assert c._apply_prescription({}, [], {}) == []
        assert c._apply_prescription({"prescription": {"rules": []}}, [], {}) == []
        assert c._apply_prescription(SimpleNamespace(prescription=None), [], {}) == []

    def test_prescripcion_regla_incompleta_se_ignora(self):
        cfg = {"prescription": {"rules": [{"when": {"code": "C1", "belowPct": 90}}]}}
        assert _Calc()._apply_prescription(cfg, [{"code": "C1", "pct": 10}], {}) == []


# ──────────────────────────────────────────────────────────────────────────
# gemelo/due_dates
# ──────────────────────────────────────────────────────────────────────────
class TestFechasDeVencimiento:
    def test_fill_dropbox_due_dates(self):
        out = {}
        _fill_dropbox_due_dates({"Items": [
            {"Id": 5, "DueDate": "2026-03-01T10:00:00Z"},
            {"Id": "6", "EndDate": "2026-04-01T00:00:00.000Z"},
            {"Id": 7, "StartDate": "2026-02-01T00:00:00Z"},
            {"Id": 8},
            {"Id": None, "DueDate": "2026-03-01T10:00:00Z"},
            "basura",
        ]}, out)
        assert set(out) == {5, 6, 7, 8}
        assert out[5] == datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
        assert out[6] == datetime(2026, 4, 1, tzinfo=timezone.utc)
        assert out[7] == datetime(2026, 2, 1, tzinfo=timezone.utc)
        assert out[8] is None

    def test_fill_dropbox_due_dates_acepta_lista_y_basura(self):
        out = {}
        _fill_dropbox_due_dates([{"Id": 1, "DueDate": "no-fecha"}], out)
        assert out == {1: None}
        _fill_dropbox_due_dates(None, out)
        assert out == {1: None}

    def test_due_date_desde_dropbox_asociado(self):
        dt = datetime(2026, 5, 1, tzinfo=timezone.utc)
        it = {"AssociatedTool": {"ToolId": 2000, "ToolItemId": "5"}, "DueDate": "2020-01-01T00:00:00Z"}
        assert _due_date_for_grade_item(it, {5: dt}) == dt

    def test_due_date_dropbox_sin_fecha_no_usa_la_del_item(self):
        it = {"AssociatedTool": {"ToolId": 2000, "ToolItemId": 9}, "DueDate": "2020-01-01T00:00:00Z"}
        assert _due_date_for_grade_item(it, {}) is None

    def test_due_date_dropbox_id_invalido(self):
        it = {"AssociatedTool": {"ToolId": 2000, "ToolItemId": "x"}}
        assert _due_date_for_grade_item(it, {}) is None

    def test_due_date_desde_el_item(self):
        it = {"DueDate": "2026-06-01T00:00:00Z"}
        assert _due_date_for_grade_item(it, {}) == datetime(2026, 6, 1, tzinfo=timezone.utc)
        assert _due_date_for_grade_item({"EndDate": "2026-06-02T00:00:00Z"}, {}).day == 2
        assert _due_date_for_grade_item({"dueDate": "2026-06-03T00:00:00Z"}, {}).day == 3
        assert _due_date_for_grade_item({}, {}) is None
