import { useState, useCallback, useMemo } from "react";
import { apiGet, apiPost } from "../../utils/api";

// ────────────────────────────────────────────────────────────────
// BETA — Generador de rúbricas por RA.
// Estado y llamadas del flujo: cargar RA del curso → elegir RA y niveles →
// vista previa (dry run, sin escribir) → confirmar → crear en Brightspace.
// ────────────────────────────────────────────────────────────────

export const DEFAULT_RUBRIC_LEVELS = [
  { name: "Insuficiente", points: 1 },
  { name: "En desarrollo", points: 2 },
  { name: "Logrado", points: 3 },
  { name: "Destacado", points: 4 },
];
export const RUBRIC_LIMITS = { minOutcomes: 1, maxOutcomes: 30, minLevels: 2, maxLevels: 6 };

const cellKey = (outcomeId, levelIndex) => `${outcomeId}|${levelIndex}`;

/** Extrae {reason, message} de un ApiError (detail string u objeto). */
export function rubricErrorInfo(e) {
  const detail = e?.body?.detail;
  if (detail && typeof detail === "object") {
    return { reason: detail.reason || "error", message: detail.message || String(e?.message || "Error") };
  }
  if (typeof detail === "string") return { reason: "error", message: detail };
  return { reason: "error", message: String(e?.message || "Error desconocido") };
}

/** Valida en cliente lo mismo que el backend (mensajes en español). */
export function validateRubricDraft({ name, selected, levels }) {
  if (!String(name || "").trim()) return "La rúbrica necesita un nombre.";
  if (selected.length < RUBRIC_LIMITS.minOutcomes || selected.length > RUBRIC_LIMITS.maxOutcomes) {
    return `Selecciona entre ${RUBRIC_LIMITS.minOutcomes} y ${RUBRIC_LIMITS.maxOutcomes} resultados de aprendizaje.`;
  }
  if (levels.length < RUBRIC_LIMITS.minLevels || levels.length > RUBRIC_LIMITS.maxLevels) {
    return `La rúbrica debe tener entre ${RUBRIC_LIMITS.minLevels} y ${RUBRIC_LIMITS.maxLevels} niveles de desempeño.`;
  }
  const names = levels.map(l => String(l.name || "").trim().toLocaleLowerCase("es"));
  if (names.some(n => !n)) return "Todos los niveles necesitan nombre.";
  if (new Set(names).size !== names.length) return "Los nombres de los niveles deben ser únicos.";
  if (levels.some(l => String(l.points ?? "").trim() === "")) return "Cada nivel debe tener un puntaje numérico mayor o igual a 0.";
  const pts = levels.map(l => Number(l.points));
  if (pts.some(isInvalidPoints)) return "Cada nivel debe tener un puntaje numérico mayor o igual a 0.";
  for (let i = 1; i < pts.length; i++) {
    if (pts[i] < pts[i - 1]) return "Los puntajes de los niveles no pueden disminuir: ordénalos del menor al mayor desempeño.";
  }
  return null;
}
function isInvalidPoints(p) {
  return !Number.isFinite(p) || p < 0;
}

