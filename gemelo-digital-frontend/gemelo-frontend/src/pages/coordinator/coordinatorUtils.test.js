import { describe, it, expect } from "vitest";
import {
  aggregateProfessors, buildCourseCsv, buildProfessorCsv, buildRiskCsv, chunk,
  computeKpis, courseMetrics, extractSemester, filterCourses, sortProfessors,
  studentsAtRiskInMultipleCourses, pickDefaultSemester, weightedAverage,
} from "./coordinatorUtils";
import { escCsv } from "../../utils/export";

const corte = (period, status, pct = 0) => ({ period, status, pct, studentsTotal: 10, studentsWithGrade: Math.round(pct / 10) });

const summary = ({ teachers = [], cortes = [], topics = 10, pending = 0, days = null, risk = {}, extra = {} } = {}) => ({
  teachers,
  gradeReporting: { usesCortes: cortes.length > 0, gradeItemsTotal: 8, cortes, missingCortes: [] },
  content: { modules: 3, topics, topicsByType: { file: topics, link: 0, lti: 0, other: 0 } },
  activities: { assignments: 2, quizzes: 1, discussions: 1, notes: [] },
  gradingBacklog: { pending, oldestPendingDays: days, foldersWithPending: pending ? 1 : 0 },
  risk: { studentsCount: 10, avgCurrentPerformancePct: 70, avgCoveragePct: 80, riskDistribution: {}, studentsAtRisk: [], ...risk },
  ...extra,
});

const ana = { userId: 1, name: "Ana Pérez", email: "ana@cesa.edu.co", lastAccess: "2026-10-01T00:00:00Z" };
const beto = { userId: 2, name: "Beto Ruiz", email: null, lastAccess: null };

describe("extractSemester", () => {
  it("prefiere semesterCode / semesterName del catálogo sobre el nombre", () => {
    expect(extractSemester({ semesterCode: "202610", name: "202510 - Finanzas" })).toBe("202610");
    expect(extractSemester({ semesterName: "Periodo 2026-2", name: "Finanzas" })).toBe("202620");
  });
  it("usa la regex del nombre como respaldo", () => {
    expect(extractSemester({ name: "202530 - Mercadeo" })).toBe("202530");
    expect(extractSemester({ name: "Sin período" })).toBeNull();
  });
});

