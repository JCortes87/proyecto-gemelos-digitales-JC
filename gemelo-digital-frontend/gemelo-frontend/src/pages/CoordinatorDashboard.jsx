import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { injectStyles } from "../styles/global";
import Breadcrumb from "../components/ui/Breadcrumb";
import { downloadCsv } from "../utils/export";
import FiltersCard from "./coordinator/FiltersCard";
import ProfessorsTab from "./coordinator/ProfessorsTab";
import CoursesTab from "./coordinator/CoursesTab";
import RiskTab from "./coordinator/RiskTab";
import CourseDrawer from "./coordinator/CourseDrawer";
import SavedQueryBanner from "./coordinator/SavedQueryBanner";
import { KpiCard, LoadProgress, TabBar } from "./coordinator/parts";
import {
  fetchSemesterCourses, useCoordinatorCatalog, useCoordinatorSemesters, useCoordinatorSummaries,
} from "./coordinator/useCoordinatorData";
import {
  aggregateProfessors, buildCourseCsv, buildProfessorCsv, buildRiskCsv,
  computeKpis, extractSemester, filterCourses, formatSemester, pickDefaultSemester,
  studentsAtRiskInMultipleCourses,
} from "./coordinator/coordinatorUtils";
import { buildRecord, lastQueryStore, missingSummaryIds } from "./coordinator/lastQueryStore";

const TAB_IDS = { profesores: "profesores", cursos: "cursos", riesgo: "riesgo" };
// Más cursos que esto no se analizan automáticamente (cada resumen consulta
// varias cosas en Brightspace): se pide acotar o confirmar.
const AUTO_ANALYZE_LIMIT = 150;
// La última consulta se guarda en el navegador como máximo una vez por
// segundo mientras llegan los lotes (y al salir de la página).
const SAVE_INTERVAL_MS = 1000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Panel Coordinador: supervisa la actividad de los PROFESORES en Brightspace
 * (reporte de notas por corte, contenido, actividades y calificación
 * pendiente). El riesgo estudiantil es secundario.
 *
 * Flujo: se carga el catálogo, el usuario filtra y pulsa "Buscar cursos";
 * los resúmenes se piden al endpoint batch en bloques de 10 cursos.
 *
 * La última consulta (filtros, cursos y resúmenes) se guarda en IndexedDB por
 * usuario y se restaura al volver, sin red; solo se re-escanea a pedido
 * ("Completar faltantes" / "Actualizar todo").
 */
