import { useCallback, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../utils/api";

/**
 * Importación de conjuntos de RA del catálogo global a un curso (modo manual)
 * y estado compartido del emparejador. Extraído de LearningOutcomesAdmin.jsx
 * sin cambios de comportamiento.
 */
export function useCatalogImport() {
  // ── Fase 4: importar RA global a cursos vacíos (bulkImport) ──
  const [impTarget, setImpTarget] = useState("6762");       // curso destino (piloto)
  const [impCatalog, setImpCatalog] = useState(null);        // export global {ok, summary, sets}
  const [impCatalogLoading, setImpCatalogLoading] = useState(false);
  const [impCourse, setImpCourse] = useState(null);          // {orgUnitId, sets, outcomeTotal}
  const [impCourseLoading, setImpCourseLoading] = useState(false);
  const [impRunning, setImpRunning] = useState(false);       // false|'dry'|'real'
  const [impMsg, setImpMsg] = useState(null);                // {type, text}
  const [impResult, setImpResult] = useState(null);          // resultado del import
  const [impSelected, setImpSelected] = useState({});        // importId -> bool (conjuntos elegidos)
  const [impCatQuery, setImpCatQuery] = useState("");        // filtro del catálogo (son ~137)

  // Opción A — emparejador por curso (inline en la Fase 2 "Sin RA").
  // matcher = { courseId, courseName, suggestions:[{importId,name,score,outcomeCount}],
  //   selected:{importId:bool}, query, running:false|'dry'|'real', msg, before, after }
  const [matcher, setMatcher] = useState(null);

  const impSelectedIds = useMemo(
    () => Object.keys(impSelected).filter(k => impSelected[k]),
    [impSelected],
  );
  const impCatFiltered = useMemo(() => {
    const rows = impCatalog?.summary || [];
    const q = impCatQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(s => (s.name || "").toLowerCase().includes(q) || (s.importId || "").toLowerCase().includes(q));
  }, [impCatalog, impCatQuery]);
  const toggleImpSet = useCallback((importId) => {
    if (!importId) return;
    setImpSelected(p => ({ ...p, [importId]: !p[importId] }));
  }, []);

  // Exporta el catálogo global (org-level) para descubrir qué conjuntos hay.
  const loadGlobalCatalog = useCallback(async () => {
    setImpCatalogLoading(true); setImpMsg(null);
    try {
      const res = await apiGet("/gemelo/outcomes/export");
      setImpCatalog(res);
      if (!res?.ok) {
        const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
        setImpMsg({ type: "err", text: `Export global HTTP ${res?.status ?? "?"}: ${d.slice(0, 300)}` });
      }
      return res;
    } catch (e) {
      setImpMsg({ type: "err", text: String(e?.message || "No se pudo exportar el catálogo global.") });
      return null;
    } finally {
      setImpCatalogLoading(false);
    }
  }, []);

  // Lee los outcome sets actuales del curso destino (para ver vacío / verificar).
  const loadCourseSets = useCallback(async () => {
    const ou = parseInt(impTarget, 10);
    if (!ou) { setImpMsg({ type: "err", text: "Escribe el ID del curso destino." }); return; }
    setImpCourseLoading(true);
    try {
      const res = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
      setImpCourse(res);
    } catch (e) {
      setImpMsg({ type: "err", text: String(e?.message || "No se pudieron leer los RA del curso.") });
    } finally {
      setImpCourseLoading(false);
    }
  }, [impTarget]);

  // Importa los conjuntos seleccionados al curso (dryRun=true → solo preview).
  const runImport = useCallback(async (dryRun) => {
    const ou = parseInt(impTarget, 10);
    if (!ou) { setImpMsg({ type: "err", text: "Escribe el ID del curso destino." }); return; }
    if (impSelectedIds.length === 0) {
      setImpMsg({ type: "err", text: "Selecciona al menos un conjunto del catálogo (marca la casilla del que corresponde a la asignatura)." });
      return;
    }
    setImpRunning(dryRun ? "dry" : "real"); setImpMsg(null); setImpResult(null);
    try {
      const res = await apiPost("/gemelo/outcomes/import", {
        targetOrgUnitId: ou,
        importIds: impSelectedIds,
        dryRun: !!dryRun,
      });
      setImpResult(res);
      const nSets = res?.preview?.setCount ?? 0;
      const nOut = (res?.preview?.outcomeCounts || []).reduce((a, b) => a + (b || 0), 0);
      if (dryRun) {
        setImpMsg({ type: "preview", text: `Vista previa: se importarían ${nSets} conjunto(s) · ${nOut} RA al curso ${ou} (no se escribió nada).` });
      } else if (res?.ok) {
        setImpMsg({ type: "ok", text: `Import completado (HTTP ${res.status}) en el curso ${ou}. Revisa el "Después" abajo.` });
        await loadCourseSets();
      } else {
        const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
        setImpMsg({ type: "err", text: `Brightspace rechazó el import (HTTP ${res?.status ?? "?"}): ${d.slice(0, 400)}` });
      }
    } catch (e) {
      setImpMsg({ type: "err", text: String(e?.message || "No se pudo importar.") });
    } finally {
      setImpRunning(false);
    }
  }, [impTarget, impSelectedIds, loadCourseSets]);

  return { impTarget, setImpTarget, impCatalog, impCatalogLoading, impCourse, impCourseLoading, impRunning, impMsg, impResult, impSelected, setImpSelected, impCatQuery, setImpCatQuery, matcher, setMatcher, impSelectedIds, impCatFiltered, toggleImpSet, loadGlobalCatalog, loadCourseSets, runImport };
}
