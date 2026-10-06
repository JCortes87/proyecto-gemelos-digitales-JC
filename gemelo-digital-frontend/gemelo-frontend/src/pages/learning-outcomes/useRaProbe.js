import { useCallback, useState } from "react";
import { apiGet } from "../../utils/api";

/**
 * Sondeo del registro global de RA (diagnóstico por programa).
 * Extraído de LearningOutcomesAdmin.jsx sin cambios de comportamiento.
 */
export function useRaProbe({
  orgId,
  setError,
}) {
  // ── Sondeo del registro global (diagnóstico) ──
  const [probing, setProbing] = useState(false);
  const [probeData, setProbeData] = useState(null);
  const [probeProgram, setProbeProgram] = useState(""); // ID del programa (ej: 24)
  const runProbe = useCallback(async () => {
    const ou = Number(orgId);
    if (!ou || ou <= 0) { setError("Ingresa un ID (curso u organización) para sondear."); return; }
    setProbing(true); setProbeData(null); setError("");
    try {
      const qs = probeProgram && Number(probeProgram) > 0 ? `?programId=${Number(probeProgram)}` : "";
      const res = await apiGet(`/gemelo/outcomes/probe/${ou}${qs}`);
      setProbeData(res);
    } catch (e) {
      setError(String(e?.message || "El sondeo falló."));
    } finally {
      setProbing(false);
    }
  }, [orgId, probeProgram, setError]);

  return { probing, probeData, setProbeData, probeProgram, setProbeProgram, runProbe };
}
