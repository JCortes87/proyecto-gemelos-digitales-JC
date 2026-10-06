import { useEffect } from "react";
import { apiGetCached, invalidateApiCache } from "../../../utils/api";
import { computeRiskFromPct, suggestRouteForStudent } from "../../../utils/helpers";

/**
 * Carga principal del tablero: overview del curso, estudiantes (con resumen),
 * dashboard de RA y learning outcomes; construye las filas de estudiantes.
 * Extraído de TeacherDashboard.jsx sin cambios de comportamiento: el estado
 * sigue en el padre (switchCourse y la pantalla de error lo reinician).
 */
export function useCourseOverviewLoader({
  orgUnitId,
  refreshKey,
  forceFreshRef,
  setLoading,
  setErr,
  setOverview,
  setStudentsList,
  setStudentRows,
  setRaDashboard,
  setLearningOutcomesPayload,
  setOutcomesMap,
  setLastUpdate,
}) {
  /**
   * Load course overview/student dashboard
   */
  useEffect(() => {
    // No cargar si no hay curso seleccionado
    if (!orgUnitId || orgUnitId === 0) {
      setLoading(false);
      setOverview(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    setLoading(true);
    setErr("");
    setOverview(null);
    setStudentsList(null);
    setStudentRows([]);
    setRaDashboard(null);
    setLearningOutcomesPayload(null);
    setOutcomesMap({});

    // Si el usuario pidio "Actualizar ahora", forzamos datos en vivo desde
    // Brightspace (bypass del cache de 30 min) SOLO para esta corrida, y
    // reseteamos el flag para que las cargas siguientes vuelvan a ser
    // DB-first (rapidas). Forzar tambien dispara el re-sync en background que
    // refresca enrollments (add/remove de estudiantes) y snapshots.
    const forceFresh = forceFreshRef.current;
    forceFreshRef.current = false;
    const overviewUrl =
      `/gemelo/course/${orgUnitId}/overview` +
      (forceFresh ? "?fresh_max_minutes=0" : "");

    (async () => {
      try {
        if (forceFresh) invalidateApiCache(`/gemelo/course/${orgUnitId}/`);
        const [ovRes, stRes, raRes, loRes] = await Promise.allSettled([
          apiGetCached(overviewUrl, { signal: controller.signal, force: forceFresh }),
          apiGetCached(`/gemelo/course/${orgUnitId}/students?include=summary`, { signal: controller.signal, force: forceFresh }),
          apiGetCached(`/gemelo/course/${orgUnitId}/ra/dashboard`, { signal: controller.signal, force: forceFresh }),
          apiGetCached(`/gemelo/course/${orgUnitId}/learning-outcomes`, { signal: controller.signal, force: forceFresh }),
        ]);

        if (!isMounted) return;
        if (ovRes.status !== "fulfilled") { setLoading(false); throw ovRes.reason; }
        if (stRes.status !== "fulfilled") { setLoading(false); throw stRes.reason; }

        const ov = ovRes.value;
        const st = stRes.value;

        setOverview(ov);
        setStudentsList(st);
        if (raRes.status === "fulfilled") setRaDashboard(raRes.value);

        if (loRes.status === "fulfilled") {
          const payload = loRes.value;
          setLearningOutcomesPayload(payload);

          // Recorre recursivamente cualquier arbol de outcomes de Brightspace
          // (algunos cursos, como 41634, definen los RAs como subOutcomes
          // anidados; el walker plano anterior los pasaba por alto).
          const map = {};
          const walk = (node) => {
            if (!node) return;
            if (Array.isArray(node)) { node.forEach(walk); return; }
            if (typeof node !== "object") return;

            const desc = String(node.Description ?? node.description ?? "").trim();
            if (desc) {
              const m = desc.match(/^([A-Za-z0-9_.-]+)\s*[-–—:]\s*(.+)$/);
              if (m) {
                const code = String(m[1]).toUpperCase();
                if (!map[code]) {
                  map[code] = { code, description: desc, title: String(m[2] || "").trim() };
                }
              }
            }
            const children =
              node.Outcomes || node.outcomes ||
              node.SubOutcomes || node.subOutcomes ||
              node.ChildOutcomes || node.childOutcomes ||
              node.Children || node.children;
            if (children) walk(children);
          };
          walk(payload?.outcomeSets ?? payload);
          setOutcomesMap(map);
        }

        const studentItems = (st?.students?.items || st?.items || []).slice();
        const thr = ov?.thresholds || { critical: 50, watch: 70 };

        const baseRows = studentItems.map((s) => {
          const userId = s.userId ?? s.UserId ?? s.Identifier;
          const base = {
            userId: Number(userId),
            displayName: s.displayName ?? s.DisplayName ?? "—",
            email: s.email ?? s.EmailAddress ?? null,
            roleName: s.roleName ?? "—",
            isLoading: true,
            risk: "cargando",
            globalPct: null,
            currentPerformancePct: null,
            coveragePct: null,
            coverageCountText: null,
            gradedItemsCount: null,
            totalItemsCount: null,
            hasPrescription: false,
            mostCriticalMacro: null,
            notSubmittedWeightPct: null,
          };
          base.route = suggestRouteForStudent(base, thr);
          return base;
        });

        setStudentRows(baseRows);
        setLoading(false);

        // hasInlineSummary: detecta si el backend devolvió métricas reales con datos de nota.
        // Requisito: al menos un estudiante tiene currentPerformancePct o coveragePct real.
        // Si el batch endpoint retornó todos nulos (falla silenciosa), caemos al mapLimit.
        const _hasMeaningfulData = studentItems.some((s) => {
          const sum = s.summary ?? s.gradebook ?? {};
          return sum?.currentPerformancePct != null || sum?.coveragePct != null;
        });
        // También consideramos válido si hay estructura de items (totalItemsCount > 0)
        // para al menos un estudiante — aunque no tenga nota aún
        const _hasStructure = studentItems.some((s) => {
          const sum = s.summary ?? s.gradebook ?? {};
          return (sum?.totalItemsCount != null && sum.totalItemsCount > 0);
        });
        const hasInlineSummary = studentItems.length > 0 && (_hasMeaningfulData || _hasStructure);

        if (hasInlineSummary) {
          const details = studentItems.map((s) => {
            const userId = s.userId ?? s.UserId ?? s.Identifier;
            const sum = s.summary ?? s.gradebook ?? s;
            const gradedItemsCount = sum?.gradedItemsCount ?? sum?.coverageGradedCount ?? null;
            const totalItemsCount = sum?.totalItemsCount ?? sum?.coverageTotalCount ?? null;
            const coverageCountText =
              sum?.coverageCountText ??
              (gradedItemsCount != null && totalItemsCount != null ? `${gradedItemsCount}/${totalItemsCount}` : null);

            const row = {
              userId: Number(userId),
              displayName: s.displayName ?? s.DisplayName ?? "—",
              roleName: s.roleName ?? "—",
              isLoading: false,
              // Riesgo siempre desde nota del gradebook (no del campo risk del backend que puede ser de RA)
              risk: computeRiskFromPct(sum?.currentPerformancePct ?? null),
              globalPct: sum?.globalPct ?? null,
              currentPerformancePct: sum?.currentPerformancePct ?? null,
              coveragePct: sum?.coveragePct ?? null,
              gradedItemsCount,
              totalItemsCount,
              coverageCountText,
              hasPrescription: Boolean(sum?.hasPrescription ?? s?.hasPrescription ?? false),
              mostCriticalMacro: s?.mostCriticalMacro ?? null,
              // Nombres normalizados: pendingSubmitted + overdue para compatibilidad con toda la UI
              pendingSubmittedCount:     sum?.pendingUngradedCount      ?? sum?.pendingSubmittedCount      ?? 0,
              pendingSubmittedWeightPct: sum?.pendingUngradedWeightPct  ?? sum?.pendingSubmittedWeightPct  ?? 0,
              overdueCount:              sum?.overdueUnscoredCount       ?? sum?.overdueCount               ?? 0,
              overdueWeightPct:          sum?.overdueUnscoredWeightPct   ?? sum?.overdueWeightPct           ?? 0,
              notSubmittedCount:         sum?.overdueUnscoredCount       ?? sum?.notSubmittedCount          ?? 0,
              notSubmittedWeightPct:     sum?.overdueUnscoredWeightPct   ?? sum?.notSubmittedWeightPct      ?? 0,
            };
            row.route = suggestRouteForStudent(row, thr);
            return row;
          });

          if (!isMounted) return;
          setStudentRows(details);

          // Enriquecer con datos de overview.studentsAtRisk (ya tiene currentPerformancePct
          // calculado por build_course_overview que sí usa build_gemelo individual).
          // Esto evita hacer llamadas adicionales a /student/{id} que pueden fallar por CORS
          // en algunos entornos de producción.
          const atRiskMap = {};
          for (const s of (ov?.studentsAtRisk || [])) {
            if (s.userId != null) atRiskMap[Number(s.userId)] = s;
          }
          // mostCriticalMacro por estudiante (TODOS, no solo en riesgo) — así la
          // tarjeta muestra el RA crítico real del estudiante y coincide con su detalle.
          const macroMap = ov?.studentsMostCriticalMacro || {};

          if (Object.keys(atRiskMap).length > 0 || Object.keys(macroMap).length > 0) {
            setStudentRows((prev) =>
              prev.map((row) => {
                const ar = atRiskMap[row.userId];
                const ownMacro = macroMap[row.userId] ?? macroMap[String(row.userId)] ?? null;
                if (!ar) {
                  // No en riesgo: solo enriquecer el RA crítico individual si existe.
                  if (!ownMacro) return row;
                  const merged = { ...row, mostCriticalMacro: ownMacro };
                  merged.route = suggestRouteForStudent(merged, thr);
                  return merged;
                }
                const perf = ar.currentPerformancePct ?? null;
                const merged = {
                  ...row,
                  currentPerformancePct: perf,
                  coveragePct: ar.coveragePct ?? row.coveragePct,
                  risk: computeRiskFromPct(perf),
                  notSubmittedWeightPct: Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  overdueWeightPct:      Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  pendingSubmittedWeightPct: Number(ar.pendingUngradedWeightPct ?? ar.pendingSubmittedWeightPct ?? 0),
                  // mostCriticalMacro: preferir el del estudiante en riesgo, luego el mapa global
                  mostCriticalMacro: ar.mostCriticalMacro ?? ownMacro ?? row.mostCriticalMacro ?? null,
                };
                merged.route = suggestRouteForStudent(merged, thr);
                return merged;
              })
            );
          }
          return;
        }

        // El batch /students?include=summary no devolvió estructura (hasInlineSummary=false).
        // Enriquecer desde overview.studentsAtRisk en lugar de llamar /student/{id}
        // (esas llamadas pueden fallar por CORS en producción).
        const atRiskMap2 = {};
        for (const s of (ov?.studentsAtRisk || [])) {
          if (s.userId != null) atRiskMap2[Number(s.userId)] = s;
        }
        const macroMap2 = ov?.studentsMostCriticalMacro || {};
        setStudentRows((prev) =>
          prev.map((row) => {
            const ar = atRiskMap2[row.userId];
            const ownMacro2 = macroMap2[row.userId] ?? macroMap2[String(row.userId)] ?? null;
            const perf = ar?.currentPerformancePct ?? null;
            const merged = {
              ...row,
              isLoading: false,
              currentPerformancePct: perf,
              coveragePct: ar?.coveragePct ?? row.coveragePct,
              risk: computeRiskFromPct(perf),
              notSubmittedWeightPct: Number(ar?.overdueUnscoredWeightPct ?? ar?.notSubmittedWeightPct ?? 0),
              overdueWeightPct:      Number(ar?.overdueUnscoredWeightPct ?? ar?.notSubmittedWeightPct ?? 0),
              pendingSubmittedWeightPct: Number(ar?.pendingUngradedWeightPct ?? ar?.pendingSubmittedWeightPct ?? 0),
              mostCriticalMacro: ar?.mostCriticalMacro ?? ownMacro2 ?? row.mostCriticalMacro ?? null,
            };
            merged.route = suggestRouteForStudent(merged, thr);
            return merged;
          })
        );
      } catch (e) {
        // Ignorar aborts (propios o de un consumidor compartido en apiGetCached):
        // no son errores reales del curso, solo cancelaciones de montaje/unmount.
        if (controller.signal.aborted || !isMounted || e?.name === "AbortError") return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
      // Mark the data as fetched NOW (after successful or attempted load)
      if (isMounted) setLastUpdate(Date.now());
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    orgUnitId, refreshKey, forceFreshRef,
    setLoading, setErr, setOverview, setStudentsList, setStudentRows,
    setRaDashboard, setLearningOutcomesPayload, setOutcomesMap, setLastUpdate,
  ]);
}