export function useRubricBuilder({ initialOrgId = "" } = {}) {
  const [courseId, setCourseId] = useState(String(initialOrgId || ""));
  const [loadedOrg, setLoadedOrg] = useState(null);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setNameRaw] = useState("");
  const [selected, setSelected] = useState([]);
  const [levels, setLevelsRaw] = useState(DEFAULT_RUBRIC_LEVELS);
  const [publish, setPublishRaw] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [cellEdits, setCellEdits] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);
  const [createError, setCreateError] = useState(null);

  // Cualquier cambio de configuración invalida la vista previa: la creación
  // solo se permite sobre una vista previa vigente (lo que se ve es lo que se crea).
  const invalidate = useCallback(() => { setPreview(null); setResult(null); setCreateError(null); }, []);
  const setName = useCallback((v) => { setNameRaw(v); invalidate(); }, [invalidate]);
  const setPublish = useCallback((v) => { setPublishRaw(Boolean(v)); invalidate(); }, [invalidate]);
  const setLevels = useCallback((updater) => {
    setLevelsRaw(updater);
    setCellEdits({}); // los índices de nivel cambian: descartar ediciones
    invalidate();
  }, [invalidate]);

  const toggleOutcome = useCallback((id) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    invalidate();
  }, [invalidate]);
  const selectAll = useCallback(() => {
    setSelected(outcomes.slice(0, RUBRIC_LIMITS.maxOutcomes).map(o => o.id));
    invalidate();
  }, [outcomes, invalidate]);
  const clearSelection = useCallback(() => { setSelected([]); invalidate(); }, [invalidate]);

  const updateLevel = useCallback((idx, patch) => {
    setLevels(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }, [setLevels]);
  const addLevel = useCallback(() => {
    setLevels(prev => {
      if (prev.length >= RUBRIC_LIMITS.maxLevels) return prev;
      const last = prev[prev.length - 1];
      const nextPts = last ? Number(last.points || 0) + 1 : 1;
      return [...prev, { name: `Nivel ${prev.length + 1}`, points: nextPts }];
    });
  }, [setLevels]);
  const removeLevel = useCallback((idx) => {
    setLevels(prev => (prev.length <= RUBRIC_LIMITS.minLevels ? prev : prev.filter((_, i) => i !== idx)));
  }, [setLevels]);
  const resetLevels = useCallback(() => setLevels(DEFAULT_RUBRIC_LEVELS), [setLevels]);

  const loadOutcomes = useCallback(async () => {
    const ou = String(courseId || "").trim();
    if (!/^\d+$/.test(ou)) { setError("Escribe el ID numérico del curso (OrgUnitId)."); return; }
    setLoading(true); setError(""); setOutcomes([]); setSelected([]); setCellEdits({}); invalidate();
    try {
      const data = await apiGet(`/gemelo/course/${ou}/rubrics/outcomes`);
      const list = Array.isArray(data?.outcomes) ? data.outcomes : [];
      setOutcomes(list);
      setLoadedOrg(Number(ou));
      setNameRaw(prev => prev || `Rúbrica por RA – curso ${ou}`);
      if (Array.isArray(data?.defaultLevels) && data.defaultLevels.length) {
        setLevelsRaw(data.defaultLevels.map(l => ({ name: l.name, points: l.points })));
      }
      if (list.length === 0) setError("Este curso no tiene resultados de aprendizaje vinculados.");
    } catch (e) {
      setLoadedOrg(null);
      setError(rubricErrorInfo(e).message);
    } finally {
      setLoading(false);
    }
  }, [courseId, invalidate]);

  const clientError = useMemo(() => validateRubricDraft({ name, selected, levels }), [name, selected, levels]);

  // Orden de los RA = orden en que aparecen en la lista del curso (estable).
  const orderedSelected = useMemo(
    () => outcomes.filter(o => selected.includes(o.id)).map(o => o.id),
    [outcomes, selected],
  );

  const buildBody = useCallback((extra = {}) => {
    const cells = [];
    const crits = preview?.rubricInput?.CriteriaGroups?.[0]?.Criteria || [];
    (preview?.mapping || []).forEach((m, ci) => {
      (crits[ci]?.Cells || []).forEach((cell, li) => {
        const edited = cellEdits[cellKey(m.outcomeId, li)];
        if (edited != null && edited !== cell?.Description?.Content) {
          cells.push({ outcomeId: m.outcomeId, levelIndex: li, description: edited });
        }
      });
    });
    return {
      name: String(name || "").trim(),
      outcomeIds: orderedSelected,
      levels: levels.map(l => ({ name: String(l.name || "").trim(), points: Number(l.points) })),
      publish,
      ...(cells.length ? { cells } : {}),
      ...extra,
    };
  }, [preview, cellEdits, name, orderedSelected, levels, publish]);

  const runPreview = useCallback(async () => {
    if (!loadedOrg || clientError) { setError(clientError || "Carga primero un curso."); return; }
    setPreviewing(true); setError(""); setResult(null); setCreateError(null);
    try {
      const body = {
        name: String(name || "").trim(),
        outcomeIds: orderedSelected,
        levels: levels.map(l => ({ name: String(l.name || "").trim(), points: Number(l.points) })),
        publish,
      };
      const data = await apiPost(`/gemelo/course/${loadedOrg}/rubrics/preview`, body);
      setPreview(data);
      setCellEdits({});
    } catch (e) {
      setPreview(null);
      setError(rubricErrorInfo(e).message);
    } finally {
      setPreviewing(false);
    }
  }, [loadedOrg, clientError, name, orderedSelected, levels, publish]);

  const editCell = useCallback((outcomeId, levelIndex, text) => {
    setCellEdits(prev => ({ ...prev, [cellKey(outcomeId, levelIndex)]: text }));
  }, []);
  const cellValue = useCallback((outcomeId, levelIndex, fallback) => {
    const v = cellEdits[cellKey(outcomeId, levelIndex)];
    return v != null ? v : fallback;
  }, [cellEdits]);

  const hasEmptyCell = useMemo(() => Object.values(cellEdits).some(v => !String(v || "").trim()), [cellEdits]);

  const openConfirm = useCallback(() => { if (preview && !hasEmptyCell) setConfirmOpen(true); }, [preview, hasEmptyCell]);
  const closeConfirm = useCallback(() => { if (!creating) setConfirmOpen(false); }, [creating]);

  const createRubric = useCallback(async () => {
    if (!preview || !loadedOrg) return;
    setCreating(true); setCreateError(null); setResult(null);
    try {
      const data = await apiPost(`/gemelo/course/${loadedOrg}/rubrics`, buildBody({ confirm: true }));
      setResult(data);
      setConfirmOpen(false);
    } catch (e) {
      setCreateError(rubricErrorInfo(e));
      setConfirmOpen(false);
    } finally {
      setCreating(false);
    }
  }, [preview, loadedOrg, buildBody]);

  return {
    courseId, setCourseId, loadedOrg, outcomes, loading, error, loadOutcomes,
    name, setName, selected, toggleOutcome, selectAll, clearSelection,
    levels, updateLevel, addLevel, removeLevel, resetLevels, publish, setPublish,
    clientError, preview, previewing, runPreview, editCell, cellValue, hasEmptyCell,
    confirmOpen, openConfirm, closeConfirm, creating, createRubric, result, createError,
  };
}
