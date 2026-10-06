import { useCallback, useMemo, useState } from "react";
import { apiGet, apiPut } from "../../utils/api";

/**
 * Registro global de RA del tenant (visor) y edición de descripciones.
 * Extraído de LearningOutcomesAdmin.jsx sin cambios de comportamiento.
 */
export function useRaRegistry({
  setError,
}) {
  // ── Fase 1: visor del registro global de RA (solo lectura) ──
  const [regLoading, setRegLoading] = useState(false);
  const [registry, setRegistry] = useState(null);
  const [regQuery, setRegQuery] = useState("");
  const [regExpanded, setRegExpanded] = useState({}); // setId -> bool
  // ── Fase 3: edición de descripciones de RA (scope outcomes:sets:manage) ──
  const [raEdit, setRaEdit] = useState(null);   // { id, value, saving:false|'dry'|'real' }
  const [raEditMsg, setRaEditMsg] = useState(null); // { type:'ok'|'preview'|'err', text, before, after }
  const loadRegistry = useCallback(async () => {
    setRegLoading(true); setError("");
    try {
      const res = await apiGet("/gemelo/outcomes/registry");
      setRegistry(res);
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar el registro global."));
    } finally {
      setRegLoading(false);
    }
  }, [setError]);

  // Inicia la edición de un RA (carga su descripción actual en el textarea).
  const raEditStart = useCallback((o) => {
    setRaEditMsg(null);
    setRaEdit({ id: o.id, value: o.description || "", saving: false });
  }, []);
  const raEditCancel = useCallback(() => { setRaEdit(null); setRaEditMsg(null); }, []);
  const raEditChange = useCallback((v) => {
    setRaEdit(prev => prev ? { ...prev, value: v } : prev);
  }, []);
  // Guarda (dryRun=true → solo previsualiza; false → escribe en Brightspace).
  const raEditSave = useCallback(async (o, dryRun, setId) => {
    const value = (raEdit?.value ?? "").trim();
    if (!value) { setRaEditMsg({ type: "err", text: "La descripción no puede estar vacía." }); return; }
    setRaEdit(prev => prev ? { ...prev, saving: dryRun ? "dry" : "real" } : prev);
    setRaEditMsg(null);
    try {
      const res = await apiPut(
        `/gemelo/outcomes/set/${setId}/outcome/${encodeURIComponent(o.id)}`,
        { description: value, dryRun: !!dryRun },
      );
      const before = typeof res?.before === "object" ? (res.before?.Text ?? JSON.stringify(res.before)) : res?.before;
      const after = typeof res?.after === "object" ? (res.after?.Text ?? JSON.stringify(res.after)) : res?.after;
      const persisted = typeof res?.persisted === "object" ? (res.persisted?.Text ?? JSON.stringify(res.persisted)) : res?.persisted;
      if (dryRun) {
        setRaEditMsg({ type: "preview", text: "Vista previa (no se escribió en Brightspace).", before, after });
      } else if (res?.ok) {
        setRaEditMsg({ type: "ok", text: `Descripción actualizada y verificada en Brightspace (HTTP ${res.status}).`, before, after });
        setRaEdit(null);
        await loadRegistry();
      } else if (res?.warning) {
        // 2xx pero NO persistió (probable RA de tipo LORES / repositorio central).
        setRaEditMsg({
          type: "err",
          text: `${res.warning} [HTTP ${res.status} · fuente=${res.source} · GET-1set=${res.singleGetStatus}]`,
          before,
          after: persisted,
        });
      } else {
        setRaEditMsg({ type: "err", text: `Brightspace rechazó el cambio (HTTP ${res?.status ?? "?"}): ${typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail)}` });
      }
    } catch (e) {
      setRaEditMsg({ type: "err", text: String(e?.message || "No se pudo guardar la descripción.") });
    } finally {
      setRaEdit(prev => prev ? { ...prev, saving: false } : prev);
    }
  }, [raEdit, loadRegistry]);

  const regFiltered = useMemo(() => {
    if (!registry?.sets) return [];
    const q = regQuery.trim().toLowerCase();
    if (!q) return registry.sets;
    const out = [];
    for (const s of registry.sets) {
      const nameHit = (s.name || "").toLowerCase().includes(q);
      if (nameHit) { out.push(s); continue; }
      const matched = (s.outcomes || []).filter(o =>
        (o.description || "").toLowerCase().includes(q) ||
        (o.shortCode || "").toLowerCase().includes(q)
      );
      if (matched.length) out.push({ ...s, outcomes: matched });
    }
    return out;
  }, [registry, regQuery]);

  return { regLoading, registry, regQuery, setRegQuery, regExpanded, setRegExpanded, raEdit, raEditMsg, loadRegistry, raEditStart, raEditCancel, raEditChange, raEditSave, regFiltered };
}