export default function CoordinatorDashboard({ onClose }) {
  useEffect(() => { injectStyles(); }, []);
  const navigate = useNavigate();
  const { logout, authUser } = useAuth();
  const userId = authUser?.user_id ?? authUser?.userId ?? null;

  const { catalog, loading: catalogLoading } = useCoordinatorCatalog();
  const { semesters: bsSemesters, loading: semestersLoading } = useCoordinatorSemesters();
  const { summaries, progress, load, reset, hydrate } = useCoordinatorSummaries();

  // `semester` = id de la unidad organizativa del semestre en Brightspace, o
  // "code:AAAAPP" cuando solo se conoce el código (respaldo derivado del catálogo).
  const [semesterChoice, setSemesterChoice] = useState(null); // null = sin elegir aún
  const [semesterCoursesLoading, setSemesterCoursesLoading] = useState(false);
  const [semesterError, setSemesterError] = useState("");
  const [pendingLarge, setPendingLarge] = useState(null); // cursos esperando confirmación
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [loadedCourses, setLoadedCourses] = useState([]);
  const [tab, setTab] = useState(TAB_IDS.profesores);
  const [drawerCourseId, setDrawerCourseId] = useState(null);
  // Filtros con los que se obtuvo `loadedCourses` (lo que se guarda).
  const [activeQuery, setActiveQuery] = useState(null);
  // {savedAt} cuando la vista viene de la consulta guardada (muestra el aviso).
  const [savedInfo, setSavedInfo] = useState(null);
  const pendingQueryRef = useRef(null);  // filtros de `pendingLarge`
  const userActedRef = useRef(false);    // ya buscó: no restaurar encima
  const persistedRef = useRef(null);     // {courses, summaries} ya guardados
  const pendingSaveRef = useRef(null);   // datos por guardar
  const saveTimerRef = useRef(null);

  // Períodos: los semestres reales de Brightspace (los nombres de los cursos
  // actuales no traen el código). Si la API no responde, respaldo con los
  // códigos que se puedan deducir del catálogo.
  const semesterOptions = useMemo(() => {
    if (bsSemesters.length > 0) {
      return bsSemesters.map((s) => ({ value: String(s.id), label: s.name || s.code, code: s.code }));
    }
    const set = new Set();
    for (const c of catalog) {
      const s = extractSemester(c);
      if (s) set.add(s);
    }
    return Array.from(set).sort().reverse().map((code) => ({ value: `code:${code}`, label: formatSemester(code), code }));
  }, [bsSemesters, catalog]);

  // Semestre vigente de pregrado/posgrado como valor por defecto mientras el
  // usuario no elija otro (valor derivado, sin efectos).
  const defaultSemesterId = useMemo(() => {
    const d = pickDefaultSemester(bsSemesters);
    return d ? String(d.id) : "";
  }, [bsSemesters]);
  const semester = semesterChoice ?? defaultSemesterId;

  const chooseSemester = useCallback((v) => setSemesterChoice(v), []);
  const isBsSemester = semester !== "" && !semester.startsWith("code:");

  // Filtros del catálogo (solo cuando no se usa un semestre de Brightspace).
  const catalogFilters = useMemo(() => ({
    semester: semester.startsWith("code:") ? semester.slice(5) : "",
    category, search,
  }), [semester, category, search]);
  const matchCount = useMemo(
    () => (isBsSemester ? null : filterCourses(catalog, catalogFilters).length),
    [isBsSemester, catalog, catalogFilters],
  );

  // Conjunto visible: lo cargado (ya acotado al período), re-filtrado en vivo
  // por categoría y nombre.
  const courses = useMemo(
    () => filterCourses(loadedCourses, { category, search }),
    [loadedCourses, category, search],
  );

  const semesterLabelFor = useCallback((value) => {
    if (!value) return "Todos los períodos";
    const opt = semesterOptions.find((o) => o.value === value);
    if (opt) return opt.label;
    return value.startsWith("code:") ? formatSemester(value.slice(5)) : value;
  }, [semesterOptions]);

  // ── Persistencia de la última consulta ───────────────────────────────────
  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;
    persistedRef.current = { courses: pending.courses, summaries: pending.summaries };
    const record = buildRecord(pending);
    lastQueryStore.save(record).then((ok) => {
      if (ok) setSavedInfo((prev) => (prev ? { savedAt: record.savedAt } : prev));
    });
  }, []);

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    pendingSaveRef.current = null;
    persistedRef.current = null;
  }, []);

  // Restaurar al entrar (sin red) si hay una consulta guardada de este usuario.
  useEffect(() => {
    if (userId == null) return undefined;
    let alive = true;
    lastQueryStore.load(userId).then((rec) => {
      if (!alive || !rec || userActedRef.current) return;
      persistedRef.current = { courses: rec.courses, summaries: rec.summaries };
      const f = rec.filters;
      if (typeof f.semester === "string" && f.semester !== "") setSemesterChoice(f.semester);
      setCategory(f.category || "all");
      setSearch(f.search || "");
      setActiveQuery(f);
      setLoadedCourses(rec.courses);
      hydrate(rec.summaries);
      setHasSearched(true);
      setSavedInfo({ savedAt: rec.savedAt });
    });
    return () => { alive = false; };
  }, [userId, hydrate]);

  // Guardado progresivo: como máximo cada SAVE_INTERVAL_MS mientras llegan lotes.
  useEffect(() => {
    if (userId == null || !hasSearched || !activeQuery || loadedCourses.length === 0) return;
    const p = persistedRef.current;
    if (p && p.courses === loadedCourses && p.summaries === summaries) return;
    pendingSaveRef.current = { userId, filters: activeQuery, courses: loadedCourses, summaries };
    if (!saveTimerRef.current) saveTimerRef.current = setTimeout(flushSave, SAVE_INTERVAL_MS);
  }, [userId, hasSearched, activeQuery, loadedCourses, summaries, flushSave]);

  // Al salir o recargar: guardar lo pendiente de inmediato.
  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushSave();
    };
  }, [flushSave]);

  const startAnalysis = useCallback((list, query) => {
    userActedRef.current = true;
    setPendingLarge(null);
    pendingQueryRef.current = null;
    setSavedInfo(null);
    setActiveQuery(query);
    setHasSearched(true);
    setLoadedCourses(list);
    load(list.map((c) => c.id));
  }, [load]);

  const handleSearch = async () => {
    userActedRef.current = true;
    setSemesterError("");
    setPendingLarge(null);
    const query = { semester, semesterLabel: semesterLabelFor(semester), category, search };
    let relevant;
    if (isBsSemester) {
      setSemesterCoursesLoading(true);
      try {
        relevant = filterCourses(await fetchSemesterCourses(semester), { category, search });
      } catch (e) {
        setSemesterError(e?.status === 401 ? "Sesión expirada" : "No se pudieron cargar los cursos del período");
        setSemesterCoursesLoading(false);
        return;
      }
      setSemesterCoursesLoading(false);
    } else {
      relevant = filterCourses(catalog, catalogFilters);
    }
    if (relevant.length > AUTO_ANALYZE_LIMIT) {
      reset();
      setHasSearched(false);
      setLoadedCourses([]);
      setSavedInfo(null);
      pendingQueryRef.current = query;
      setPendingLarge(relevant);
      return;
    }
    startAnalysis(relevant, query);
  };

  // Descarta la consulta guardada y vuelve al estado vacío.
  const discardSaved = () => {
    userActedRef.current = true;
    cancelPendingSave();
    if (userId != null) lastQueryStore.clear(userId);
    reset();
    setHasSearched(false);
    setLoadedCourses([]);
    setActiveQuery(null);
    setSavedInfo(null);
    setPendingLarge(null);
  };

  const handleClear = () => {
    discardSaved();
    setHasSearched(false);
    setLoadedCourses([]);
    setSemesterError("");
    setPendingLarge(null);
    setCategory("all");
    setSearch("");
  };

  const retry = useCallback((ids) => load(ids, { reset: false }), [load]);
  const missingIds = useMemo(() => missingSummaryIds(loadedCourses, summaries), [loadedCourses, summaries]);
  const completeMissing = () => load(missingIds, { reset: false });
  const refreshAll = () => load(loadedCourses.map((c) => c.id), { refresh: true });

  const kpis = useMemo(() => computeKpis(courses, summaries), [courses, summaries]);
  const { professors, coursesWithoutTeacher } = useMemo(
    () => aggregateProfessors(courses, summaries),
    [courses, summaries],
  );
  const multiRisk = useMemo(() => studentsAtRiskInMultipleCourses(courses, summaries, 2), [courses, summaries]);

  // Abrir el curso en la vista docente SIN recargar la página.
  const openTeacherView = useCallback((courseId) => {
    sessionStorage.setItem("gemelo_pending_org", String(courseId));
    navigate("/dashboard", { state: { orgUnitId: Number(courseId) } });
  }, [navigate]);

  const drawerCourse = drawerCourseId != null
    ? loadedCourses.find((c) => String(c.id) === String(drawerCourseId)) || null
    : null;

  const exportProfessors = (sortedList) => {
    const { headers, rows } = buildProfessorCsv(sortedList);
    downloadCsv(`coordinador_profesores_${today()}.csv`, headers, rows);
  };
  const exportCourses = () => {
    const { headers, rows } = buildCourseCsv(courses, summaries);
    downloadCsv(`coordinador_cursos_${today()}.csv`, headers, rows);
  };
  const exportRisk = () => {
    const { headers, rows } = buildRiskCsv(multiRisk);
    downloadCsv(`coordinador_riesgo_multicurso_${today()}.csv`, headers, rows);
  };

  const loading = progress.total > 0 && progress.done < progress.total;
  const tabs = [
    { id: TAB_IDS.profesores, label: "Profesores", count: professors.length },
    { id: TAB_IDS.cursos, label: "Cursos", count: courses.length },
    { id: TAB_IDS.riesgo, label: "Estudiantes en riesgo", count: multiRisk.length },
  ];
  const pctFmt = (v) => (v == null ? "—" : `${Math.round(v)}%`);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "color-mix(in srgb, var(--card) 90%, transparent)", backdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        padding: "0 24px", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-brand)", fontSize: 10, fontWeight: 900 }}>CESA</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Gemelo Digital</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Panel Coordinador</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/")} style={{ padding: "7px 12px", fontSize: 12 }}>
            Inicio
          </button>
          <button type="button" className="btn" onClick={onClose ? onClose : () => navigate("/dashboard")} style={{ padding: "7px 12px", fontSize: 12 }}>
            Vista docente
          </button>
          <button type="button" className="btn" onClick={logout} style={{ padding: "6px 10px", fontSize: 11, color: "var(--muted)" }}>
            Salir
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} style={{ padding: "24px 16px", maxWidth: 1240, margin: "0 auto" }}>
        <Breadcrumb items={[
          { label: "Inicio", icon: "🏠", onClick: () => navigate("/") },
          { label: "Panel Coordinador" },
        ]} />

        <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", margin: "4px 0 4px" }}>
          Actividad docente en Brightspace
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", maxWidth: 760 }}>
          Reporte de notas por corte, contenido publicado, actividades y entregas por calificar de los profesores de tus cursos.
        </p>

        <FiltersCard
          catalogLoading={catalogLoading || semestersLoading || semesterCoursesLoading}
          busyLabel={semesterCoursesLoading ? "Buscando cursos del período…" : null}
          semesterError={semesterError}
          semesters={semesterOptions}
          semester={semester} setSemester={chooseSemester}
          category={category} setCategory={setCategory}
          search={search} setSearch={setSearch}
          onSearch={handleSearch}
          onClear={handleClear}
          hasSearched={hasSearched}
          matchCount={matchCount}
        />

        {pendingLarge && (
          <div role="status" className="kpi-card" style={{
            marginBottom: 16, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
            background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning-fg)",
          }}>
            <div style={{ flex: "1 1 320px", fontSize: 13, lineHeight: 1.5 }}>
              <strong>{pendingLarge.length} cursos</strong> coinciden con la búsqueda. Analizarlos todos puede tardar
              muchos minutos; acota con el nombre (programa, asignatura) o la categoría y vuelve a buscar.
            </div>
            <button type="button" className="btn" onClick={() => startAnalysis(pendingLarge, pendingQueryRef.current)} style={{ padding: "8px 14px" }}>
              Analizar los {pendingLarge.length} de todas formas
            </button>
          </div>
        )}

        {!hasSearched && !pendingLarge && (
          <div className="empty-state" style={{ padding: "60px 20px" }}>
            <div className="empty-state-icon" aria-hidden="true">🏛</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Selecciona los filtros y busca</div>
            <div style={{ fontSize: 12, maxWidth: 420 }}>
              Elige el período, el tipo de programa o el nombre de la asignatura y pulsa <strong>Buscar cursos</strong> para analizar la actividad docente.
            </div>
          </div>
        )}

        {hasSearched && savedInfo && (
          <SavedQueryBanner
            semesterLabel={activeQuery?.semesterLabel}
            courseCount={loadedCourses.length}
            savedAt={savedInfo.savedAt}
            missingCount={loading ? 0 : missingIds.length}
            busy={loading}
            onCompleteMissing={completeMissing}
            onRefreshAll={refreshAll}
            onDiscard={discardSaved}
          />
        )}

        {hasSearched && (
          <>
            <LoadProgress done={progress.done} total={progress.total} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
              <KpiCard label="Cursos" value={kpis.courses} hint={`${kpis.loaded} con datos${kpis.failed ? ` · ${kpis.failed} con error` : ""}`} />
              <KpiCard label="Profesores" value={kpis.professors} />
              <KpiCard
                label="Cortes reportados"
                value={pctFmt(kpis.cortesPct)}
                hint={`${kpis.cortesPublished}/${kpis.cortesTotal} publicados (≥90% con nota)${kpis.cortesLate ? ` · ${kpis.cortesLate} vencidos` : ""}`}
                tone={kpis.cortesLate > 0 ? "critical" : kpis.cortesPct != null && kpis.cortesPct >= 90 ? "ok" : undefined}
              />
              <KpiCard label="Entregas por calificar" value={kpis.backlog} tone={kpis.backlog > 0 ? "watch" : undefined} />
              <KpiCard
                label="Estudiantes en riesgo"
                value={kpis.atRiskUnique}
                hint={`únicos · ${kpis.students} estudiantes · nota prom. ${kpis.avgPct != null ? (kpis.avgPct / 10).toFixed(1) : "—"}`}
                tone={kpis.atRiskUnique > 0 ? "critical" : undefined}
              />
            </div>

            <TabBar tabs={tabs} active={tab} onChange={setTab} idPrefix="coord" />

            <div role="tabpanel" id={`coord-panel-${tab}`} aria-labelledby={`coord-tab-${tab}`}>
              {tab === TAB_IDS.profesores && (
                <ProfessorsTab
                  professors={professors}
                  coursesWithoutTeacher={coursesWithoutTeacher}
                  onOpenCourse={setDrawerCourseId}
                  onExport={exportProfessors}
                  loading={loading}
                />
              )}
              {tab === TAB_IDS.cursos && (
                <CoursesTab
                  courses={courses}
                  summaries={summaries}
                  onOpenCourse={setDrawerCourseId}
                  onRetry={retry}
                  onExport={exportCourses}
                />
              )}
              {tab === TAB_IDS.riesgo && (
                <RiskTab students={multiRisk} onOpenCourse={setDrawerCourseId} onExport={exportRisk} />
              )}
            </div>
          </>
        )}

        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 11, color: "var(--muted)" }}>
          CESA · Gemelo Digital · Panel Coordinador
        </div>
      </main>

      {drawerCourse && (
        <CourseDrawer
          course={drawerCourse}
          summary={summaries[drawerCourse.id]}
          onClose={() => setDrawerCourseId(null)}
          onOpenTeacherView={openTeacherView}
        />
      )}
    </div>
  );
}
