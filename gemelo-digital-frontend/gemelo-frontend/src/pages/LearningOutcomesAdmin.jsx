import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, Target, ListChecks, AlertTriangle, BookOpen, ArrowLeft, Upload, ClipboardList } from "lucide-react";
import { apiGet, apiPost, mapLimit } from "../utils/api";
import { downloadCsv } from "../utils/export";
import { injectStyles } from "../styles/global";

// ────────────────────────────────────────────────────────────────
// Resultados de aprendizaje (RA) — herramienta de administración.
// Página independiente (Super Admin) extraída de RoleHome para tener
// más espacio de trabajo. Consulta el registro global de RA del tenant,
// localiza cursos por semestre y revisa/edita alineaciones por curso.
// ────────────────────────────────────────────────────────────────

// Constantes y helpers puros (parseo de RA, plantilla CSV, emparejador).
import {
  STATUS_META, classifyCourseUnit, classifyUnit, parseOutcomeSetsToList, scoreSetMatch,
  suggestSetsForCourse,
} from "./learning-outcomes/utils";

// Pestañas/secciones del render extraídas a componentes (refactor fase 2)
import { CatalogTab } from "./learning-outcomes/CatalogTab";
import { TemplateTab } from "./learning-outcomes/TemplateTab";
import { ManualImportTab } from "./learning-outcomes/ManualImportTab";
import { RubricsTab } from "./learning-outcomes/RubricsTab";
import { SemesterCoursesPanel } from "./learning-outcomes/SemesterCoursesPanel";
import { CourseLookupPanel } from "./learning-outcomes/CourseLookupPanel";
// Estado + lógica por sección, extraídos a hooks (refactor fase 2)
import { useRaRegistry } from "./learning-outcomes/useRaRegistry";
import { useCatalogImport } from "./learning-outcomes/useCatalogImport";
import { useRaTemplate } from "./learning-outcomes/useRaTemplate";
import { useRaProbe } from "./learning-outcomes/useRaProbe";
import { useCourseSets } from "./learning-outcomes/useCourseSets";