describe("filterCourses / chunk", () => {
  it("filtra por período, categoría y texto", () => {
    const cat = [
      { id: 1, name: "202610 PREGRADO Finanzas", code: "FIN1" },
      { id: 2, name: "202610 POSGRADO Mercadeo", code: "MER" },
      { id: 3, name: "202520 PREGRADO Finanzas II", code: "FIN2" },
    ];
    expect(filterCourses(cat, { semester: "202610" }).map((c) => c.id)).toEqual([1, 2]);
    expect(filterCourses(cat, { category: "PREGRADO", search: "fin" }).map((c) => c.id)).toEqual([1, 3]);
  });
  it("parte en bloques", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("courseMetrics", () => {
  it("estado de carga y de error (incluye forbidden)", () => {
    expect(courseMetrics(undefined).state).toBe("loading");
    expect(courseMetrics({ error: "forbidden" })).toEqual({ state: "error", error: "Sin permiso para ver este curso" });
    expect(courseMetrics({ error: "boom" }).error).toBe("boom");
  });
  it("tolera secciones con error", () => {
    const m = courseMetrics(summary({ extra: { content: { error: "x" }, risk: { error: "y" } } }));
    expect(m.state).toBe("ok");
    expect(m.topics).toBeNull();
    expect(m.students).toBeNull();
    expect(m.sectionErrors).toEqual(["content", "risk"]);
  });
});

describe("weightedAverage", () => {
  it("pondera por número de estudiantes", () => {
    const avg = weightedAverage([{ avgPct: 90, students: 30 }, { avgPct: 40, students: 10 }, { avgPct: null, students: 50 }], "avgPct");
    expect(avg).toBeCloseTo(77.5);
    expect(weightedAverage([], "avgPct")).toBeNull();
  });
});

describe("aggregateProfessors", () => {
  const courses = [
    { id: 10, name: "Finanzas", code: "F" },
    { id: 11, name: "Mercadeo", code: "M" },
    { id: 12, name: "Sin profe", code: "S" },
    { id: 13, name: "Fallido", code: "X" },
  ];
  const summaries = {
    10: summary({ teachers: [ana], cortes: [corte(1, "publicado", 100), corte(2, "vencido_sin_reporte", 20)], pending: 4, days: 9, topics: 3 }),
    11: summary({ teachers: [{ ...ana, lastAccess: "2026-10-03T00:00:00Z" }, beto], cortes: [corte(1, "parcial", 50)], pending: 1, days: 2 }),
    12: summary({ teachers: [] }),
    13: { error: "forbidden" },
  };

  it("agrupa cursos por profesor y resume cortes, backlog y contenido", () => {
    const { professors, coursesWithoutTeacher } = aggregateProfessors(courses, summaries);
    expect(professors).toHaveLength(2);
    const a = professors.find((p) => p.userId === 1);
    expect(a.courses.map((c) => c.id)).toEqual([10, 11]);
    expect(a.lastAccess).toBe("2026-10-03T00:00:00Z");
    expect(a.cortesTotal).toBe(3);
    expect(a.cortesPublished).toBe(1);
    expect(a.cortesLate).toBe(1);
    expect(a.onTimePct).toBeCloseTo(33.33, 1);
    expect(a.backlogTotal).toBe(5);
    expect(a.backlogMaxDays).toBe(9);
    expect(a.lowContentCourses).toBe(1);
    expect(a.courses[0].cortes[3]).toBeNull();
    const b = professors.find((p) => p.userId === 2);
    expect(b.courses).toHaveLength(1);
    expect(coursesWithoutTeacher.map((x) => x.course.id)).toEqual([12, 13]);
    expect(coursesWithoutTeacher[1].error).toBe("Sin permiso para ver este curso");
  });

  it("ordena por retraso, pendientes y nombre", () => {
    const { professors } = aggregateProfessors(courses, summaries);
    expect(sortProfessors(professors, "retraso")[0].name).toBe("Ana Pérez");
    expect(sortProfessors(professors, "pendientes")[0].name).toBe("Ana Pérez");
    expect(sortProfessors(professors, "nombre").map((p) => p.name)).toEqual(["Ana Pérez", "Beto Ruiz"]);
  });
});

describe("studentsAtRiskInMultipleCourses", () => {
  it("agrupa por estudiante y filtra los que están en 2+ cursos", () => {
    const courses = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
    const s = (list) => summary({ risk: { studentsAtRisk: list } });
    const summaries = {
      1: s([{ userId: 7, displayName: "Eva", currentPerformancePct: 30 }, { userId: 8, displayName: "Leo", currentPerformancePct: 45 }]),
      2: s([{ userId: 7, displayName: "Eva", currentPerformancePct: 40 }, { userId: 9, displayName: "Ian" }]),
      3: s([{ userId: 7, displayName: "Eva", currentPerformancePct: 20 }, { userId: 8, displayName: "Leo", currentPerformancePct: 10 }]),
    };
    const out = studentsAtRiskInMultipleCourses(courses, summaries, 2);
    expect(out.map((x) => [x.name, x.courses.length])).toEqual([["Eva", 3], ["Leo", 2]]);
    expect(out[0].courses[1]).toEqual({ id: 2, name: "B", pct: 40, risk: null });
  });

  it("ignora cursos con error o sin sección de riesgo", () => {
    const out = studentsAtRiskInMultipleCourses([{ id: 1 }, { id: 2 }], { 1: { error: "x" }, 2: summary({ extra: { risk: { error: "y" } } }) });
    expect(out).toEqual([]);
  });
});

describe("computeKpis", () => {
  it("cuenta cursos, profesores, cortes, backlog y riesgo únicos", () => {
    const courses = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
    const summaries = {
      1: summary({ teachers: [ana], cortes: [corte(1, "publicado", 95)], pending: 2, risk: { studentsCount: 30, avgCurrentPerformancePct: 90, studentsAtRisk: [{ userId: 5 }] } }),
      2: summary({ teachers: [ana, beto], cortes: [corte(1, "pendiente")], pending: 3, risk: { studentsCount: 10, avgCurrentPerformancePct: 40, studentsAtRisk: [{ userId: 5 }, { userId: 6 }] } }),
      3: { error: "boom" },
    };
    const k = computeKpis(courses, summaries);
    expect(k.courses).toBe(3);
    expect(k.loaded).toBe(2);
    expect(k.failed).toBe(1);
    expect(k.professors).toBe(2);
    expect(k.cortesPct).toBe(50);
    expect(k.backlog).toBe(5);
    expect(k.atRiskUnique).toBe(2);
    expect(k.avgPct).toBeCloseTo(77.5);
  });
});

describe("CSV builders", () => {
  it("filas de profesores: una por curso con estado de cortes", () => {
    const { professors } = aggregateProfessors(
      [{ id: 1, name: "=HYPERLINK(\"x\")", code: "F" }],
      { 1: summary({ teachers: [ana], cortes: [corte(1, "publicado", 92)], pending: 1, days: 3 }) },
    );
    const { headers, rows } = buildProfessorCsv(professors);
    expect(headers[0]).toBe("Profesor");
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(0, 2)).toEqual(["Ana Pérez", "ana@cesa.edu.co"]);
    expect(rows[0][5]).toBe("Publicado (92%)");
    expect(rows[0][6]).toBe("—");
    expect(rows[0].length).toBe(headers.length);
    // El nombre del curso es texto no confiable: escCsv lo neutraliza
    expect(escCsv(rows[0][3]).startsWith("\"'=")).toBe(true);
  });

  it("filas de cursos incluyen errores y métricas", () => {
    const { headers, rows } = buildCourseCsv(
      [{ id: 1, name: "A", code: "a", semesterCode: "202610" }, { id: 2, name: "B" }],
      { 1: summary({ teachers: [ana, beto], cortes: [corte(2, "parcial", 40)] }), 2: { error: "forbidden" } },
    );
    expect(rows[0].length).toBe(headers.length);
    expect(rows[0][2]).toBe("2026-I");
    expect(rows[0][3]).toBe("Ana Pérez; Beto Ruiz");
    expect(rows[0][5]).toBe(7);
    expect(rows[0][10]).toBe("Parcial (40%)");
    expect(rows[1][rows[1].length - 1]).toBe("Error: Sin permiso para ver este curso");
  });

  it("filas de riesgo multi-curso", () => {
    const { rows } = buildRiskCsv([{ userId: 7, name: "Eva", courses: [{ name: "A", pct: 30 }, { name: "B", pct: null }] }]);
    expect(rows).toEqual([["Eva", "7", 2, "A (30.0%); B (sin nota)"]]);
  });
});

describe("semestres reales de Brightspace", () => {
  it("acepta cualquier código AAAA+2 dígitos del campo semesterCode", () => {
    for (const code of ["202600", "202615", "202631", "202660"]) {
      expect(extractSemester({ semesterCode: code, name: "Curso sin código" })).toBe(code);
    }
  });
  it("por defecto elige el semestre más reciente de pregrado/posgrado", () => {
    const sems = [
      { id: 42989, code: "202660", name: "202660 CESA EMPRESARIAL" },
      { id: 45558, code: "202620", name: "202620 2DO PREGRADO / POSGRADO" },
      { id: 40081, code: "202610", name: "202610 1ER PREGRADO / POSGRADO" },
    ];
    expect(pickDefaultSemester(sems).id).toBe(45558);
    expect(pickDefaultSemester([{ id: 1, name: "202650 CESA FOR LIFE" }]).id).toBe(1);
    expect(pickDefaultSemester([])).toBeNull();
  });
});
