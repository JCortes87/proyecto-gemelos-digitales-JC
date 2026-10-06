import { useEffect, useState } from "react";
import { apiGetCached } from "../utils/api";

/**
 * Esquema de calificación por defecto del curso (o null si el curso no
 * tiene / falta permiso). Cacheado por apiGetCached: el drawer y el portal
 * pueden llamarlo sin repetir la petición.
 */
export default function useGradeScheme(orgUnitId) {
  const [result, setResult] = useState({ orgUnitId: null, scheme: null });

  useEffect(() => {
    if (!orgUnitId) return undefined;
    let alive = true;
    apiGetCached(`/gemelo/course/${orgUnitId}/grade-scheme`)
      .then((r) => { if (alive) setResult({ orgUnitId, scheme: r?.available ? r.scheme : null }); })
      .catch(() => { if (alive) setResult({ orgUnitId, scheme: null }); });
    return () => { alive = false; };
  }, [orgUnitId]);

  // Si cambió el curso y aún no llega la respuesta, no mostrar el esquema anterior.
  return result.orgUnitId === orgUnitId ? result.scheme : null;
}
