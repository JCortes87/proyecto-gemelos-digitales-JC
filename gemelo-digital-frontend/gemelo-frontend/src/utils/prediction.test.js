// Tests de la proyección de nota final (utils/prediction.js): escenarios
// esperado / mejora / caída, límites de aprobación (60) y reprobación (50),
// confianza = cobertura y agregado por curso.
import { describe, it, expect } from "vitest";
import { predictFinalGrade, predictClassFailures } from "./prediction";

describe("predictFinalGrade", () => {
  it("devuelve null sin estudiante o sin datos utilizables", () => {
    expect(predictFinalGrade(null)).toBeNull();
    expect(predictFinalGrade(undefined)).toBeNull();
    expect(predictFinalGrade({})).toBeNull();
    expect(predictFinalGrade({ currentPerformancePct: 80 })).toBeNull();
    expect(predictFinalGrade({ currentPerformancePct: "abc", coveragePct: 50 })).toBeNull();
    expect(predictFinalGrade({ currentPerformancePct: 80, coveragePct: "n/a" })).toBeNull();
  });

  it("sin cobertura (0 o negativa) no predice", () => {
    expect(predictFinalGrade({ currentPerformancePct: 80, coveragePct: 0 })).toBeNull();
    expect(predictFinalGrade({ currentPerformancePct: 80, coveragePct: -10 })).toBeNull();
  });

  it("calcula los tres escenarios sobre el peso restante", () => {
    // done = 80 * 0.4 = 32; resta 60 %.
    const p = predictFinalGrade({ currentPerformancePct: 80, coveragePct: 40 });
    expect(p).toEqual({
      expectedPct: 80,          // 32 + 80 * 0.6
      expectedGrade10: 8,
      improvePct: 89,           // 32 + 95 * 0.6
      dropsPct: 71,             // 32 + 65 * 0.6
      confidence: 40,
      willPass: true,
      willFail: false,
      borderline: false,
    });
  });

  it("la mejora se topa en 100 y la caída en 0", () => {
    const alto = predictFinalGrade({ currentPerformancePct: 95, coveragePct: 50 });
    expect(alto.improvePct).toBe(97.5);   // 47.5 + 100 * 0.5
    expect(alto.dropsPct).toBe(87.5);     // 47.5 + 80 * 0.5
    const bajo = predictFinalGrade({ currentPerformancePct: 10, coveragePct: 50 });
    expect(bajo.dropsPct).toBe(5);        // 5 + 0 * 0.5
    expect(bajo.improvePct).toBe(17.5);   // 5 + 25 * 0.5
  });

  it("con cobertura completa los tres escenarios coinciden", () => {
    const p = predictFinalGrade({ currentPerformancePct: 72.5, coveragePct: 100 });
    expect(p.expectedPct).toBe(72.5);
    expect(p.improvePct).toBe(72.5);
    expect(p.dropsPct).toBe(72.5);
    expect(p.confidence).toBe(100);
  });

  it("la confianza se limita a 100 y se redondea", () => {
    expect(predictFinalGrade({ currentPerformancePct: 50, coveragePct: 130 }).confidence).toBe(100);
    expect(predictFinalGrade({ currentPerformancePct: 50, coveragePct: 33.6 }).confidence).toBe(34);
  });

  it("redondea a un decimal", () => {
    const p = predictFinalGrade({ currentPerformancePct: 33.333, coveragePct: 30 });
    expect(p.expectedPct).toBe(33.3);
    expect(p.expectedGrade10).toBe(3.3);
  });

  it("acepta valores numéricos en string (como llegan de la API)", () => {
    const p = predictFinalGrade({ currentPerformancePct: "70", coveragePct: "50" });
    expect(p.expectedPct).toBe(70);
    expect(p.willPass).toBe(true);
  });

  it.each([
    [100, { willPass: true, borderline: false, willFail: false }],
    [60, { willPass: true, borderline: false, willFail: false }],       // límite de aprobación inclusivo
    [59.99, { willPass: false, borderline: true, willFail: false }],
    [50, { willPass: false, borderline: true, willFail: false }],       // 50 es "en riesgo", no reprobado
    [49.99, { willPass: false, borderline: false, willFail: true }],
    [0, { willPass: false, borderline: false, willFail: true }],
  ])("clasifica %s%% como aprueba/limite/reprueba", (pct, flags) => {
    const p = predictFinalGrade({ currentPerformancePct: pct, coveragePct: 100 });
    expect({ willPass: p.willPass, borderline: p.borderline, willFail: p.willFail }).toEqual(flags);
  });

  it("las tres banderas son mutuamente excluyentes", () => {
    for (let pct = 0; pct <= 100; pct += 0.5) {
      const p = predictFinalGrade({ currentPerformancePct: pct, coveragePct: 60 });
      expect([p.willPass, p.borderline, p.willFail].filter(Boolean)).toHaveLength(1);
    }
  });

  // BUG (src/utils/prediction.js:11): Number(null) === 0, así que un
  // estudiante con cobertura pero SIN rendimiento calculado
  // (currentPerformancePct: null → "pending" en el backend, p. ej. ítems
  // calificados sin puntaje numérico) se proyecta con 0 % y aparece como
  // "reprobará". Debería devolver null igual que con undefined/NaN.
  it("rendimiento null (pendiente) no se proyecta como 0 %", () => {
    expect(predictFinalGrade({ currentPerformancePct: null, coveragePct: 40 })).toBeNull();
  });
});

describe("predictClassFailures", () => {
  it("tolera entradas que no son arreglo", () => {
    for (const v of [null, undefined, {}, "x"]) {
      expect(predictClassFailures(v)).toEqual({ willFail: [], borderline: [], willPass: [], total: 0 });
    }
  });

  it("agrupa por escenario y descarta estudiantes sin predicción", () => {
    const rows = [
      { id: 1, currentPerformancePct: 90, coveragePct: 50 },
      { id: 2, currentPerformancePct: 55, coveragePct: 50 },
      { id: 3, currentPerformancePct: 30, coveragePct: 50 },
      { id: 4, currentPerformancePct: 40, coveragePct: 0 },   // sin cobertura
      { id: 5 },                                              // sin datos
      { id: 6, currentPerformancePct: 60, coveragePct: 10 },
    ];
    const out = predictClassFailures(rows);
    expect(out.total).toBe(4);
    expect(out.willPass.map((x) => x.student.id)).toEqual([1, 6]);
    expect(out.borderline.map((x) => x.student.id)).toEqual([2]);
    expect(out.willFail.map((x) => x.student.id)).toEqual([3]);
    // Conserva la referencia al estudiante y la predicción completa.
    expect(out.willFail[0].student).toBe(rows[2]);
    expect(out.willFail[0].pred.expectedPct).toBe(30);
  });
});
