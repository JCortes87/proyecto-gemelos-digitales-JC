import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, mapLimit } from "../../utils/api";
import { isStudentRole } from "../../utils/roles";
import { chunk } from "./coordinatorUtils";

export const BATCH_SIZE = 10;        // cursos por solicitud al endpoint batch
const PARALLEL_REQUESTS = 2;         // solicitudes batch simultáneas

/**
 * Catálogo de cursos del coordinador (con fallback a my-course-offerings,
 * igual que el panel de profesor).
 */
export function useCoordinatorCatalog() {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        let items = [];
        try {
          const data = await apiGet("/brightspace/courses/enrolled?active_only=false&limit=500");
          items = (Array.isArray(data?.items) ? data.items : []).filter((c) => !isStudentRole(c.roleName));
        } catch {
          const data = await apiGet("/brightspace/my-course-offerings?active_only=false&limit=50");
          items = (Array.isArray(data?.items) ? data.items : []).map((c) => ({ ...c, roleName: "Instructor" }));
        }
        if (alive) setCatalog(items);
      } catch {
        if (alive) setCatalog([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  return { catalog, loading };
}

/**
 * Semestres reales de Brightspace (unidades organizativas tipo 5) desde 2025,
 * ordenados del más reciente al más antiguo: {id, code, name}.
 */
export function useCoordinatorSemesters() {
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    apiGet("/brightspace/semesters?min_year=2025")
      .then((data) => { if (alive) setSemesters(Array.isArray(data?.items) ? data.items : []); })
      .catch(() => { if (alive) setSemesters([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { semesters, loading };
}

/** Cursos de un semestre (limitados a los del coordinador; todos si es superadmin). */
export async function fetchSemesterCourses(semesterId) {
  const data = await apiGet(`/gemelo/coordinator/courses?semesterId=${encodeURIComponent(semesterId)}`);
  return Array.isArray(data?.items) ? data.items : [];
}

function errorMessage(e) {
  const st = e?.status;
  if (st === 429) return "Demasiadas solicitudes; intenta de nuevo en un minuto";
  if (st === 401) return "Sesión expirada";
  if (st) return `No se pudo cargar el resumen (HTTP ${st})`;
  return "No se pudo cargar el resumen";
}

/**
 * Carga resúmenes con POST /gemelo/coordinator/summary/batch en bloques de
 * BATCH_SIZE cursos. `summaries` queda indexado por id (string); un curso
 * fallido queda como {error} para que la UI muestre su estado de error.
 *
 * `load(ids, {reset, refresh})`:
 * - reset (por defecto true): vacía todos los resúmenes antes de cargar.
 *   Con reset:false solo se quitan los de `ids` (se ven "cargando").
 * - refresh: re-escanea saltando la caché del servidor (`refresh: true` en el
 *   cuerpo). No borra nada: los datos viejos se ven hasta que llega el nuevo
 *   resultado de cada curso. Si el nuevo falla y el viejo era válido, se
 *   conserva el viejo marcado con `refreshError`.
 *
 * `hydrate(summaries)` restaura resúmenes guardados sin tocar la red.
 */
export function useCoordinatorSummaries() {
  const [summaries, setSummaries] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const runRef = useRef(0);

  useEffect(() => () => { runRef.current += 1; }, []);

  const load = useCallback(async (ids, { reset = true, refresh = false } = {}) => {
    const run = ++runRef.current;
    const list = Array.from(new Set((ids || []).map((x) => String(x))));
    if (refresh) {
      // Se conservan los datos actuales mientras llegan los nuevos.
    } else if (reset) setSummaries({});
    else {
      setSummaries((prev) => {
        const next = { ...prev };
        for (const id of list) delete next[id];
        return next;
      });
    }
    setProgress({ done: 0, total: list.length });
    if (list.length === 0) return;

    await mapLimit(chunk(list, BATCH_SIZE), PARALLEL_REQUESTS, async (ids10) => {
      if (runRef.current !== run) return;
      let patch;
      try {
        const body = { orgUnitIds: ids10.map(Number) };
        if (refresh) body.refresh = true;
        const res = await apiPost("/gemelo/coordinator/summary/batch", body);
        const items = res?.items || {};
        patch = Object.fromEntries(ids10.map((id) => [id, items[id] || { error: "Sin respuesta para este curso" }]));
      } catch (e) {
        const msg = errorMessage(e);
        patch = Object.fromEntries(ids10.map((id) => [id, { error: msg }]));
      }
      if (runRef.current !== run) return;
      setSummaries((prev) => {
        const next = { ...prev };
        for (const [id, sum] of Object.entries(patch)) {
          const old = prev[id];
          next[id] = refresh && sum?.error && old && !old.error
            ? { ...old, refreshError: String(sum.error) }
            : sum;
        }
        return next;
      });
      setProgress((p) => ({ ...p, done: Math.min(p.total, p.done + ids10.length) }));
    });
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    setSummaries({});
    setProgress({ done: 0, total: 0 });
  }, []);

  const hydrate = useCallback((saved) => {
    runRef.current += 1;
    setSummaries(saved && typeof saved === "object" ? saved : {});
    setProgress({ done: 0, total: 0 });
  }, []);

  return { summaries, progress, load, reset, hydrate };
}
