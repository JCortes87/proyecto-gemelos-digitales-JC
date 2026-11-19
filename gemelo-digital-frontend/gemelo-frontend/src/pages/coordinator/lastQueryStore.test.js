import { describe, it, expect } from "vitest";
import {
  RECORD_VERSION, buildRecord, createIndexedDbBackend, createLastQueryStore, createMemoryBackend,
  missingSummaryIds, normalizeRecord,
} from "./lastQueryStore";
import { fmtRelative } from "./coordinatorUtils";

const COURSES = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
const FILTERS = { semester: "6606", semesterLabel: "202620 Pregrado", category: "all", search: "" };

describe("lastQueryStore", () => {
  it("missingSummaryIds cuenta como faltantes los que no tienen resumen o tienen error", () => {
    const sums = { 1: { generatedAt: "x" }, 2: { error: "forbidden" } };
    expect(missingSummaryIds(COURSES, sums)).toEqual(["2", "3"]);
    expect(missingSummaryIds(COURSES, {})).toEqual(["1", "2", "3"]);
  });

  it("buildRecord guarda solo los cursos de la consulta y marca completo", () => {
    const rec = buildRecord({
      userId: 42, filters: FILTERS, courses: COURSES,
      summaries: { 1: { a: 1 }, 2: { error: "x" }, 99: { a: 2 } }, now: Date.UTC(2026, 9, 7),
    });
    expect(rec).toMatchObject({ version: RECORD_VERSION, userId: "42", savedAt: "2026-10-07T00:00:00.000Z", complete: false });
    expect(Object.keys(rec.summaries).sort()).toEqual(["1", "2"]);
    expect(rec.filters).toEqual(FILTERS);
    const full = buildRecord({ userId: 42, filters: FILTERS, courses: COURSES, summaries: { 1: {}, 2: {}, 3: {} } });
    expect(full.complete).toBe(true);
  });

  it("guarda, lee y borra por usuario con un backend en memoria", async () => {
    const backend = createMemoryBackend();
    const store = createLastQueryStore(backend);
    expect(store.available).toBe(true);
    const rec = buildRecord({ userId: 42, filters: FILTERS, courses: COURSES, summaries: { 1: { ok: true } } });
    expect(await store.save(rec)).toBe(true);
    expect(backend.map.has("user:42")).toBe(true);

    const back = await store.load(42);
    expect(back.courses).toHaveLength(3);
    expect(back.summaries).toEqual({ 1: { ok: true } });
    expect(back.filters.semesterLabel).toBe("202620 Pregrado");

    // Otro usuario en el mismo navegador no ve la consulta.
    expect(await store.load(7)).toBeNull();
    // Sin usuario no se guarda ni se lee nada.
    expect(await store.load(null)).toBeNull();
    expect(await store.save({ ...rec, userId: null })).toBe(false);

    expect(await store.clear(42)).toBe(true);
    expect(await store.load(42)).toBeNull();
  });

  it("una nueva consulta reemplaza la anterior", async () => {
    const store = createLastQueryStore(createMemoryBackend());
    await store.save(buildRecord({ userId: 1, filters: FILTERS, courses: COURSES, summaries: {} }));
    await store.save(buildRecord({ userId: 1, filters: { ...FILTERS, semester: "7000" }, courses: [COURSES[0]], summaries: {} }));
    const rec = await store.load(1);
    expect(rec.filters.semester).toBe("7000");
    expect(rec.courses).toHaveLength(1);
  });

  it("ignora registros de otra versión, de otro usuario o vacíos", () => {
    const rec = buildRecord({ userId: 5, filters: FILTERS, courses: COURSES, summaries: {} });
    expect(normalizeRecord(rec, 5)).not.toBeNull();
    expect(normalizeRecord({ ...rec, version: 999 }, 5)).toBeNull();
    expect(normalizeRecord(rec, 6)).toBeNull();
    expect(normalizeRecord({ ...rec, courses: [] }, 5)).toBeNull();
    expect(normalizeRecord("basura", 5)).toBeNull();
  });

  it("sin IndexedDB (o si falla) degrada a no-op sin lanzar", async () => {
    expect(createIndexedDbBackend(undefined)).toBeNull();
    const none = createLastQueryStore(null);
    expect(none.available).toBe(false);
    expect(await none.load(1)).toBeNull();
    expect(await none.save(buildRecord({ userId: 1, filters: FILTERS, courses: COURSES, summaries: {} }))).toBe(false);
    expect(await none.clear(1)).toBe(false);

    const boom = () => Promise.reject(new Error("QuotaExceededError"));
    const broken = createLastQueryStore({ get: boom, put: boom, delete: boom });
    expect(await broken.load(1)).toBeNull();
    expect(await broken.save(buildRecord({ userId: 1, filters: FILTERS, courses: COURSES, summaries: {} }))).toBe(false);
    expect(await broken.clear(1)).toBe(false);
  });

  it("si abrir IndexedDB lanza (modo privado), las operaciones no fallan", async () => {
    const idb = { open: () => { throw new Error("SecurityError"); } };
    const store = createLastQueryStore(createIndexedDbBackend(idb));
    expect(await store.load(1)).toBeNull();
  });
});

describe("fmtRelative", () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  it("formatea en español", () => {
    expect(fmtRelative(new Date(now - 10_000).toISOString(), now)).toBe("hace unos segundos");
    expect(fmtRelative(new Date(now - 5 * 60_000).toISOString(), now)).toBe("hace 5 min");
    expect(fmtRelative(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("hace 3 h");
    expect(fmtRelative(new Date(now - 86_400_000).toISOString(), now)).toBe("hace 1 día");
    expect(fmtRelative(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("hace 2 días");
    expect(fmtRelative(new Date(now - 30 * 86_400_000).toISOString(), now)).toMatch(/^el /);
    expect(fmtRelative(null, now)).toBe("—");
  });
});