export default function LearningOutcomesAdmin() {
  useEffect(() => { injectStyles(); }, []);
  const navigate = useNavigate();

  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [loadedOrg, setLoadedOrg] = useState(null);
  const [loadedCourseName, setLoadedCourseName] = useState(""); // nombre del curso cargado (para sugerencias)

  // ── Estado de escritura (edición de alineaciones) ──
  const [editMode, setEditMode] = useState(false);
  const [sel, setSel] = useState({});           // "Type:Id" -> [guid,...]
  const [savingKey, setSavingKey] = useState(null);
  const [writeMsg, setWriteMsg] = useState(null); // { type:'ok'|'err', text }
  const [newType, setNewType] = useState("Assignment");
  const [newId, setNewId] = useState("");
  const [newSel, setNewSel] = useState([]);

  // ── Pestaña activa: organiza las herramientas por tarea (menos desorden) ──
  const [adminTab, setAdminTab] = useState("cursos"); // cursos|catalogo|plantilla|manual|rubricas

  // Registro global de RA (visor + edición de descripciones) — hook extraído
  const {
    regLoading, registry, regQuery, setRegQuery, regExpanded, setRegExpanded, raEdit,
    raEditMsg, loadRegistry, raEditStart, raEditCancel, raEditChange, raEditSave, regFiltered,
  } = useRaRegistry({ setError });

  // Importación de RA del catálogo global a cursos (+ estado del emparejador) — hook extraído
  const {
    impTarget, setImpTarget, impCatalog, impCatalogLoading, impCourse, impCourseLoading,
    impRunning, impMsg, impResult, impSelected, setImpSelected, impCatQuery, setImpCatQuery,
    matcher, setMatcher, impSelectedIds, impCatFiltered, toggleImpSet, loadGlobalCatalog,
    loadCourseSets, runImport,
  } = useCatalogImport();

  // Creación masiva de RA desde plantilla CSV — hook extraído
  const {
    tplTargets, setTplTargets, tplSets, tplFileName, tplErrors, tplRunning, tplMsg, tplResult,
    tplFileRef, downloadRaTemplate, onTplFile, tplRaCount, runBulkCreate,
  } = useRaTemplate();

  // ── Fase 2: cursos por semestre (vincular RA a cursos nuevos) ──
  const [semQuery, setSemQuery] = useState("");
  const [semLoading, setSemLoading] = useState(false);
  const [semUnits, setSemUnits] = useState(null);
  const [courseLoadingFor, setCourseLoadingFor] = useState(null);
  const [semCourses, setSemCourses] = useState(null); // { orgUnitId, items, typeHistogram }
  const [courseQuery, setCourseQuery] = useState("");
  // Análisis de estado RA por oferta: id -> { status: 'sinRA'|'sinAlinear'|'alineado'|'error', raCount }
  const [analysis, setAnalysis] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState("all"); // all|sinRA|sinAlinear|alineado
  // typeId 5 = Semestre en este tenant. Filtramos la búsqueda a semestres para
  // no devolver también sus ofertas/grupos hijos (que repiten la info).
  const SEMESTER_TYPE_ID = 5;
  const searchSemester = useCallback(async () => {
    const q = semQuery.trim();
    if (!q) { setError("Escribe el nombre o código del semestre (ej: 202620)."); return; }
    setSemLoading(true); setError(""); setSemUnits(null); setSemCourses(null);
    try {
      const res = await apiGet(`/gemelo/orgstructure/search?name=${encodeURIComponent(q)}&typeId=${SEMESTER_TYPE_ID}`);
      // Guardamos por si acaso solo los semestres (belt-and-suspenders).
      const items = (res.items || []).filter(u => classifyUnit(u) === "semester");
      setSemUnits(items.length > 0 ? items : (res.items || []));
    } catch (e) {
      setError(String(e?.message || "La búsqueda de semestres falló."));
    } finally {
      setSemLoading(false);
    }
  }, [semQuery]);
  // typeId 3 = Oferta de curso en este tenant. Filtramos los descendientes a
  // ofertas para no llenar el cupo (2000) con grupos y evitar que se trunque la
  // lista: un semestre puede tener >2000 descendientes contando grupos.
  const OFFERING_TYPE_ID = 3;
  const loadCourses = useCallback(async (ou) => {
    setCourseLoadingFor(ou); setError(""); setSemCourses(null); setCourseQuery("");
    setAnalysis({}); setStatusFilter("all"); setAnalyzeProgress({ done: 0, total: 0 });
    setBulkSel({}); setBulkPanel(null);
    try {
      const res = await apiGet(`/gemelo/orgstructure/${ou}/descendants?typeId=${OFFERING_TYPE_ID}`);
      setSemCourses(res);
    } catch (e) {
      setError(String(e?.message || "No se pudieron cargar los cursos de esa unidad."));
    } finally {
      setCourseLoadingFor(null);
    }
  }, []);
  // Analiza el estado RA de todas las ofertas cargadas (concurrencia 5). Para cada
  // oferta consulta sus learning-outcomes y clasifica: sin RA / sin alinear / alineado.
  // Permite filtrar y detectar cursos nuevos que necesitan RA o que aún no se alinean.
  const analyzeStatuses = useCallback(async () => {
    const items = (semCourses?.items || []).filter(c => classifyCourseUnit(c.typeName) === "offering");
    if (items.length === 0) return;
    setAnalyzing(true); setError("");
    setAnalyzeProgress({ done: 0, total: items.length });
    const acc = {};
    let done = 0;
    await mapLimit(items, 5, async (c) => {
      try {
        const res = await apiGet(`/gemelo/course/${c.id}/learning-outcomes`);
        const raCount = Object.keys(res?.outcomeCodeMap || {}).length;
        const aligned = !!(res?.hasRubricAlignments || res?.hasQuestionOnly);
        const status = raCount === 0 ? "sinRA" : (aligned ? "alineado" : "sinAlinear");
        acc[c.id] = { status, raCount };
      } catch (e) {
        acc[c.id] = { status: "error", err: String(e?.message || "error") };
      } finally {
        done += 1;
        setAnalyzeProgress({ done, total: items.length });
      }
    });
    setAnalysis(acc);
    setAnalyzing(false);
  }, [semCourses]);
  // Solo mostramos "Oferta de curso" (la unidad que porta los RA). Los grupos
  // (secciones hijas sin RA propios) se ocultan a propósito.
  const coursesFiltered = useMemo(() => {
    const items = semCourses?.items || [];
    let offerings = items.filter(c => classifyCourseUnit(c.typeName) === "offering");
    const q = courseQuery.trim().toLowerCase();
    if (q) {
      offerings = offerings.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.code || "").toLowerCase().includes(q) ||
        String(c.id).includes(q)
      );
    }
    if (statusFilter !== "all") {
      // Los recién importados se mantienen visibles aunque cambien de estado,
      // para conservar la confirmación en el panel abierto.
      offerings = offerings.filter(c => analysis[c.id]?.status === statusFilter || analysis[c.id]?.justImported);
    }
    return offerings;
  }, [semCourses, courseQuery, statusFilter, analysis]);

  // Conteo por estado sobre TODAS las ofertas (ignora el filtro de texto/estado).
  const statusCounts = useMemo(() => {
    const c = { total: 0, sinRA: 0, sinAlinear: 0, alineado: 0, error: 0, analyzed: 0 };
    const items = (semCourses?.items || []).filter(x => classifyCourseUnit(x.typeName) === "offering");
    c.total = items.length;
    for (const it of items) {
      const s = analysis[it.id]?.status;
      if (!s) continue;
      c.analyzed += 1;
      if (s === "sinRA") c.sinRA += 1;
      else if (s === "sinAlinear") c.sinAlinear += 1;
      else if (s === "alineado") c.alineado += 1;
      else if (s === "error") c.error += 1;
    }
    return c;
  }, [semCourses, analysis]);

  // ── Opción A: emparejador por curso (inline en "Sin RA") ──────────
  const matcherCourseRef = useRef(null); // id del curso con panel abierto (para alternar)
  const matcherStateRef = useRef(null);  // espejo de `matcher` para leer en callbacks
  useEffect(() => { matcherStateRef.current = matcher; }, [matcher]);
  // Abre el panel bajo un curso vacío y precalcula la mejor coincidencia.
  const openMatcher = useCallback(async (course) => {
    const cid = course.id;
    const courseName = course?.name || "";
    // Alterna: si ya está abierto para este curso, ciérralo.
    if (matcherCourseRef.current === cid) {
      matcherCourseRef.current = null;
      setMatcher(null);
      return;
    }
    matcherCourseRef.current = cid;
    setMatcher({
      courseId: cid, courseName, suggestions: [], selected: {},
      query: "", running: false, msg: null, before: null, after: null, loading: true,
    });
    // Asegura catálogo cargado (export global org-level).
    let cat = impCatalog;
    if (!cat?.summary?.length) cat = await loadGlobalCatalog();
    const summary = cat?.summary || [];
    const suggestions = suggestSetsForCourse(courseName, summary, 6);
    // Preselecciona la mejor si es claramente buena (score alto y con margen).
    const sel = {};
    const [top, second] = suggestions;
    if (top && top.score >= 0.6 && (!second || top.score - second.score >= 0.2)) {
      sel[top.importId] = true;
    }
    // Solo aplica si el panel sigue abierto en este curso.
    setMatcher(prev => (prev && prev.courseId === cid
      ? { ...prev, suggestions, selected: sel, loading: false }
      : prev));
  }, [impCatalog, loadGlobalCatalog, setMatcher]);

  const toggleMatcherSet = useCallback((importId) => {
    if (!importId) return;
    setMatcher(prev => prev ? { ...prev, selected: { ...prev.selected, [importId]: !prev.selected[importId] } } : prev);
  }, [setMatcher]);

  const setMatcherQuery = useCallback((q) => {
    setMatcher(prev => prev ? { ...prev, query: q } : prev);
  }, [setMatcher]);

  // Ejecuta el import para el curso del panel (dryRun=true → solo preview).
  const runMatcherImport = useCallback(async (dryRun) => {
    const m = matcherStateRef.current;
    if (!m) return;
    const ou = m.courseId;
    const ids = Object.keys(m.selected).filter(k => m.selected[k]);
    if (ids.length === 0) {
      setMatcher(prev => prev ? { ...prev, msg: { type: "err", text: "Marca al menos un conjunto sugerido antes de importar." } } : prev);
      return;
    }
    setMatcher(prev => prev ? { ...prev, running: dryRun ? "dry" : "real", msg: null } : prev);
    try {
      const res = await apiPost("/gemelo/outcomes/import", {
        targetOrgUnitId: ou, importIds: ids, dryRun: !!dryRun,
      });
      const nSets = res?.preview?.setCount ?? ids.length;
      const nOut = (res?.preview?.outcomeCounts || []).reduce((a, b) => a + (b || 0), 0);
      const before = res?.courseSetsBefore?.outcomeTotal ?? res?.export_meta?.courseSetsBefore?.outcomeTotal ?? null;
      if (dryRun) {
        setMatcher(prev => prev && prev.courseId === ou
          ? { ...prev, running: false, msg: { type: "preview", text: `Vista previa: se importarían ${nSets} conjunto(s) · ${nOut} RA a "${m.courseName}" (no se escribió nada).` } }
          : prev);
      } else if (res?.ok) {
        // Verifica el resultado real leyendo los RA del curso.
        let afterTotal = null;
        try {
          const chk = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
          afterTotal = chk?.outcomeTotal ?? null;
        } catch { /* noop */ }
        // Refleja el nuevo estado en la lista (deja de estar "Sin RA").
        // `justImported` mantiene la fila visible aunque el filtro sea "Sin RA",
        // para no ocultar la confirmación de éxito inmediatamente.
        if (afterTotal != null && afterTotal > 0) {
          setAnalysis(prev => ({ ...prev, [ou]: { status: "sinAlinear", raCount: afterTotal, justImported: true } }));
        }
        setMatcher(prev => prev && prev.courseId === ou
          ? { ...prev, running: false, before, after: afterTotal, msg: { type: "ok", text: `Import completado (HTTP ${res.status}). "${m.courseName}" ahora tiene ${afterTotal ?? "?"} RA.` } }
          : prev);
      } else {
        const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
        setMatcher(prev => prev && prev.courseId === ou
          ? { ...prev, running: false, msg: { type: "err", text: `Brightspace rechazó el import (HTTP ${res?.status ?? "?"}): ${d.slice(0, 300)}` } }
          : prev);
      }
    } catch (e) {
      setMatcher(prev => prev ? { ...prev, running: false, msg: { type: "err", text: String(e?.message || "No se pudo importar.") } } : prev);
    }
  }, [setMatcher]);

  // ── Import MASIVO: checkboxes en la lista de cursos + panel compartido ──
  // Permite marcar varias ofertas (p. ej. las 8 secciones de "Introducción al
  // Derecho") e importarles el/los mismos conjuntos de RA en una sola pasada.
  const [bulkSel, setBulkSel] = useState({});        // courseId -> bool
  const [bulkPanel, setBulkPanel] = useState(null);  // { suggestions, selected, query, running, msg, progress, results, loading }
  const bulkPanelRef = useRef(null);
  useEffect(() => { bulkPanelRef.current = bulkPanel; }, [bulkPanel]);
  const bulkIds = useMemo(
    () => Object.keys(bulkSel).filter(k => bulkSel[k]).map(Number),
    [bulkSel],
  );

  const toggleBulkCourse = useCallback((id) => {
    setBulkSel(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Descarga CSV (Excel-friendly, con BOM) de los cursos marcados: id, nombre,
  // código, tipo, estado RA y # de RA (si ya se corrió "Analizar estado").
  const exportSelectedCsv = useCallback(() => {
    if (bulkIds.length === 0) return;
    const byId = new Map((semCourses?.items || []).map(c => [Number(c.id), c]));
    const headers = ["ID", "Nombre", "Código", "Tipo", "Estado RA", "# RA"];
    const rows = bulkIds.map(id => {
      const c = byId.get(Number(id)) || {};
      const st = analysis[id];
      const statusLabel = st ? (STATUS_META[st.status]?.label || st.status || "") : "Sin analizar";
      const raCount = st && typeof st.raCount === "number" ? st.raCount : "";
      return [id, c.name || "", c.code || "", c.typeName || "", statusLabel, raCount];
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const sem = semCourses?.orgUnitId ? `-sem${semCourses.orgUnitId}` : "";
    downloadCsv(`cursos-seleccionados${sem}-${stamp}.csv`, headers, rows);
  }, [bulkIds, semCourses, analysis]);

  // Marca/desmarca todas las ofertas VISIBLES (respeta filtro de texto/estado).
  const toggleBulkVisible = useCallback(() => {
    const allOn = coursesFiltered.length > 0 && coursesFiltered.every(c => bulkSel[c.id]);
    setBulkSel(prev => {
      const next = { ...prev };
      for (const c of coursesFiltered) next[c.id] = !allOn;
      return next;
    });
  }, [coursesFiltered, bulkSel]);

  // Abre/cierra el panel masivo. Las sugerencias agregan el MEJOR puntaje de
  // cada conjunto frente a todos los cursos marcados (suelen ser homónimos).
  const openBulkPanel = useCallback(async () => {
    if (bulkPanelRef.current) { setBulkPanel(null); return; }
    if (bulkIds.length === 0) return;
    setBulkPanel({ suggestions: [], selected: {}, query: "", running: false, msg: null, progress: null, results: null, loading: true });
    let cat = impCatalog;
    if (!cat?.summary?.length) cat = await loadGlobalCatalog();
    const summary = cat?.summary || [];
    const byId = new Map((semCourses?.items || []).map(c => [Number(c.id), c]));
    const names = bulkIds.map(id => byId.get(id)?.name || "").filter(Boolean);
    const suggestions = summary
      .map(s => ({ ...s, score: names.length ? Math.max(...names.map(n => scoreSetMatch(n, s.name))) : 0 }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const sel = {};
    const [top, second] = suggestions;
    if (top && top.score >= 0.6 && (!second || top.score - second.score >= 0.2)) {
      sel[top.importId] = true;
    }
    setBulkPanel(prev => prev ? { ...prev, suggestions, selected: sel, loading: false } : prev);
  }, [bulkIds, impCatalog, loadGlobalCatalog, semCourses]);

  const toggleBulkSet = useCallback((importId) => {
    if (!importId) return;
    setBulkPanel(prev => prev ? { ...prev, selected: { ...prev.selected, [importId]: !prev.selected[importId] } } : prev);
  }, []);

  const setBulkPanelQuery = useCallback((q) => {
    setBulkPanel(prev => prev ? { ...prev, query: q } : prev);
  }, []);

  // Ejecuta el import para TODOS los cursos marcados (concurrencia 3). Cada
  // curso usa el mismo endpoint del emparejador individual; tras un import real
  // se verifica leyendo los sets del curso y se actualiza su estado en la lista.
  const runBulkImport = useCallback(async (dryRun) => {
    const p = bulkPanelRef.current;
    if (!p) return;
    const setIds = Object.keys(p.selected).filter(k => p.selected[k]);
    const courses = bulkIds;
    if (setIds.length === 0) {
      setBulkPanel(prev => prev ? { ...prev, msg: { type: "err", text: "Marca al menos un conjunto antes de importar." } } : prev);
      return;
    }
    if (courses.length === 0) {
      setBulkPanel(prev => prev ? { ...prev, msg: { type: "err", text: "No hay cursos seleccionados." } } : prev);
      return;
    }
    if (!dryRun) {
      const okGo = window.confirm(
        `Vas a importar ${setIds.length} conjunto(s) de RA a ${courses.length} curso(s).\n\nEl import es un merge: no borra ni altera RA existentes.\n\n¿Continuar?`
      );
      if (!okGo) return;
    }
    setBulkPanel(prev => prev ? { ...prev, running: dryRun ? "dry" : "real", msg: null, results: null, progress: { done: 0, total: courses.length } } : prev);
    const byId = new Map((semCourses?.items || []).map(c => [Number(c.id), c]));
    const results = [];
    let done = 0;
    // Import con reintento ante 429 (rate limit del backend). La ventana del
    // limiter es de 1 min, así que esperamos escalonado y reintentamos en lugar
    // de dar el curso por fallido: con lotes grandes esto evita "N fallidos".
    const importWithRetry = async (ou, maxRetries = 4) => {
      let attempt = 0;
      while (true) {
        try {
          return await apiPost("/gemelo/outcomes/import", {
            targetOrgUnitId: ou, importIds: setIds, dryRun: !!dryRun,
          });
        } catch (e) {
          const is429 = String(e?.message || "").includes("429");
          if (is429 && attempt < maxRetries) {
            attempt += 1;
            const waitMs = Math.min(60000, 8000 * attempt) + Math.floor(Math.random() * 1500);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          throw e;
        }
      }
    };
    await mapLimit(courses, 3, async (ou) => {
      const name = byId.get(ou)?.name || `Curso ${ou}`;
      try {
        const res = await importWithRetry(ou);
        if (res?.ok) {
          let afterTotal = null;
          if (!dryRun) {
            try {
              const chk = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
              afterTotal = chk?.outcomeTotal ?? null;
            } catch { /* noop */ }
            if (afterTotal != null && afterTotal > 0) {
              setAnalysis(prev => ({ ...prev, [ou]: { status: "sinAlinear", raCount: afterTotal, justImported: true } }));
            }
          }
          results.push({ ou, name, ok: true, after: afterTotal });
        } else {
          const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
          results.push({ ou, name, ok: false, err: `HTTP ${res?.status ?? "?"}: ${d.slice(0, 200)}` });
        }
      } catch (e) {
        results.push({ ou, name, ok: false, err: String(e?.message || "falló") });
      } finally {
        done += 1;
        setBulkPanel(prev => prev ? { ...prev, progress: { done, total: courses.length } } : prev);
      }
    });
    const nOk = results.filter(r => r.ok).length;
    const nBad = results.length - nOk;
    results.sort((a, b) => Number(a.ok) - Number(b.ok)); // errores primero
    const msg = dryRun
      ? { type: "preview", text: `Vista previa: ${setIds.length} conjunto(s) se importarían a ${nOk} de ${results.length} curso(s)${nBad ? ` · ${nBad} con error` : ""} (no se escribió nada).` }
      : nBad === 0
        ? { type: "ok", text: `Import masivo completado: ${setIds.length} conjunto(s) importados a ${nOk} curso(s).` }
        : { type: "err", text: `Import terminado con errores: ${nOk} OK · ${nBad} fallido(s). Revisa el detalle abajo.` };
    setBulkPanel(prev => prev ? { ...prev, running: false, msg, results } : prev);
  }, [bulkIds, semCourses]);

  // Sondeo del registro global (diagnóstico) — hook extraído
  const {
    probing, probeData, setProbeData, probeProgram, setProbeProgram, runProbe,
  } = useRaProbe({ orgId, setError });

  const fetchLO = useCallback(async (ouOverride, nameOverride) => {
    const raw = ouOverride != null ? ouOverride : orgId;
    const ou = Number(raw);
    if (!ou || ou <= 0) { setError("Ingresa un ID de curso válido."); return; }
    if (ouOverride != null) setOrgId(String(ou));
    // Resuelve el nombre del curso (para el emparejador). Prioriza el nombre que
    // venga del listado; si no, lo busca en semCourses por id (comparando strings
    // para evitar el desajuste número/string que rompía las sugerencias).
    const resolvedName = nameOverride
      || (semCourses?.items || []).find(x => String(x.id) === String(ou))?.name
      || "";
    setLoadedCourseName(resolvedName);
    setLoading(true); setError(""); setData(null);
    try {
      const res = await apiGet(`/gemelo/course/${ou}/learning-outcomes`);
      setData(res);
      setLoadedOrg(ou);
    } catch {
      setError("No se pudieron cargar los resultados de aprendizaje de ese curso.");
    } finally {
      setLoading(false);
    }
  }, [orgId, semCourses]);

  // Conjuntos de RA vinculados al curso (listar / desvincular) — hook extraído
  const {
    courseSets, courseSetsLoading, deletingSetId, deleteMsg, unlinkSet,
  } = useCourseSets({ data, fetchLO, loadedOrg });

  const outcomes = useMemo(() => {
    const map = data?.outcomeCodeMap || {};
    let list = Object.entries(map).map(([id, info]) => ({ id, ...(info || {}) }));
    // Fallback: índice derivado vacío (caché obsoleta tras importar) → derivar del crudo.
    if (list.length === 0 && data?.outcomeSets) list = parseOutcomeSetsToList(data.outcomeSets);
    return list.sort((a, b) => String(a.code || a.title || "").localeCompare(String(b.code || b.title || ""), "es", { numeric: true }));
  }, [data]);

  const allOutcomes = useMemo(() => {
    const idx = data?.outcomeIndex || {};
    let list = Object.entries(idx).map(([guid, info]) => ({ guid, ...(info || {}) }));
    if (list.length === 0 && data?.outcomeSets) list = parseOutcomeSetsToList(data.outcomeSets);
    return list.sort((a, b) => String(a.code || a.title || "").localeCompare(String(b.code || b.title || ""), "es", { numeric: true }));
  }, [data]);

  useEffect(() => {
    const a2o = data?.activityToOutcomes || {};
    const init = {};
    for (const [k, guids] of Object.entries(a2o)) init[k] = Array.isArray(guids) ? [...guids] : [];
    setSel(init);
    setWriteMsg(null);
  }, [data]);

  const rubricCount = data ? Object.keys(data.rubricToOutcomeCodes || {}).length : 0;
  const activityCount = data ? Object.keys(data.activityToOutcomes || {}).length : 0;
  const hasOutcomes = outcomes.length > 0;
  const hasAlignments = !!(data && (data.hasRubricAlignments || data.hasQuestionOnly));
  const canEdit = hasOutcomes && allOutcomes.length > 0;

  const toggleSel = useCallback((key, guid) => {
    setSel(prev => {
      const cur = prev[key] || [];
      const next = cur.includes(guid) ? cur.filter(g => g !== guid) : [...cur, guid];
      return { ...prev, [key]: next };
    });
  }, []);

  const toggleNewSel = useCallback((guid) => {
    setNewSel(prev => prev.includes(guid) ? prev.filter(g => g !== guid) : [...prev, guid]);
  }, []);

  const saveActivity = useCallback(async (key) => {
    if (!loadedOrg) return;
    const idx = key.indexOf(":");
    const type = key.slice(0, idx);
    const objectId = key.slice(idx + 1);
    const outcomeIds = sel[key] || [];
    setSavingKey(key); setWriteMsg(null);
    try {
      await apiPost(
        `/gemelo/course/${loadedOrg}/alignments/activity/${type}/${encodeURIComponent(objectId)}`,
        { action: "replace", outcomeIds },
      );
      setWriteMsg({ type: "ok", text: `Alineaciones actualizadas para ${type} #${objectId}.` });
      await fetchLO();
    } catch (e) {
      setWriteMsg({ type: "err", text: String(e?.message || "No se pudo guardar.") });
    } finally {
      setSavingKey(null);
    }
  }, [sel, loadedOrg, fetchLO]);

  const saveNew = useCallback(async () => {
    if (!loadedOrg) return;
    const oid = newId.trim();
    if (!oid || newSel.length === 0) {
      setWriteMsg({ type: "err", text: "Indica el ID de la actividad y al menos un RA." });
      return;
    }
    setSavingKey("__new__"); setWriteMsg(null);
    try {
      await apiPost(
        `/gemelo/course/${loadedOrg}/alignments/activity/${newType}/${encodeURIComponent(oid)}`,
        { action: "add", outcomeIds: newSel },
      );
      setWriteMsg({ type: "ok", text: `RA agregados a ${newType} #${oid}.` });
      setNewId(""); setNewSel([]);
      await fetchLO();
    } catch (e) {
      setWriteMsg({ type: "err", text: String(e?.message || "No se pudo agregar la alineación.") });
    } finally {
      setSavingKey(null);
    }
  }, [loadedOrg, newId, newType, newSel, fetchLO]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px clamp(16px, 4vw, 48px) 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Cabecera de la página */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px",
              borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--card)",
              color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font)", cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} strokeWidth={2.4} aria-hidden="true" /> Volver
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", flexShrink: 0,
            }}>
              <Target size={24} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", lineHeight: 1.1 }}>Resultados de aprendizaje</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Super Admin · Registro global, cursos por semestre y alineaciones</div>
            </div>
          </div>
        </div>

        <section className="home-panel superadmin-brand" style={{ padding: "clamp(16px, 3vw, 26px)" }}>
          {/* ── Barra de pestañas: una herramienta por pestaña ── */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, borderBottom: "1.5px solid var(--border)", margin: "-2px 0 12px", flexWrap: "wrap" }}>
            {[
              { key: "cursos", label: "Cursos y alineaciones", Icon: LayoutGrid },
              { key: "catalogo", label: "Registro global", Icon: Target },
              { key: "plantilla", label: "Crear RA (plantilla)", Icon: Upload },
              { key: "manual", label: "Importar manual", Icon: BookOpen },
              { key: "rubricas", label: "Rúbricas (beta)", Icon: ClipboardList },
            ].map(t => {
              const active = adminTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setAdminTab(t.key)}
                  aria-pressed={active}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px 8px",
                    borderRadius: "10px 10px 0 0", border: "1.5px solid var(--border)",
                    borderBottom: active ? "1.5px solid var(--card)" : "1.5px solid var(--border)",
                    marginBottom: -1.5, background: active ? "var(--card)" : "var(--bg)",
                    color: active ? "var(--brand)" : "var(--muted)",
                    fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font)", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  <t.Icon size={14} strokeWidth={2.4} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Descripción de la pestaña activa */}
          <div style={{
            fontSize: 12, color: "var(--muted)", marginBottom: 14,
            padding: "10px 14px", background: "var(--brand-light)",
            borderRadius: 10, borderLeft: "3px solid var(--brand)",
            display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
          }}>
            <ListChecks size={16} strokeWidth={2.2} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
            <span>
              {adminTab === "cursos" && <>Busca un semestre, revisa el estado de RA de cada curso (sin RA / sin alinear / alineado) y consulta o edita las alineaciones de cualquier curso por ID.</>}
              {adminTab === "catalogo" && <>Todos los conjuntos de RA del tenant (nivel organización). Explora los conjuntos y edita descripciones con el lápiz.</>}
              {adminTab === "plantilla" && <>Crea RA masivos desde un archivo: descarga la plantilla, complétala en Excel y cárgala. Es un <b>merge</b>: nunca borra RA existentes.</>}
              {adminTab === "rubricas" && <>BETA · Genera una rúbrica en un curso a partir de sus RA: un criterio por RA, alineado a su resultado. Primero vista previa (no escribe), luego confirmación.</>}
              {adminTab === "manual" && <>Modo avanzado: importa conjuntos del catálogo global a cualquier curso por ID y sondea el registro para diagnóstico.</>}
            </span>
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: "var(--danger-fg)", background: "var(--danger-bg)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} strokeWidth={2.4} /> {error}
            </div>
          )}

          {/* ── Pestaña: Registro global de RA (todos los conjuntos del tenant) ── */}
          {adminTab === "catalogo" && (
          <CatalogTab
            loadRegistry={loadRegistry}
            raEdit={raEdit}
            raEditCancel={raEditCancel}
            raEditChange={raEditChange}
            raEditMsg={raEditMsg}
            raEditSave={raEditSave}
            raEditStart={raEditStart}
            regExpanded={regExpanded}
            regFiltered={regFiltered}
            regLoading={regLoading}
            regQuery={regQuery}
            registry={registry}
            setRegExpanded={setRegExpanded}
            setRegQuery={setRegQuery}
          />
          )}

          {/* ── Pestaña: Creación masiva de RA desde plantilla CSV ── */}
          {adminTab === "plantilla" && (
          <TemplateTab
            downloadRaTemplate={downloadRaTemplate}
            onTplFile={onTplFile}
            runBulkCreate={runBulkCreate}
            setTplTargets={setTplTargets}
            tplErrors={tplErrors}
            tplFileName={tplFileName}
            tplFileRef={tplFileRef}
            tplMsg={tplMsg}
            tplRaCount={tplRaCount}
            tplResult={tplResult}
            tplRunning={tplRunning}
            tplSets={tplSets}
            tplTargets={tplTargets}
          />
          )}

          {/* ── Pestaña: Importar RA — modo manual + sondeo (avanzado) ── */}
          {adminTab === "manual" && (<>
          <ManualImportTab
            impCatFiltered={impCatFiltered}
            impCatQuery={impCatQuery}
            impCatalog={impCatalog}
            impCatalogLoading={impCatalogLoading}
            impCourse={impCourse}
            impCourseLoading={impCourseLoading}
            impMsg={impMsg}
            impResult={impResult}
            impRunning={impRunning}
            impSelected={impSelected}
            impSelectedIds={impSelectedIds}
            impTarget={impTarget}
            loadCourseSets={loadCourseSets}
            loadGlobalCatalog={loadGlobalCatalog}
            orgId={orgId}
            probeData={probeData}
            probeProgram={probeProgram}
            probing={probing}
            runImport={runImport}
            runProbe={runProbe}
            setImpCatQuery={setImpCatQuery}
            setImpSelected={setImpSelected}
            setImpTarget={setImpTarget}
            setOrgId={setOrgId}
            setProbeData={setProbeData}
            setProbeProgram={setProbeProgram}
            toggleImpSet={toggleImpSet}
          />
          </>)}

          {/* ── Pestaña: Generador de rúbricas por RA (BETA, escribe en Brightspace) ── */}
          {adminTab === "rubricas" && (
          <RubricsTab initialOrgId={loadedOrg || orgId || ""} />
          )}

          {/* ── Pestaña: Cursos y alineaciones (semestres + consulta por ID) ── */}
          {adminTab === "cursos" && (<>
          {/* ── Fase 2: Cursos por semestre (vincular RA a cursos nuevos) ── */}
          <SemesterCoursesPanel
            analysis={analysis}
            analyzeProgress={analyzeProgress}
            analyzeStatuses={analyzeStatuses}
            analyzing={analyzing}
            bulkIds={bulkIds}
            bulkPanel={bulkPanel}
            bulkSel={bulkSel}
            courseLoadingFor={courseLoadingFor}
            courseQuery={courseQuery}
            coursesFiltered={coursesFiltered}
            exportSelectedCsv={exportSelectedCsv}
            fetchLO={fetchLO}
            impCatalog={impCatalog}
            loadCourses={loadCourses}
            matcher={matcher}
            openBulkPanel={openBulkPanel}
            openMatcher={openMatcher}
            runBulkImport={runBulkImport}
            runMatcherImport={runMatcherImport}
            searchSemester={searchSemester}
            semCourses={semCourses}
            semLoading={semLoading}
            semQuery={semQuery}
            semUnits={semUnits}
            setBulkPanel={setBulkPanel}
            setBulkPanelQuery={setBulkPanelQuery}
            setBulkSel={setBulkSel}
            setCourseQuery={setCourseQuery}
            setMatcherQuery={setMatcherQuery}
            setSemQuery={setSemQuery}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            toggleBulkCourse={toggleBulkCourse}
            toggleBulkSet={toggleBulkSet}
            toggleBulkVisible={toggleBulkVisible}
            toggleMatcherSet={toggleMatcherSet}
          />

          <CourseLookupPanel
            activityCount={activityCount}
            allOutcomes={allOutcomes}
            canEdit={canEdit}
            courseSets={courseSets}
            courseSetsLoading={courseSetsLoading}
            data={data}
            deleteMsg={deleteMsg}
            deletingSetId={deletingSetId}
            editMode={editMode}
            fetchLO={fetchLO}
            hasAlignments={hasAlignments}
            hasOutcomes={hasOutcomes}
            impCatalog={impCatalog}
            loadedCourseName={loadedCourseName}
            loadedOrg={loadedOrg}
            loading={loading}
            matcher={matcher}
            newId={newId}
            newSel={newSel}
            newType={newType}
            openMatcher={openMatcher}
            orgId={orgId}
            outcomes={outcomes}
            rubricCount={rubricCount}
            runMatcherImport={runMatcherImport}
            saveActivity={saveActivity}
            saveNew={saveNew}
            savingKey={savingKey}
            sel={sel}
            setEditMode={setEditMode}
            setMatcherQuery={setMatcherQuery}
            setNewId={setNewId}
            setNewType={setNewType}
            setOrgId={setOrgId}
            setWriteMsg={setWriteMsg}
            toggleMatcherSet={toggleMatcherSet}
            toggleNewSel={toggleNewSel}
            toggleSel={toggleSel}
            unlinkSet={unlinkSet}
            writeMsg={writeMsg}
          />
          </>)}
        </section>
      </div>
    </div>
  );
}
