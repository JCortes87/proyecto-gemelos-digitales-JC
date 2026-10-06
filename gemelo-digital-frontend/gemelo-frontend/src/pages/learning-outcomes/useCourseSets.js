import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../utils/api";

/**
 * Conjuntos de RA vinculados al curso cargado: listado y desvinculación.
 * Extraído de LearningOutcomesAdmin.jsx sin cambios de comportamiento.
 */
export function useCourseSets({
  data,
  fetchLO,
  loadedOrg,
}) {
  // ── Conjuntos de RA vinculados al curso (desvincular/eliminar) ──
  const [courseSets, setCourseSets] = useState(null);      // [{setId, name, importId, outcomeCount}] | null
  const [courseSetsLoading, setCourseSetsLoading] = useState(false);
  const [deletingSetId, setDeletingSetId] = useState(null);
  const [deleteMsg, setDeleteMsg] = useState(null);        // { type: "ok"|"err", text }

  const fetchCourseSets = useCallback(async (ou) => {
    if (!ou || ou <= 0) { setCourseSets(null); return; }
    setCourseSetsLoading(true);
    try {
      const res = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
      // Un conjunto "desvinculado" queda vacío (0 RA) en Brightspace — no lo
      // mostramos como vinculado.
      const sets = Array.isArray(res?.sets) ? res.sets : [];
      setCourseSets(sets.filter(s => Number(s?.outcomeCount || 0) > 0));
    } catch {
      setCourseSets(null);
    } finally {
      setCourseSetsLoading(false);
    }
  }, []);

  // Al cargar los RA de un curso, cargar también sus conjuntos (sets) para
  // poder desvincularlos. Se refresca solo cuando cambia el curso/data.
  useEffect(() => {
    setDeleteMsg(null);
    if (loadedOrg && data) fetchCourseSets(loadedOrg);
    else setCourseSets(null);
  }, [loadedOrg, data, fetchCourseSets]);

  const unlinkSet = useCallback(async (set) => {
    const ou = loadedOrg;
    if (!ou || deletingSetId != null) return;
    const label = set?.name ? `“${set.name}”` : `#${set?.setId}`;
    const sure = window.confirm(
      `¿Desvincular el conjunto de RA ${label} del curso #${ou}?\n\n` +
      "Se quitan sus RA del registro del curso en Brightspace (el catálogo global de la " +
      "organización NO se toca y el conjunto puede reimportarse). " +
      "Las alineaciones de actividades con esos RA pueden perderse."
    );
    if (!sure) return;
    setDeletingSetId(set.setId); setDeleteMsg(null);
    try {
      const res = await apiPost("/gemelo/outcomes/course/delete-sets", {
        orgUnitId: ou, setIds: [set.setId], dryRun: false,
      });
      const r0 = (res?.results || [])[0] || {};
      if (res?.ok || r0.verifiedRemoved === true) {
        setDeleteMsg({ type: "ok", text: `Conjunto ${label} desvinculado del curso #${ou}.` });
        fetchLO(ou); // refresca RA + (via effect) los sets del curso
      } else {
        const det = typeof r0.detail === "string"
          ? r0.detail
          : (r0.warning || JSON.stringify(r0.detail || res || {}));
        setDeleteMsg({ type: "err", text: `No se pudo desvincular ${label}: ${String(det).slice(0, 240)}` });
      }
    } catch (e) {
      setDeleteMsg({ type: "err", text: `Error al desvincular ${label}: ${String(e?.message || e).slice(0, 240)}` });
    } finally {
      setDeletingSetId(null);
    }
  }, [loadedOrg, deletingSetId, fetchLO]);

  return { courseSets, courseSetsLoading, deletingSetId, deleteMsg, unlinkSet };
}
