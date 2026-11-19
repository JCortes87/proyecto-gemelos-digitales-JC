import React, { useEffect } from "react";
import { apiGet, apiGetCached } from "../../../utils/api";

/**
 * Carga el detalle (gemelo) del estudiante seleccionado para el Drawer.
 * Extraído de TeacherDashboard.jsx sin cambios de comportamiento: el estado
 * sigue en el padre (se reciben sus setters, de identidad estable).
 */
export function useStudentDetailLoader({
  orgUnitId,
  selectedStudent,
  studentRows,
  setStudentDetail,
  setStudentLoading,
  setStudentErr,
  setDrawerTab,
}) {
  // Effect Event: lectura de studentRows sin que sea dependencia (la carga del
  // detalle no debe repetirse cada vez que cambian las filas de la tabla).
  const getStudentRows = React.useEffectEvent(() => studentRows);

  /**
   * Load student detail
   */
  useEffect(() => {
    if (!selectedStudent?.userId) return;
    // Mismo snapshot que capturaba antes el closure del efecto
    const rowsAtStart = getStudentRows();

    let alive = true;
    const controller = new AbortController();

    setStudentLoading(true);
    setStudentErr("");
    setStudentDetail(null);
    setDrawerTab("resumen");

    (async () => {
      try {
        const g = await apiGetCached(`/gemelo/course/${orgUnitId}/student/${selectedStudent.userId}`, {
          signal: controller.signal,
        });
        if (!alive) return;

        // Si el servidor no incluyó evidencias en el gradebook (modo estudiante en server antiguo),
        // las obtenemos del endpoint directo de Brightspace.
        const hasEvidences = Array.isArray(g?.gradebook?.evidences) && g.gradebook.evidences.length > 0;
        if (!hasEvidences && g?.summary?.gradedItemsCount > 0) {
          try {
            const ev = await apiGet(
              `/brightspace/course/${orgUnitId}/grades/student/${selectedStudent.userId}/evidence`,
              { signal: controller.signal }
            );
            if (alive && Array.isArray(ev?.items)) {
              const normalized = ev.items
                .filter((e) => e.points != null || e.displayed != null)
                .map((e) => {
                  const pts  = e.points   != null ? Number(e.points)    : null;
                  const max  = e.maxPoints != null ? Number(e.maxPoints) : null;
                  const scorePct = pts != null && max != null && max > 0
                    ? Math.round((pts / max) * 1000) / 10
                    : null;
                  return {
                    gradeObjectId: e.gradeObjectId,
                    name:      e.name || `Ítem ${e.gradeObjectId}`,
                    weightPct: e.weight != null ? Number(e.weight) : null,
                    scorePct,
                    status:    scorePct != null ? "graded" : (e.displayed ? "pending" : "open"),
                  };
                });
              g.gradebook = { ...(g.gradebook || {}), evidences: normalized };
            }
          } catch {
            // evidencias no disponibles — no bloquear el drawer
          }
        }

        // Enrich with email from studentRows (the list endpoint includes it)
        const rowMatch = rowsAtStart.find((r) => r.userId === selectedStudent.userId);
        if (rowMatch?.email && !g.email) {
          g.email = rowMatch.email;
        }
        setStudentDetail(g);
      } catch (e) {
        if (controller.signal.aborted || !alive) return;
        setStudentErr(String(e?.message || e));
      } finally {
        // Sin `return` dentro de finally (no-unsafe-finally): no debe tragarse
        // una excepción del try/catch; mismo efecto sobre el estado.
        if (alive) setStudentLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [selectedStudent?.userId, orgUnitId, setStudentLoading, setStudentErr, setStudentDetail, setDrawerTab]);
}
