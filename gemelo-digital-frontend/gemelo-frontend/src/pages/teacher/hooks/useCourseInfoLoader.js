import { useEffect } from "react";
import { apiGetCached } from "../../../utils/api";

/**
 * Carga la información del curso (nombre, fechas) y la raíz de contenidos.
 * Extraído de TeacherDashboard.jsx sin cambios de comportamiento: el estado
 * sigue en el padre porque switchCourse lo reinicia.
 */
export function useCourseInfoLoader({
  orgUnitId,
  refreshKey,
  setCourseInfo,
  setContentRoot,
}) {
  /**
   * Load course info + content root
   */
  useEffect(() => {
    if (!orgUnitId) return;

    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        const [courseRes, contentRes] = await Promise.allSettled([
          apiGetCached(`/brightspace/course/${orgUnitId}`, { signal: controller.signal, ttl: 300_000 }),
          apiGetCached(`/brightspace/course/${orgUnitId}/content/root`, { signal: controller.signal, ttl: 300_000 }),
        ]);

        if (!alive) return;

        if (courseRes.status === "fulfilled") {
          setCourseInfo(courseRes.value);
        } else {
          console.error("Error cargando curso:", courseRes.reason);
          setCourseInfo(null);
        }

        if (contentRes.status === "fulfilled") {
          setContentRoot(Array.isArray(contentRes.value) ? contentRes.value : []);
        } else {
          console.error("Error cargando contenido root:", contentRes.reason);
          setContentRoot([]);
        }
      } catch (e) {
        if (!alive || controller.signal.aborted) return;
        console.error("Error cargando curso/contenido:", e);
        setCourseInfo(null);
        setContentRoot([]);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [orgUnitId, refreshKey, setCourseInfo, setContentRoot]);
}
