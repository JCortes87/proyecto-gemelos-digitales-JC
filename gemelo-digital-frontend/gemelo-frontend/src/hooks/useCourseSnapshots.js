import { useState, useEffect, useMemo } from "react";
import { apiGetCached } from "../utils/api";

/**
 * Snapshots diarios de tendencias del curso, servidos desde la DB del backend.
 * Fallback a localStorage si la API falla (sin conexión, error de red, etc.)
 *
 * Snapshot shape:
 *   { date: "YYYY-MM-DD", avgPct, atRiskPct, coveragePct, totalStudents }
 *
 * Returns:
 *   - snapshots: array ordenado por fecha (últimos 90 días)
 *   - today: snapshot de hoy (si existe)
 *   - source: "api" | "localStorage" | "empty"
 */
export default function useCourseSnapshots(orgUnitId, currentMetrics) {
  const storageKey = orgUnitId ? `gemelo_snapshots_${orgUnitId}` : null;

  const [snapshots, setSnapshots] = useState(() => {
    // Seed inicial desde localStorage mientras llega la API
    if (!storageKey || typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [source, setSource] = useState("localStorage");

  // Cargar desde la API
  useEffect(() => {
    if (!orgUnitId) return;
    let cancelled = false;

    apiGetCached(`/gemelo/course/${orgUnitId}/metric-history?days=90`)
      .then((data) => {
        if (cancelled) return;
        const apiSnaps = data?.snapshots;
        if (Array.isArray(apiSnaps) && apiSnaps.length > 0) {
          setSnapshots(apiSnaps);
          setSource("api");
          // Sincroniza localStorage con lo que llegó de la API
          try {
            localStorage.setItem(storageKey, JSON.stringify(apiSnaps));
          } catch { /* storage lleno/bloqueado: el estado en memoria ya está al día */ }
        } else {
          setSource("empty");
        }
      })
      .catch(() => {
        // Red caída — usamos lo que ya cargamos de localStorage
        setSource("localStorage");
      });

    return () => { cancelled = true; };
  }, [orgUnitId, storageKey]);

  // Primitivas de currentMetrics: el efecto depende de los valores, no de la
  // identidad del objeto (que el padre recrea en cada render).
  const mAvgPct = currentMetrics?.avgPct;
  const mAtRiskPct = currentMetrics?.atRiskPct;
  const mCoveragePct = currentMetrics?.coveragePct;
  const mTotalStudents = currentMetrics?.totalStudents;

  // Captura snapshot del día actual desde currentMetrics (escribe a localStorage + API lo persiste via overview)
  useEffect(() => {
    if (!storageKey) return;
    // (cubre también currentMetrics == null)
    if (mTotalStudents == null || mTotalStudents === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const newSnap = {
      date: today,
      avgPct: mAvgPct ?? null,
      atRiskPct: mAtRiskPct ?? null,
      coveragePct: mCoveragePct ?? null,
      totalStudents: mTotalStudents ?? 0,
    };

    // setState en efecto intencional: fusiona el snapshot de hoy en una serie
    // acumulada que también escribe la respuesta async de la API; derivarlo en
    // render cambiaría el orden de precedencia entre ambas fuentes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshots((prev) => {
      const filtered = prev.filter((s) => s.date !== today);
      const next = [...filtered, newSnap];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const trimmed = next.filter((s) => s.date >= cutoffStr);
      trimmed.sort((a, b) => a.date.localeCompare(b.date));
      try {
        localStorage.setItem(storageKey, JSON.stringify(trimmed));
      } catch { /* storage lleno/bloqueado: se conserva solo en memoria */ }
      return trimmed;
    });
  }, [storageKey, mAvgPct, mAtRiskPct, mCoveragePct, mTotalStudents]);

  const today = useMemo(() => {
    const d = new Date().toISOString().slice(0, 10);
    return snapshots.find((s) => s.date === d) || null;
  }, [snapshots]);

  return { snapshots, today, source };
}
