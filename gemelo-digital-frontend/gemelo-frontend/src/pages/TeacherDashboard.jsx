import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useTheme } from "../context/useTheme";
import CommandPalette from "../components/ui/CommandPalette";
import SharedCesaLoader from "../components/ui/CesaLoader";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import SmartAlerts from "../components/dashboard/SmartAlerts";
import CourseTrends from "../components/dashboard/CourseTrends";
import DueDateCalendar from "../components/dashboard/DueDateCalendar";
import GradePredictions from "../components/dashboard/GradePredictions";
import EvidenceReports from "../components/dashboard/EvidenceReports";
const CoordinatorDashboard = React.lazy(() => import("./CoordinatorDashboard"));
const StudentPortal = React.lazy(() => import("./StudentPortal"));
import useStudentNotes from "../hooks/useStudentNotes";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import useCourseSnapshots from "../hooks/useCourseSnapshots";
import useStudentChat from "../hooks/useStudentChat";
import { STUDENT_CSV_COLUMNS } from "../utils/export";
import { apiUrl, apiGetCached, apiPost, getSessionId, setSessionId, authHeaders } from "../utils/api";
import {
  toDate, weeksBetween, clamp, normStatus, contentRhythmStatus, flattenOutcomeDescriptions,
  computeRiskFromPct, contentTypeLabel, countEducationalResources,
} from "../utils/helpers";
import { isStudentRole } from "../utils/roles";
import VoiceAssistant from "../components/dashboard/VoiceAssistant";
import { findLowestResultStudent, findHighestRiskStudent } from "../utils/voiceCommands";
import RoutesView from "../components/dashboard/RoutesView";
// Módulos extraídos de este archivo (#15): estilos, átomos de UI, paneles,
// layout, modales, onboarding y el vinculador de RAs.
import { injectStyles } from "./teacher/dashboardStyles";
import useMediaQuery from "../hooks/useMediaQuery";
import { ThresholdsModal, Card, InfoTooltip } from "./teacher/primitives";

// Constantes y helpers puros del tablero (antes definidos aquí).
import { SERVICE_ACCOUNT_RE } from "./teacher/utils";
import { OnboardingTutorial, GuidedTour } from "./teacher/onboarding";
import { LoginScreen, CesaLoader, Drawer, CoursePanel } from "./teacher/panels";
import { AppSidebar, AppTopbar } from "./teacher/layout";
import { FloatingAI } from "./teacher/modals";
import { RaLinker } from "./teacher/RaLinker";
// Secciones grandes del render extraídas a componentes (refactor fase 2)
import { DashboardTab } from "./teacher/DashboardTab";
import { StudentsTab } from "./teacher/StudentsTab";
import { StudentDrawerBody } from "./teacher/StudentDrawerBody";
import { StudentPickerModal } from "./teacher/StudentPickerModal";
import { CourseSelectScreen } from "./teacher/CourseSelectScreen";
import { CourseErrorScreen } from "./teacher/CourseErrorScreen";
// Carga de datos extraída a hooks (refactor fase 2)
import { useCourseOverviewLoader } from "./teacher/hooks/useCourseOverviewLoader";
import { useCourseInfoLoader } from "./teacher/hooks/useCourseInfoLoader";
import { useCourseActivityData } from "./teacher/hooks/useCourseActivityData";
import { useStudentDetailLoader } from "./teacher/hooks/useStudentDetailLoader";
import { useVoiceSearch } from "./teacher/hooks/useVoiceSearch";

/**
 * =========================
 * Config
 * =========================
 */

const DEFAULT_ORG_UNIT_ID = 0; // Se sobreescribe con el curso del LTI o selección del docente

export default function TeacherDashboard() {
  useEffect(() => {
    injectStyles();
  }, []);

  // Marca a este usuario como "staff" (docente/admin) → sí recibe correos.
  useEffect(() => {
    apiPost("/gemelo/audience", { audience: "staff" }).catch(() => {});
  }, []);

  // Read initialOrgUnitId from AuthContext — AuthContext claims sessionStorage
  // early (before lazy-loaded TeacherDashboard mounts), so we rely on the
  // context value instead of reading sessionStorage directly here.
  const { initialOrgUnitId: ctxInitialOrgUnitId, isDualRole, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const isNarrow = useMediaQuery("(max-width: 900px)");
  const isMobile = useMediaQuery("(max-width: 640px)");
  // Pantallas compactas (laptops pequeños): la fila RA+Asignaciones+Accesos
  // se reorganiza y el sidebar puede contraerse para ganar espacio.
  const isCompact = useMediaQuery("(max-width: 1366px)");
  // ≤1024 el CSS ya oculta el sidebar y se abre como overlay (mobileOpen)
  const isOverlaySidebar = useMediaQuery("(max-width: 1024px)");

  // ── Section refs for voice scroll navigation ────────────
  const overviewRef        = React.useRef(null);
  const priorityRef        = React.useRef(null);
  const learningOutcomesRef = React.useRef(null);
  const studentsRef        = React.useRef(null);

  // ── Voice command state ─────────────────────────────────
  const [voiceFeedback, setVoiceFeedback] = useState("");
  // null al inicio: solo cambia cuando un comando de voz/paleta navega.
  // (Si arranca en "students", el efecto de navegación abre esa pestaña al montar.)
  const [activeSection, setActiveSection] = useState(null);
  const [advancedQuery, setAdvancedQuery] = useState({ mode: "text", target: null });

  // Tema global (ThemeContext): respeta y persiste la preferencia del usuario.
  const { darkMode, setDarkMode } = useTheme();

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState(null); // { user_id, user_name, user_email }
  const [showTutorial, setShowTutorial] = React.useState(false);

  useEffect(() => {
    (async () => {
      try {
        // ── Leer hash fragment del callback OAuth ──
        // Formato: #gemelo:SESSION_ID:orgUnitId:first_login
        // El hash nunca va al servidor ni se cachea — es la fuente más confiable
        let _sid = null;
        let _hashOu = null;
        const _hash = window.location.hash;
        if (_hash.startsWith("#gemelo:")) {
          const parts = _hash.slice(1).split(":");
          // parts = ["gemelo", "SESSION_ID", "orgUnitId", "1"]
          if (parts.length >= 2) {
            _sid    = parts[1] || null;
            _hashOu = parts[2] && Number(parts[2]) > 0 ? Number(parts[2]) : null;
            const _fl = parts[3];
            if (_fl === "1") sessionStorage.setItem("gemelo_first_login", "1");
          }
          // Limpiar el hash de la URL sin recargar
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }

        // Fallback: leer de localStorage (visitas posteriores sin hash)
        if (!_sid) _sid = getSessionId();

        // Guardar session_id en localStorage para peticiones siguientes
        if (_sid) setSessionId(_sid);

        // Aplicar orgUnitId del hash si vino en el fragmento
        if (_hashOu) {
          setOrgUnitId(_hashOu);
          setOrgUnitInput(String(_hashOu));
        }

        // Llamar /auth/me (el sid va solo en el header Bearer, nunca en la URL)
        const res = await fetch(apiUrl("/auth/me"), {
          credentials: "include",
          headers: authHeaders(_sid),
        });
        const data = await res.json();
        if (data.authenticated) {
          setAuthUser(data);
          // Recuperar orgUnitId guardado en sessionStorage (viene del LTI)
          const savedOu = sessionStorage.getItem("gemelo_pending_org");
          if (savedOu && Number(savedOu) > 0) {
            sessionStorage.removeItem("gemelo_pending_org");
            setOrgUnitId(Number(savedOu));
            setOrgUnitInput(savedOu);
          }
          // Tutorial SOLO si nunca lo ha visto (gemelo_onboarded). No usar la
          // bandera first_login del hash: el backend la manda en "1" en cada
          // login y el tutorial se relanzaba en cada entrada.
          sessionStorage.removeItem("gemelo_first_login");
          const alreadyOnboarded = localStorage.getItem("gemelo_onboarded") === "1";
          if (!alreadyOnboarded) {
            setShowTutorial(true);
          }
          // Saludo de voz "Bienvenido de nuevo" DESACTIVADO temporalmente:
          // se reproducía en cada recarga y cada reproducción consumía tokens
          // de ElevenLabs. Reactivar restaurando el elSpeak aquí cuando se
          // termine la etapa de ajustes frecuentes.
        } else if (data.lti_detected) {
          // LTI detectado sin token OAuth → guardar orgUnitId y redirigir a OAuth
          const ou = data.org_unit_id || "";
          if (ou) sessionStorage.setItem("gemelo_pending_org", ou);
          const loginPath = ou
            ? apiUrl(`/auth/brightspace/login?org_unit_id=${ou}`)
            : apiUrl("/auth/brightspace/login");
          window.location.href = loginPath;
          return;
        }
      } catch {
        // offline / error → mostrar login
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  // orgUnitId ya se inicializa desde la URL en el useState lazy initializer

  // Scroll to section when voice command navigates
  useEffect(() => {
    // La tabla de estudiantes ahora vive en su propia pestaña
    if (activeSection === "students") {
      setActiveTab("students");
      return;
    }
    const map = {
      overview:          overviewRef,
      priority:          priorityRef,
      "learning-outcomes": learningOutcomesRef,
      students:          studentsRef,
    };
    const ref = map[activeSection];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const [orgUnitId, setOrgUnitId] = useState(() => {
    // Priority 1: AuthContext initial value (from LTI hash fragment or RoleHome selection)
    if (ctxInitialOrgUnitId && Number(ctxInitialOrgUnitId) > 0) {
      return Number(ctxInitialOrgUnitId);
    }
    // Priority 2: URL query params (OAuth callback flow)
    const params = new URLSearchParams(window.location.search);
    const ou = params.get("orgUnitId");
    const fl = params.get("first_login");
    if (fl === "1") sessionStorage.setItem("gemelo_first_login", "1");

    if (ou && Number(ou) > 0) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, "", cleanUrl);
      return Number(ou);
    }
    if (params.toString()) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Priority 3: sessionStorage fallback (in case AuthContext didn't clear it)
    const saved = sessionStorage.getItem("gemelo_pending_org");
    if (saved && Number(saved) > 0) return Number(saved);
    return DEFAULT_ORG_UNIT_ID;
  });
  const [orgUnitInput, setOrgUnitInput] = useState(() => {
    if (ctxInitialOrgUnitId && Number(ctxInitialOrgUnitId) > 0) {
      return String(ctxInitialOrgUnitId);
    }
    const params = new URLSearchParams(window.location.search);
    const ou = params.get("orgUnitId");
    if (ou && Number(ou) > 0) return ou;
    const saved = sessionStorage.getItem("gemelo_pending_org");
    if (saved && Number(saved) > 0) return saved;
    return String(DEFAULT_ORG_UNIT_ID || "");
  });

  // If AuthContext provides initialOrgUnitId AFTER mount (e.g., slow auth), apply it
  useEffect(() => {
    if (ctxInitialOrgUnitId && Number(ctxInitialOrgUnitId) > 0 && !orgUnitId) {
      setOrgUnitId(Number(ctxInitialOrgUnitId));
      setOrgUnitInput(String(ctxInitialOrgUnitId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxInitialOrgUnitId]);

  const [outcomesMap, setOutcomesMap] = useState({});
  const [learningOutcomesPayload, setLearningOutcomesPayload] = useState(null);
  const [contentRoot, setContentRoot] = useState([]);
  const [overview, setOverview] = useState(null);
  const [studentsList, setStudentsList] = useState(null);
  const [studentRows, setStudentRows] = useState([]);
  const [raDashboard, setRaDashboard] = useState(null);
  // Pestaña activa en "Prioridad académica": RA por rúbrica/asignación vs por quiz.
  const [raTab, setRaTab] = useState("rubrica");

  // Last data fetch timestamp + refresh trigger
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Cuando el usuario pulsa "Actualizar ahora" marcamos este ref para que la
  // siguiente carga pida datos en vivo a Brightspace (fresh_max_minutes=0) en
  // vez de leer el cache de Postgres. La carga inicial lo deja en false para
  // seguir siendo rapida (DB-first).
  const forceFreshRef = React.useRef(false);
  const handleRefresh = React.useCallback(() => {
    forceFreshRef.current = true;
    setRefreshKey((k) => k + 1);
  }, []);

  // switchCourse: hard reset all course-specific state BEFORE changing orgUnitId.
  // This prevents sticky error states when switching between courses after
  // a 403 / access denied error.
  const switchCourse = React.useCallback((newId) => {
    const n = Number(newId);
    if (!(n > 0)) return;
    // Clear all course state explicitly (don't rely on useEffect)
    setErr("");
    setOverview(null);
    setStudentsList(null);
    setStudentRows([]);
    setRaDashboard(null);
    setLearningOutcomesPayload(null);
    setOutcomesMap({});
    setStudentDetail(null);
    setSelectedStudent(null);
    setStudentErr("");
    setStudentLoading(false);
    setCourseInfo(null);
    setContentRoot([]);
    setLoading(true);
    // Now set the new course — useEffect will fetch fresh data
    setOrgUnitId(n);
    setOrgUnitInput(String(n));
    // Close any open course panel
    setShowCoursePanel(false);
  }, []);


  // Command palette (Ctrl+K)
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Coordinator panel overlay (renders on top of dashboard, avoids re-fetch)
  const [showCoordinator, setShowCoordinator] = useState(false);

  // SuperAdmin impersonation: view a student's portal
  const [impersonateStudent, setImpersonateStudent] = useState(null); // { userId, name }
  // Solo superadmin: "Vista estudiante" abre un selector de estudiante (modal)
  // y muestra el portal del estudiante elegido vía impersonateStudent.
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Quick filter (active filter chip applied to the students table)
  // Values: null, "risk_high", "risk_medium", "no_coverage", "overdue", "pending_grade", "approved"
  const [quickFilter, setQuickFilter] = useState(null);

  // Bulk selection (student userIds selected via checkboxes)
  const [selectedStudentIds, setSelectedStudentIds] = useState(() => new Set());
  const toggleStudentSelection = React.useCallback((userId) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);
  const clearSelection = React.useCallback(() => setSelectedStudentIds(new Set()), []);

  // Collapsible risk groups in students table
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toggleGroupCollapsed = React.useCallback((groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  // Group students table by risk?
  const [groupByRisk, setGroupByRisk] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("gemelo_group_by_risk") === "1";
  });
  useEffect(() => {
    try {
      localStorage.setItem("gemelo_group_by_risk", groupByRisk ? "1" : "0");
    } catch { /* storage bloqueado: la preferencia vive solo en memoria */ }
  }, [groupByRisk]);

  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [courseInfo, setCourseInfo] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(false);

  // CSV export configuration: which columns to include + popover open state
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvColumns, setCsvColumns] = useState(() => STUDENT_CSV_COLUMNS.map((c) => c.key));

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentErr, setStudentErr] = useState("");

  const [drawerTab, setDrawerTab] = useState("resumen");

  // ── Main navigation tabs (persisted in URL) ──────────
  const VALID_TABS = ["dashboard", "students", "calendar", "trends", "routes", "predictions", "evidences", "learning-outcomes", "assistant", "help"];
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "dashboard";
  const setActiveTab = useCallback((next) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!next || next === "dashboard") p.delete("tab");
      else p.set("tab", next);
      return p;
    }, { replace: false });
  }, [setSearchParams]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile sidebar (overlay ≤1024)
  // Tour guiado por las opciones (se ofrece al final del tutorial y vive
  // también en el menú ⚙️ → "Tour de opciones")
  const [tourActive, setTourActive] = useState(false);
  // Sidebar contraible en pantallas compactas (1025–1366 px): oculta el menú
  // lateral para dar espacio al tablero; el botón ☰ del topbar lo restaura.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarIsCollapsed = sidebarCollapsed && isCompact && !isOverlaySidebar;

  // Arranca el tour asegurando primero que el menú lateral esté visible
  // (el tour mide la posición real de cada opción en pantalla).
  const startGuidedTour = React.useCallback(() => {
    if (isOverlaySidebar) setSidebarOpen(true);
    else setSidebarCollapsed(false);
    setTimeout(() => setTourActive(true), 300);
  }, [isOverlaySidebar]);

  // ── Course panel ───────────────────────────────────────
  const [showCoursePanel, setShowCoursePanel] = useState(false);
  const [courseList, setCourseList] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseListLoaded, setCourseListLoaded] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");

  // Buscar cursos: usa /courses/enrolled (incluye roleName) como fuente principal
  const searchCourses = React.useCallback(async (term) => {
    setLoadingCourses(true);
    try {
      const q = term && term.trim().length > 0 ? term.trim() : "";

      // enrolled es la fuente principal: incluye TODOS los cursos con roleName
      // my-course-offerings como fallback (solo cursos como instructor)
      const [enrolledData, myData] = await Promise.allSettled([
        apiGetCached(`/brightspace/courses/enrolled?active_only=false&limit=200`, { ttl: 300_000 }),
        apiGetCached(`/brightspace/my-course-offerings?active_only=false&limit=50`, { ttl: 300_000 }),
      ]);

      const enrolledItems = enrolledData.status === "fulfilled"
        ? (Array.isArray(enrolledData.value?.items) ? enrolledData.value.items : [])
        : [];
      const myItems = myData.status === "fulfilled"
        ? (Array.isArray(myData.value?.items) ? myData.value.items : [])
        : [];

      // Usar enrolled como base (tiene roleName). Fallback a myItems si enrolled falla.
      let final;
      if (enrolledItems.length > 0) {
        final = enrolledItems;
      } else {
        // Fallback: my-course-offerings (solo instructor, sin roleName)
        final = myItems.map(c => ({ ...c, roleName: "Instructor" }));
      }

      // Filtrar por búsqueda
      if (q) {
        final = final.filter(c =>
          String(c.name || "").toLowerCase().includes(q.toLowerCase()) ||
          String(c.code || "").toLowerCase().includes(q.toLowerCase()) ||
          String(c.id || "").includes(q)
        );
      }

      final.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      });

      setCourseList(final);
      setCourseListLoaded(true);
    } catch {
      // no bloquear si falla
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  // Auto-cargar la lista de cursos al montar: necesaria para detectar si
  // el usuario es estudiante (no profesor) en el curso actual y redirigir.
  useEffect(() => {
    if (!courseListLoaded && !loadingCourses && orgUnitId && orgUnitId !== 0) {
      searchCourses("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUnitId]);

  // Auto-redirect to /portal if user is only enrolled as student in this course.
  // SuperAdmins are exempt (they can view any course as instructor).
  useEffect(() => {
    if (isSuperAdmin) return;
    if (!orgUnitId || orgUnitId === 0) return;
    if (!courseListLoaded || courseList.length === 0) return;
    const idStr = String(orgUnitId);
    const matches = courseList.filter(c => String(c.id) === idStr);
    if (matches.length === 0) return;
    const hasInstructorRole = matches.some(c => !isStudentRole(c.roleName));
    const hasStudentRole = matches.some(c => isStudentRole(c.roleName));
    if (hasStudentRole && !hasInstructorRole) {
      sessionStorage.setItem("gemelo_pending_org", String(orgUnitId));
      window.location.href = window.location.origin + "/portal";
    }
  }, [orgUnitId, courseListLoaded, courseList, isSuperAdmin]);

  // Cargar lista de cursos del docente (lazy — solo cuando abre el panel)
  const loadCourseList = React.useCallback(async () => {
    if (courseListLoaded || loadingCourses) return;
    await searchCourses("");
  }, [courseListLoaded, loadingCourses, searchCourses]);

  const handleOpenCoursePanel = () => {
    setShowCoursePanel(true);
    loadCourseList();
  };

  // Effect Event: lee siempre el loadCourseList vigente sin volverlo dependencia
  // (cambia con courseListLoaded/loadingCourses y re-dispararía la carga, p.ej.
  // reintentando en bucle si la búsqueda falla).
  const loadCourseListOnEnter = React.useEffectEvent(() => { loadCourseList(); });

  // Auto-cargar cursos solo cuando NO hay curso seleccionado (orgUnitId=0)
  // Si orgUnitId > 0 (viene de LTI o selección previa) → ir directo al dashboard
  React.useEffect(() => {
    if (authUser && (!orgUnitId || orgUnitId === 0)) {
      loadCourseListOnEnter();
    }
    // Si viene con orgUnitId del LTI, no cargar lista — ir directo
  }, [authUser, orgUnitId]);

  const handleSelectCourse = (id) => {
    switchCourse(id);
  };

  // ── Voice search (hook) ─────────────────────────────────
  const { voiceListening, voiceSupported, toggleVoice } = useVoiceSearch({
    studentRows, selectedStudent,
    setVoiceFeedback, setAdvancedQuery, setOnlyRisk, setQuery,
    setActiveSection, setSelectedStudent, setDrawerTab,
  });

  const hideGlobalProgressCol = isNarrow;
  const hideCriticalMacroCol = isMobile;
  const compactRouteCol = isNarrow;
  const useCards = isMobile;

  // Carga principal (overview + estudiantes + RA + outcomes), extraída a un hook
  useCourseOverviewLoader({
    orgUnitId, refreshKey, forceFreshRef,
    setLoading, setErr, setOverview, setStudentsList, setStudentRows,
    setRaDashboard, setLearningOutcomesPayload, setOutcomesMap, setLastUpdate,
  });

  // Información del curso + raíz de contenidos (efecto extraído a un hook)
  useCourseInfoLoader({ orgUnitId, refreshKey, setCourseInfo, setContentRoot });

  // Accesos, docentes, contenidos, entregas y consumo (hook con estado propio)
  const {
    lastAccessMap, classlistItems, instructors, contentTopics,
    contentModuleLinks, dropboxGradingStatus, consumption,
  } = useCourseActivityData({ orgUnitId, refreshKey });

  // Detalle del estudiante seleccionado (efecto extraído a un hook)
  useStudentDetailLoader({
    orgUnitId, selectedStudent, studentRows,
    setStudentDetail, setStudentLoading, setStudentErr, setDrawerTab,
  });

  // #13 Per-course threshold override (persisted in localStorage)
  const [thresholdsOverride, setThresholdsOverride] = useState(null);
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  useEffect(() => {
    if (!orgUnitId) { setThresholdsOverride(null); return; }
    try {
      const raw = localStorage.getItem(`gemelo_thresholds_${orgUnitId}`);
      setThresholdsOverride(raw ? JSON.parse(raw) : null);
    } catch { setThresholdsOverride(null); }
  }, [orgUnitId]);
  // Memoizado para que `thresholds` tenga identidad estable entre renders
  // (es dependencia de varios useMemo más abajo).
  const overviewThresholds = overview?.thresholds;
  const baseThresholds = useMemo(
    () => overviewThresholds || { critical: 50, watch: 70 },
    [overviewThresholds]
  );
  const thresholds = useMemo(() => {
    return thresholdsOverride
      ? { ...baseThresholds, ...thresholdsOverride }
      : baseThresholds;
  }, [baseThresholds, thresholdsOverride]);
  const saveThresholds = (next) => {
    if (!orgUnitId) return;
    const clean = {
      critical: Math.max(0, Math.min(100, Number(next.critical) || 0)),
      watch: Math.max(0, Math.min(100, Number(next.watch) || 0)),
    };
    if (clean.watch < clean.critical) clean.watch = clean.critical;
    setThresholdsOverride(clean);
    try { localStorage.setItem(`gemelo_thresholds_${orgUnitId}`, JSON.stringify(clean)); } catch { /* ignore */ }
  };
  const resetThresholds = () => {
    setThresholdsOverride(null);
    try { localStorage.removeItem(`gemelo_thresholds_${orgUnitId}`); } catch { /* ignore */ }
  };

  const riskData = useMemo(() => {
    // Calculado desde notas reales (no globalRiskDistribution del backend que puede ser por RA)
    const counts = { alto: 0, medio: 0, bajo: 0 };
    for (const s of studentRows) {
      if (s.isLoading || s.currentPerformancePct == null) continue;
      const r = computeRiskFromPct(s.currentPerformancePct);
      if (r in counts) counts[r]++;
    }
    return [
      { name: "Alto", key: "alto", value: counts.alto },
      { name: "Medio", key: "medio", value: counts.medio },
      { name: "Bajo", key: "bajo", value: counts.bajo },
    ];
  }, [studentRows]);

  const learningOutcomesData = useMemo(() => {
  const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras : [];
  const descList = flattenOutcomeDescriptions(learningOutcomesPayload);

  // Mostrar TODOS los RAs, incluso los sin datos (studentsWithData=0)
  // effectiveRas: si hay al menos 1 RA definido en el dashboard, mostrarlos todos
  const effectiveRas = ras.length > 0 ? ras : [];

  if (effectiveRas.length) {
    const outcomeMap = {};
    Object.values(outcomesMap || {}).forEach((o) => {
      if (o?.code) outcomeMap[String(o.code).toUpperCase()] = o;
    });

    const w = 100 / effectiveRas.length;

    return effectiveRas.map((r, idx) => {
      const code = String(r.code || `RA${idx + 1}`).toUpperCase();
      const match = outcomeMap[code];
      const fallbackDesc = descList[idx] || "";

      return {
        code,
        name: match?.title || r.label || fallbackDesc || code,
        description: match?.description || fallbackDesc || r.label || code,
        avgPct: Number(r.avgPct ?? 0),
        weightPct: Number(r.weightPct ?? w),
        status: r.status || null,
        coveragePct: Number(r.coveragePct ?? 0),
        studentsWithData: Number(r.studentsWithData ?? 0),
        totalStudents: Number(r.totalStudents ?? 0),
        alignedToAssignment: r.alignedToAssignment !== false,
        note: r.note || null,
      };
    });
  }

  // Fallback: no vino raDashboard.ras pero sí hay outcomes. Preferimos
  // usar los códigos reales (Z1O1DOR3, A1O3EAR2…) que trae el backend
  // en outcomeCodeMap → outcomesMap; sólo caemos a RA1..RAN si no hay
  // códigos detectables.
  const outcomeEntries = Object.values(outcomesMap || {}).filter((o) => o?.code);
  if (outcomeEntries.length) {
    const w = 100 / outcomeEntries.length;
    return outcomeEntries.map((o) => ({
      code: String(o.code).toUpperCase(),
      name: o.title || o.description || o.code,
      description: o.description || o.title || o.code,
      avgPct: 0,
      weightPct: w,
      status: null,
      coveragePct: 0,
      studentsWithData: 0,
      totalStudents: 0,
    }));
  }

  if (descList.length) {
    const w = 100 / descList.length;
    return descList.map((d, idx) => ({
      code: `RA${idx + 1}`,
      name: d,
      description: d,
      avgPct: 0,
      weightPct: w,
      status: null,
      coveragePct: 0,
      studentsWithData: 0,
      totalStudents: 0,
    }));
  }

  return [];
}, [raDashboard, learningOutcomesPayload, outcomesMap]);

// RA evaluados por QUIZ (pestaña lateral). El backend ya devuelve el promedio
// por outcome alineado a quizzes; aquí sólo lo adaptamos a la forma de fila.
const quizOutcomesData = useMemo(() => {
  const qo = Array.isArray(raDashboard?.quizOutcomes) ? raDashboard.quizOutcomes : [];
  const outcomeMap = {};
  Object.values(outcomesMap || {}).forEach((o) => {
    if (o?.code) outcomeMap[String(o.code).toUpperCase()] = o;
  });
  return qo.map((r, idx) => {
    const code = String(r.code || `RA${idx + 1}`).toUpperCase();
    const match = outcomeMap[code];
    return {
      code,
      name: match?.title || r.title || r.label || code,
      description: match?.description || r.title || r.label || code,
      avgPct: Number(r.avgPct ?? 0),
      weightPct: null,
      status: null,
      coveragePct: Number(r.coveragePct ?? 0),
      studentsWithData: Number(r.studentsWithData ?? 0),
      totalStudents: Number(r.totalStudents ?? 0),
      source: "quiz",
    };
  });
}, [raDashboard, outcomesMap]);

  const weakestMacro = useMemo(() => {
  if (!Array.isArray(learningOutcomesData) || !learningOutcomesData.length) return null;

  const valid = learningOutcomesData
    .filter((m) => m && m.avgPct != null && !Number.isNaN(Number(m.avgPct)))
    .map((m) => ({
      ...m,
      avgPct: Number(m.avgPct),
      coveragePct: Number(m.coveragePct ?? 0),
      studentsWithData: Number(m.studentsWithData ?? 0),
      totalStudents: Number(m.totalStudents ?? 0),
    }));

  if (!valid.length) return null;

  // Preferir RAs que SÍ se han usado (con datos/cobertura). Un RA en 0% sin
  // estudiantes evaluados es "no usado", no un desempeño real de 0; mostrar el
  // más bajo entre los usados. Solo si ninguno tiene datos, caer a todos.
  const used = valid.filter((m) => m.studentsWithData > 0 || m.coveragePct > 0);
  const pool = used.length ? used : valid;

  pool.sort((a, b) => a.avgPct - b.avgPct);
  return pool[0];
}, [learningOutcomesData]);

  // Asignaciones vencidas SIN ENTREGA por estudiante (cruce dropbox): solo
  // asignaciones individuales, con fecha pasada y posterior al inicio del
  // curso (las heredadas de importación no cuentan). Un folder cuya lista de
  // submissions no se pudo leer (ok=false) se salta para no marcar a todos.
  const overdueNoSubmitByUser = useMemo(() => {
    const map = new Map(); // userId -> [{name, dueDate}]
    const items = dropboxGradingStatus?.items || [];
    if (!items.length || !studentRows.length) return map;
    const now = new Date();
    const start = toDate(courseInfo?.StartDate);
    for (const f of items) {
      if (f.ok !== true || f.isGroup) continue;
      const d = toDate(f.dueDate);
      if (!d || d >= now) continue;
      if (start && d < start) continue; // fecha heredada
      const submitted = new Set((f.submittedIds || []).map(String));
      for (const s of studentRows) {
        if (submitted.has(String(s.userId))) continue;
        const arr = map.get(s.userId) || [];
        arr.push({ name: f.name, dueDate: d });
        map.set(s.userId, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.dueDate - b.dueDate);
    return map;
  }, [dropboxGradingStatus, studentRows, courseInfo?.StartDate]);

  // Inactividad: estudiantes sin ingresar al aula hace más de 7 días
  // (o que nunca han ingresado), del LastAccessed del classlist.
  const inactivityByUser = useMemo(() => {
    const map = new Map(); // userId -> días sin ingresar (null = nunca)
    if (!Object.keys(lastAccessMap).length) return map;
    const nowMs = Date.now();
    for (const s of studentRows) {
      const iso = lastAccessMap[String(s.userId)];
      if (!iso) { map.set(s.userId, null); continue; }
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const days = Math.floor((nowMs - d.getTime()) / 86400000);
      if (days > 7) map.set(s.userId, days);
    }
    return map;
  }, [lastAccessMap, studentRows]);

  // Asignaciones ENTREGADAS pendientes de calificar (trabajo del profesor):
  // se muestran en "Evaluación y Feedback", no en estudiantes prioritarios.
  const pendingGradingList = useMemo(() => {
    const items = dropboxGradingStatus?.items || [];
    if (!items.length) return [];
    const now = new Date();
    const nameById = new Map(studentRows.map((s) => [String(s.userId), s.displayName]));
    return items
      .filter((f) => f.ok === true && Array.isArray(f.pendingGrading) && f.pendingGrading.length > 0)
      .map((f) => {
        const d = toDate(f.dueDate);
        return {
          id: f.id,
          name: f.name,
          due: d,
          isPastDue: !!(d && d < now),
          isGroup: !!f.isGroup,
          submittedCount: (f.submittedIds || []).length,
          pendingNames: f.pendingGrading.map((p) => nameById.get(String(p.id)) || p.name || `ID ${p.id}`),
        };
      })
      .sort((a, b) => (Number(b.isPastDue) - Number(a.isPastDue)) || ((a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity)));
  }, [dropboxGradingStatus, studentRows]);
  const totalPendingGrading = useMemo(
    () => pendingGradingList.reduce((acc, f) => acc + f.pendingNames.length, 0),
    [pendingGradingList]
  );
  // Total de asignaciones publicadas (denominador del "X/Y por calificar")
  const totalAssignmentsCount = (dropboxGradingStatus?.items || []).length;

  // Asignaciones SIN fecha de vencimiento donde la mayoría ya entregó:
  // no se puede saber si "vencieron", pero si un número significativo de
  // estudiantes entregó (≥50%, mínimo 3), los que faltan probablemente van
  // tarde — se listan para que el profesor los empuje.
  const missingNoDueList = useMemo(() => {
    const items = dropboxGradingStatus?.items || [];
    if (!items.length || !studentRows.length) return [];
    const total = studentRows.length;
    const threshold = Math.max(3, Math.ceil(total * 0.5));
    const out = [];
    for (const f of items) {
      if (f.ok !== true || f.isGroup) continue;
      if (f.dueDate) continue; // solo asignaciones sin fecha de vencimiento
      const submitted = new Set((f.submittedIds || []).map(String));
      if (submitted.size < threshold) continue;
      const missing = studentRows
        .filter((s) => !submitted.has(String(s.userId)))
        .map((s) => s.displayName || `Estudiante ${s.userId}`);
      if (!missing.length) continue;
      out.push({ id: f.id, name: f.name, submittedCount: submitted.size, total, missing });
    }
    return out.sort((a, b) => b.submittedCount - a.submittedCount);
  }, [dropboxGradingStatus, studentRows]);

  // Estudiantes prioritarios — criterios de INCLUSIÓN centrados en el
  // estudiante:
  // 1. Calificación crítica (<5, riesgo alto)
  // 2. Asignaciones vencidas sin entrega
  // La inactividad (+7 días sin ingresar) NO incluye por sí sola — para eso
  // está la tarjeta "Accesos al curso"; aquí solo se muestra como alerta
  // adicional de los ya incluidos. Lo que es trabajo del profesor (entregas
  // pendientes de calificar, cobertura baja) vive en "Evaluación y Feedback".
  const assignmentRiskData = useMemo(() => {
    const loaded = studentRows.filter((s) => !s.isLoading);
    const list = [];
    for (const s of loaded) {
      const risk = computeRiskFromPct(s.currentPerformancePct);
      const overdueList = overdueNoSubmitByUser.get(s.userId) || [];
      const isLowGrade = risk === "alto";
      const hasOverdue = overdueList.length > 0;
      if (!isLowGrade && !hasOverdue) continue;
      const isInactive = inactivityByUser.has(s.userId);
      list.push({
        userId: s.userId,
        name: s.displayName || `Estudiante ${s.userId}`,
        risk,
        currentPerformancePct: s.currentPerformancePct != null ? Number(s.currentPerformancePct) : null,
        coveragePct: Number(s.coveragePct ?? 0),
        isLowGrade,
        hasOverdue,
        overdueList,
        isInactive,
        inactiveDays: inactivityByUser.get(s.userId), // null = nunca ingresó
        type: isLowGrade ? "low_grade" : "overdue",
      });
    }
    const typeOrder = { low_grade: 0, overdue: 1 };
    list.sort((a, b) => {
      const to = (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3);
      if (to !== 0) return to;
      const ov = (b.overdueList?.length ?? 0) - (a.overdueList?.length ?? 0);
      if (ov !== 0) return ov;
      return (a.currentPerformancePct ?? 999) - (b.currentPerformancePct ?? 999);
    });
    return list.slice(0, 10);
  }, [studentRows, overdueNoSubmitByUser, inactivityByUser]);

  const avgPerfPct = overview?.courseGradebook?.avgCurrentPerformancePct ?? null;
  const avgCov = overview?.courseGradebook?.avgCoveragePct ?? null;
  const covDone = avgCov == null ? 0 : Math.max(0, Math.min(100, Number(avgCov)));

  // avgPendingUngradedPct: enviado sin nota. Fuente 1: backend. Fuente 2: promedio de studentRows.
  const avgPendingUngradedPct = useMemo(() => {
    const direct =
      overview?.courseGradebook?.avgPendingUngradedPct ??
      overview?.courseGradebook?.avgPendingSubmittedPct;
    if (direct != null && !Number.isNaN(Number(direct))) {
      return Math.max(0, Math.min(100, Number(direct)));
    }
    const loaded = studentRows.filter((s) => !s.isLoading);
    if (loaded.length > 0) {
      const vals = loaded
        .map((s) => Number(s.pendingSubmittedWeightPct ?? 0))
        .filter((x) => !Number.isNaN(x));
      if (vals.length > 0)
        return Math.min(100, vals.reduce((a, b) => a + b, 0) / loaded.length);
    }
    return 0;
  }, [overview, studentRows]);

  // avgOverdueUnscoredPct: vencido sin registro. Fuente 1: backend. Fuente 2: promedio de studentRows.
  const avgOverdueUnscoredPct = useMemo(() => {
    const direct =
      overview?.courseGradebook?.avgOverdueUnscoredPct ??
      overview?.courseGradebook?.avgNotSubmittedPct;
    if (direct != null && !Number.isNaN(Number(direct))) {
      return Math.max(0, Math.min(100, Number(direct)));
    }
    const loaded = studentRows.filter((s) => !s.isLoading);
    if (loaded.length > 0) {
      const vals = loaded
        .map((s) => Number(s.overdueWeightPct ?? s.notSubmittedWeightPct ?? 0))
        .filter((x) => !Number.isNaN(x));
      if (vals.length > 0)
        return Math.min(100, vals.reduce((a, b) => a + b, 0) / loaded.length);
    }
    // Fallback 2: studentsAtRisk si rows aún no cargaron
    const atRisk = Array.isArray(overview?.studentsAtRisk) ? overview.studentsAtRisk : [];
    if (atRisk.length > 0) {
      const total = overview?.studentsCount ?? atRisk.length;
      const sum = atRisk.reduce(
        (acc, s) => acc + Number(s.overdueUnscoredWeightPct ?? s.notSubmittedWeightPct ?? 0), 0
      );
      return Math.min(100, sum / total);
    }
    return 0;
  }, [overview, studentRows]);

  const covPending = Math.max(
    0,
    Math.min(100, 100 - covDone - avgPendingUngradedPct - avgOverdueUnscoredPct)
  );

  const studentsCount = overview?.studentsCount ?? studentsList?.students?.count ?? studentRows.length ?? 0;
  const totalStudents = Number(studentsCount || 0) || 0;
  // atRiskCount calculado desde nota real (computeRiskFromPct), no desde globalRiskDistribution del backend
  // que puede basarse en RA/rúbricas y no en el gradebook final.
  const atRiskCount = studentRows.filter((s) => {
    if (s.isLoading || s.currentPerformancePct == null) return false;
    return computeRiskFromPct(s.currentPerformancePct) !== "bajo";
  }).length;
  const atRiskPct = totalStudents > 0 ? (atRiskCount / totalStudents) * 100 : null;

  const courseStatus = useMemo(() => {
    if (avgPerfPct != null && Number(avgPerfPct) > 0) {
      const p = Number(avgPerfPct);
      if (p < thresholds.critical) return "critico";
      if (p < thresholds.watch) return "en seguimiento";
      return "solido";
    }
    // Fallback: distribución calculada desde notas reales de studentRows
    const loaded = studentRows.filter((s) => !s.isLoading && s.currentPerformancePct != null);
    if (!loaded.length) return "pending";
    const a = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto").length;
    const m = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio").length;
    const b = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "bajo").length;
    if (a >= m && a >= b && a > 0) return "critico";
    if (m >= a && m >= b && m > 0) return "en desarrollo";
    if (b > 0) return "solido";
    return "pending";
  }, [avgPerfPct, thresholds, studentRows]);

  const filteredStudents = useMemo(() => {
    let list = Array.isArray(studentRows) ? [...studentRows] : [];

    // advancedQuery modes override normal filters
    if (advancedQuery.mode === "lowest-result") {
      const s = findLowestResultStudent(list);
      return s ? [s] : [];
    }
    if (advancedQuery.mode === "highest-risk") {
      const s = findHighestRiskStudent(list);
      return s ? [s] : [];
    }
    if (advancedQuery.mode === "students-at-risk") {
      return list.filter((s) => ["alto", "medio"].includes(computeRiskFromPct(s.currentPerformancePct)));
    }
    if (advancedQuery.mode === "approved") {
      return list.filter((s) => s.currentPerformancePct != null && s.currentPerformancePct >= 70);
    }

    // Normal filter path
    if (onlyRisk) list = list.filter((s) => ["alto", "medio"].includes(computeRiskFromPct(s.currentPerformancePct)));

    // Quick filter chips
    if (quickFilter === "risk_high") {
      list = list.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto");
    } else if (quickFilter === "risk_medium") {
      list = list.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio");
    } else if (quickFilter === "no_coverage") {
      list = list.filter((s) => (s.coveragePct ?? 0) < 40);
    } else if (quickFilter === "overdue") {
      list = list.filter((s) => (s.notSubmittedWeightPct ?? s.overdueWeightPct ?? 0) > 0);
    } else if (quickFilter === "pending_grade") {
      list = list.filter((s) => (s.pendingSubmittedWeightPct ?? 0) > 0);
    } else if (quickFilter === "approved") {
      list = list.filter((s) => s.currentPerformancePct != null && s.currentPerformancePct >= 70);
    } else if (quickFilter === "no_grade") {
      list = list.filter((s) => s.currentPerformancePct == null);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          String(s.userId).includes(q) ||
          String(s.displayName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [studentRows, query, onlyRisk, advancedQuery, quickFilter]);

const contentKpis = useMemo(() => {
    const root = Array.isArray(contentRoot) ? contentRoot : [];
    if (!root.length) {
      return { createdCount: null, minExpected: null, progressRatio: null };
    }

    const start = toDate(courseInfo?.StartDate);
    const end = toDate(courseInfo?.EndDate);
    if (!start) {
      return { createdCount: null, minExpected: null, progressRatio: null };
    }

    const now = new Date();
    const windowEnd = end && end < now ? end : now;

    let createdCount = 0;

    for (const mod of root) {
      if (mod?.IsHidden === true) continue;

      const items = Array.isArray(mod?.Structure) ? mod.Structure : [];
      for (const it of items) {
        const isVisible = it?.IsHidden !== true;
        const isLeafContent = Number(it?.Type) === 1; // no contar módulos/folders
        const itDate = toDate(it?.LastModifiedDate);

        if (isVisible && isLeafContent && itDate && itDate >= start) {
          createdCount += 1;
        }
      }
    }

    const weeks = weeksBetween(start, windowEnd);
    const minExpected = Math.max(1, Math.ceil(weeks / 2));
    const progressRatio = minExpected > 0 ? clamp(createdCount / minExpected, 0, 2) : null;

    // Desglose por tipo de los mismos contenidos que cuenta createdCount
    const typeCounts = {};
    for (const mod of root) {
      if (mod?.IsHidden === true) continue;
      for (const it of (Array.isArray(mod?.Structure) ? mod.Structure : [])) {
        const itDate = toDate(it?.LastModifiedDate);
        if (it?.IsHidden !== true && Number(it?.Type) === 1 && itDate && itDate >= start) {
          const label = contentTypeLabel(it?.Title || it?.ShortTitle);
          typeCounts[label] = (typeCounts[label] || 0) + 1;
        }
      }
    }
    const typeBreakdown = Object.entries(typeCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return { createdCount, minExpected, progressRatio, typeBreakdown };
  }, [contentRoot, courseInfo?.StartDate, courseInfo?.EndDate]);

  const contentRhythmMeta = useMemo(() => {
    return contentRhythmStatus(contentKpis?.progressRatio);
  }, [contentKpis]);

  // Total de temas de contenido visibles del curso (para % de consumo).
  // Preferimos /content/topics porque recorre módulos anidados; el root solo
  // trae el primer nivel y en cursos con submódulos contaba 0, dejando la
  // barra de promedio de acceso a contenidos sin mostrar (avgPct null).
  const totalContentTopics = useMemo(() => {
    if (Array.isArray(contentTopics) && contentTopics.length) {
      return contentTopics.filter((t) => t?.IsHidden !== true).length;
    }
    let n = 0;
    for (const mod of (Array.isArray(contentRoot) ? contentRoot : [])) {
      if (mod?.IsHidden === true) continue;
      for (const it of (Array.isArray(mod?.Structure) ? mod.Structure : [])) {
        if (it?.IsHidden !== true && Number(it?.Type) === 1) n += 1;
      }
    }
    return n;
  }, [contentTopics, contentRoot]);

  // Consumo de contenidos por estudiantes (temas visitados / total temas)
  const consumptionStats = useMemo(() => {
    if (consumption == null) return null; // cargando
    const per = consumption?.perUser || {};
    const perTopics = consumption?.perUserTopics || {};
    const ids = studentRows.map((r) => String(r.userId));
    const vals = ids.map((id) => per[id]).filter((v) => v != null);
    if (!vals.length) return { available: false };
    const opened = vals.filter((v) => v > 0).length;
    const avgPct = totalContentTopics > 0
      ? (vals.reduce((a, b) => a + Math.min(Number(b) || 0, totalContentTopics), 0) / (vals.length * totalContentTopics)) * 100
      : null;
    const openedPct = vals.length > 0 ? (opened / vals.length) * 100 : null;
    // Detalle por estudiante: cuántos temas y cuáles (ids), ordenado desc
    const detail = studentRows
      .map((r) => {
        const id = String(r.userId);
        if (per[id] == null) return null;
        return {
          userId: r.userId,
          name: r.displayName,
          count: Number(per[id]) || 0,
          topicIds: Array.isArray(perTopics[id]) ? perTopics[id] : [],
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count);
    return { available: true, opened, total: vals.length, avgPct, openedPct, detail };
  }, [consumption, studentRows, totalContentTopics]);

  // Accesos al curso por recencia (a partir de LastAccessed del classlist).
  // Cada bucket lleva su lista completa: se despliega al hacer clic.
  const accessStats = useMemo(() => {
    if (!studentRows.length || !Object.keys(lastAccessMap).length) return null;
    const now = Date.now();
    // Buckets EXCLUYENTES (cada estudiante cae en uno solo, suman 100%):
    // hoy · entre ayer y 7 días · +7 días · nunca
    const todayList = [];   // ingresaron en las últimas 24 h
    const weekList = [];    // ingresaron entre ayer y hace 7 días (sin contar hoy)
    const staleList = [];   // llevan más de 7 días SIN ingresar
    const neverList = [];   // nunca han ingresado al curso
    for (const r of studentRows) {
      const iso = lastAccessMap[String(r.userId)];
      if (!iso) {
        neverList.push({ userId: r.userId, name: r.displayName, days: null });
        continue;
      }
      const days = (now - new Date(iso).getTime()) / 86400000;
      const entry = { userId: r.userId, name: r.displayName, days: Math.floor(days) };
      if (days <= 1) todayList.push(entry);
      else if (days <= 7) weekList.push(entry);
      else staleList.push(entry);
    }
    todayList.sort((a, b) => a.days - b.days);
    weekList.sort((a, b) => a.days - b.days);
    staleList.sort((a, b) => b.days - a.days);
    neverList.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    return {
      today: todayList.length,
      week: weekList.length,
      stale: staleList.length,
      never: neverList.length,
      total: studentRows.length,
      todayList, weekList, staleList, neverList,
    };
  }, [studentRows, lastAccessMap]);

  // Qué lista de accesos está desplegada: "today" | "week" | "stale" | "never" | null
  const [accessListOpen, setAccessListOpen] = useState(null);

  // Profesores del curso: preferimos los roles reales de LP enrollments
  // (Instructor/Profesor/Docente). Si el endpoint no devuelve nada, caemos
  // al equipo no-estudiante del classlist como antes.
  const teacherAccessList = useMemo(() => {
    let list = [];
    if (Array.isArray(instructors) && instructors.length > 0) {
      list = instructors
        .filter((u) => u?.Identifier != null)
        .map((u) => ({
          userId: String(u.Identifier),
          name: u.DisplayName || `Usuario ${u.Identifier}`,
          iso: lastAccessMap[String(u.Identifier)] ?? null,
        }));
    } else if (classlistItems.length && studentRows.length) {
      const studentIds = new Set(studentRows.map((r) => String(r.userId)));
      list = classlistItems
        .filter((u) => u?.Identifier != null && !studentIds.has(String(u.Identifier)))
        .map((u) => ({
          userId: String(u.Identifier),
          name: u.DisplayName || `${u.FirstName || ""} ${u.LastName || ""}`.trim() || `Usuario ${u.Identifier}`,
          iso: u.LastAccessed || null,
        }));
    }
    // Ocultar cuentas institucionales/de servicio: solo el profesor real
    return list.filter((t) => !SERVICE_ACCOUNT_RE.test(String(t.name).trim()));
  }, [instructors, lastAccessMap, classlistItems, studentRows]);

  // Metadatos de los elementos de contenido (id -> título/url/tipo) para el
  // detalle de consumo y la clasificación por tipo. Prefiere el endpoint
  // /content/topics (trae Url); cae al content/root si aún no llegó.
  const contentTopicMeta = useMemo(() => {
    const map = new Map();
    if (Array.isArray(contentTopics) && contentTopics.length) {
      for (const t of contentTopics) {
        if (t?.Id != null) {
          map.set(String(t.Id), {
            title: t.Title || `Elemento ${t.Id}`,
            url: t.Url || null,
            topicType: t.TopicType ?? null,
          });
        }
      }
      return map;
    }
    for (const mod of (Array.isArray(contentRoot) ? contentRoot : [])) {
      if (mod?.IsHidden === true) continue;
      for (const it of (Array.isArray(mod?.Structure) ? mod.Structure : [])) {
        if (it?.Id != null && Number(it?.Type) === 1) {
          map.set(String(it.Id), { title: it.Title || it.ShortTitle || `Elemento ${it.Id}`, url: null, topicType: null });
        }
      }
    }
    return map;
  }, [contentTopics, contentRoot]);

  // KPI de elementos publicados: total, desglose por tipo y ritmo, todo
  // derivado de la MISMA fuente para que el desglose siempre sume el total.
  // Preferimos /content/topics (con Url para clasificar); fallback al root.
  const elementsStats = useMemo(() => {
    if (Array.isArray(contentTopics) && (contentTopics.length || contentModuleLinks.length)) {
      // Cuenta TODOS los recursos visibles publicados en el curso (sin
      // importar cuándo se cargaron), incluidos los archivos enlazados
      // dentro de las páginas del curso (EmbeddedLinks) y los enlaces
      // publicados en la descripción de las unidades (moduleLinks). La
      // lógica y sus reglas de dedupe viven en countEducationalResources.
      const { total, breakdown } = countEducationalResources(contentTopics, contentModuleLinks);
      const minExpected = contentKpis?.minExpected ?? null;
      const ratio = minExpected ? clamp(total / minExpected, 0, 2) : null;
      return { total, breakdown, rhythm: contentRhythmStatus(ratio) };
    }
    return {
      total: contentKpis?.createdCount ?? null,
      breakdown: contentKpis?.typeBreakdown || [],
      rhythm: contentRhythmMeta,
    };
  }, [contentTopics, contentModuleLinks, contentKpis, contentRhythmMeta]);

  // Detalle de consumo desplegable
  const [consumptionDetailOpen, setConsumptionDetailOpen] = useState(false);
  const [consumptionStudentOpen, setConsumptionStudentOpen] = useState(null);
  // Desglose por tipo en el KPI de contenidos publicados
  const [contentTypesOpen, setContentTypesOpen] = useState(false);
  // Desplegable de asignaciones vencidas sin entrega por estudiante en
  // "Estudiantes prioritarios" (los datos vienen de overdueNoSubmitByUser,
  // ya cargados con el grading-status del curso — no requiere fetch extra).
  const [priorityOverdueOpen, setPriorityOverdueOpen] = useState(null); // userId abierto
  // Desplegables de "pendientes por calificar" y "faltan por entregar"
  // en Evaluación y Feedback
  const [pendingGradingOpen, setPendingGradingOpen] = useState(false);
  const [missingNoDueOpen, setMissingNoDueOpen] = useState(false);

  const sortedStudents = useMemo(() => {
    const list = filteredStudents.slice();
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (s) => {
      switch (sortKey) {
        case "userId":
          return Number(s.userId || 0);
        case "grade10":
          return s.currentPerformancePct == null ? -1 : Number(s.currentPerformancePct) / 10;
        case "coverage":
          return s.coveragePct == null ? -1 : Number(s.coveragePct);
        case "risk": {
          const r = normStatus(s.risk);
          return r === "alto" ? 0 : r === "medio" ? 1 : r === "bajo" ? 2 : 3;
        }
        default:
          return String(s.displayName || "").toLowerCase();
      }
    };

    list.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "es", { sensitivity: "base" }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });

    return list;
  }, [filteredStudents, sortKey, sortDir]);

  // Private teacher notes per student (localStorage)
  const studentNotesHook = useStudentNotes(orgUnitId, selectedStudent?.userId);
  // Student interaction log (chat-style timeline per student)
  const studentChatHook = useStudentChat(orgUnitId, selectedStudent?.userId);
  const [chatInputType, setChatInputType] = useState("note");
  const [chatInputText, setChatInputText] = useState("");

  // Daily snapshots for trend charts (localStorage persisted)
  const snapshotMetrics = useMemo(() => ({
    avgPct: overview?.courseGradebook?.avgCurrentPerformancePct ?? null,
    atRiskPct: atRiskPct,
    coveragePct: overview?.courseGradebook?.avgCoveragePct ?? null,
    totalStudents: studentsCount,
  }), [overview, atRiskPct, studentsCount]);
  const { snapshots: courseSnapshots } = useCourseSnapshots(orgUnitId, snapshotMetrics);

  // Helper to select a student by userId from SmartAlerts chips
  const selectStudentById = React.useCallback((uid) => {
    const s = studentRows.find((r) => r.userId === uid);
    if (s) setSelectedStudent(s);
  }, [studentRows]);

  // Palette commands
  const paletteCommands = useMemo(() => {
    const cmds = [];
    // Navigation
    cmds.push({ id: "nav_dashboard", group: "Navegar", icon: "📊", label: "Ir al Dashboard", hint: "1", action: () => setActiveTab("dashboard") });
    cmds.push({ id: "nav_students", group: "Navegar", icon: "👥", label: "Estudiantes", hint: "4", action: () => setActiveTab("students") });
    cmds.push({ id: "nav_calendar", group: "Navegar", icon: "📅", label: "Calendario de entregas", hint: "5", action: () => setActiveTab("calendar") });
    cmds.push({ id: "nav_trends", group: "Navegar", icon: "📈", label: "Tendencias del curso", hint: "6", action: () => setActiveTab("trends") });
    cmds.push({ id: "nav_routes", group: "Navegar", icon: "🛤️", label: "Rutas de atención", hint: "2", action: () => setActiveTab("routes") });
    cmds.push({ id: "nav_assistant", group: "Navegar", icon: "🤖", label: "Asistente IA", hint: "3", action: () => setActiveTab("assistant") });
    // Actions
    cmds.push({ id: "act_courses", group: "Acciones", icon: "📚", label: "Cambiar de curso", action: () => handleOpenCoursePanel() });
    cmds.push({ id: "act_refresh", group: "Acciones", icon: "⟳", label: "Refrescar datos", hint: "R", action: handleRefresh });
    cmds.push({ id: "act_print", group: "Acciones", icon: "🖨", label: "Imprimir vista actual", action: () => window.print() });
    cmds.push({ id: "act_dark", group: "Acciones", icon: darkMode ? "☀️" : "🌙", label: darkMode ? "Modo claro" : "Modo oscuro", action: () => setDarkMode(v => !v) });
    cmds.push({ id: "act_group", group: "Acciones", icon: "📑", label: groupByRisk ? "Desagrupar tabla" : "Agrupar tabla por riesgo", action: () => setGroupByRisk(v => !v) });
    // Filters
    cmds.push({ id: "fil_high", group: "Filtros", icon: "🔴", label: "Solo riesgo alto", action: () => { setQuickFilter("risk_high"); setActiveSection("students"); } });
    cmds.push({ id: "fil_med", group: "Filtros", icon: "🟡", label: "Solo riesgo medio", action: () => { setQuickFilter("risk_medium"); setActiveSection("students"); } });
    cmds.push({ id: "fil_overdue", group: "Filtros", icon: "⚠️", label: "Con entregas vencidas", action: () => { setQuickFilter("overdue"); setActiveSection("students"); } });
    cmds.push({ id: "fil_pending", group: "Filtros", icon: "⏳", label: "Con entregas pendientes por calificar", action: () => { setQuickFilter("pending_grade"); setActiveSection("students"); } });
    cmds.push({ id: "fil_approved", group: "Filtros", icon: "✅", label: "Aprobados (≥7.0)", action: () => { setQuickFilter("approved"); setActiveSection("students"); } });
    cmds.push({ id: "fil_clear", group: "Filtros", icon: "✖", label: "Limpiar filtros", action: () => { setQuickFilter(null); setQuery(""); setOnlyRisk(false); } });
    // Students — first 20 quick access
    (studentRows || []).slice(0, 50).forEach((s) => {
      cmds.push({
        id: `student_${s.userId}`,
        group: "Estudiantes",
        icon: "👤",
        label: s.displayName,
        hint: `#${s.userId}`,
        action: () => setSelectedStudent(s),
      });
    });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentRows, darkMode, groupByRisk]);

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    { keys: "ctrl+k", handler: () => setPaletteOpen(true), description: "Abrir paleta" },
    { keys: "/", handler: () => setPaletteOpen(true), description: "Abrir paleta" },
    { keys: "escape", handler: () => { setSelectedStudent(null); setPaletteOpen(false); }, description: "Cerrar" },
    { keys: "1", handler: () => setActiveTab("dashboard"), description: "Dashboard" },
    { keys: "2", handler: () => setActiveTab("routes"), description: "Rutas" },
    { keys: "3", handler: () => setActiveTab("assistant"), description: "Asistente" },
    { keys: "4", handler: () => setActiveTab("students"), description: "Estudiantes" },
    { keys: "5", handler: () => setActiveTab("calendar"), description: "Calendario" },
    { keys: "6", handler: () => setActiveTab("trends"), description: "Tendencias" },
    { keys: "r", handler: handleRefresh, description: "Refrescar" },
    { keys: "c", handler: handleOpenCoursePanel, description: "Cambiar curso" },
    { keys: "?", handler: () => setPaletteOpen(true), description: "Ayuda" },
    { keys: "shift+/", handler: () => setPaletteOpen(true), description: "Ayuda" },
  ], [darkMode, groupByRisk]);

  const makeSort = (key) => ({
    active: sortKey === key,
    dir: sortDir,
    onClick: () => {
      const d = sortKey === key && sortDir === "asc" ? "desc" : "asc";
      setSortKey(key);
      setSortDir(d);
    },
  });

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CesaLoader subtitle="Verificando sesión..." />
      </div>
    );
  }
  if (!authUser) return <LoginScreen orgUnitId={orgUnitId} />;

  // Superadmin sin curso seleccionado → SIEMPRE a su consola (RoleHome).
  // El selector de cursos de profesor no es útil para el usuario admin
  // (p. ej. Desarrollo Profesoral) y aparecía al refrescar en /dashboard.
  if ((!orgUnitId || orgUnitId === 0) && isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  // Sin curso seleccionado → mostrar selector automáticamente (visual de tarjetas, igual que RoleHome)
  if (!orgUnitId || orgUnitId === 0) {
    return (
      <CourseSelectScreen
        authUser={authUser}
        courseList={courseList}
        courseSearch={courseSearch}
        loadingCourses={loadingCourses}
        logout={logout}
        searchCourses={searchCourses}
        setCourseListLoaded={setCourseListLoaded}
        setCourseSearch={setCourseSearch}
        switchCourse={switchCourse}
      />
    );
  }

  if (loading) return <CesaLoader subtitle="Cargando tablero..." />;

  if (err) {
    return (
      <CourseErrorScreen
        err={err}
        orgUnitId={orgUnitId}
        setCourseListLoaded={setCourseListLoaded}
        setErr={setErr}
        setOrgUnitId={setOrgUnitId}
        setOrgUnitInput={setOrgUnitInput}
        setOverview={setOverview}
        setStudentRows={setStudentRows}
        setStudentsList={setStudentsList}
      />
    );
  }

  if (!overview) return <CesaLoader subtitle="Inicializando información del curso..." />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      {/* ── Tutorial primera vez ── */}
      {showTutorial && (
        <OnboardingTutorial
          userName={(authUser?.user_name || "").split(" ")[0]}
          onFinish={(startTour) => {
            setShowTutorial(false);
            if (startTour) startGuidedTour();
          }}
        />
      )}
      {/* ── Tour guiado por las opciones ── */}
      {tourActive && (
        <GuidedTour
          onFinish={() => {
            setTourActive(false);
            if (isOverlaySidebar) setSidebarOpen(false);
          }}
        />
      )}
      {/* ── Sidebar ── */}
      <AppSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentCourseName={courseInfo?.Name || (orgUnitId ? `Curso ${orgUnitId}` : null)}
        mobileOpen={sidebarOpen}
        collapsed={sidebarIsCollapsed}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Topbar ── */}
      <AppTopbar
        isMobile={isMobile}
        showSidebarToggle={isCompact}
        sidebarCollapsed={sidebarIsCollapsed}
        sidebarVisible={isOverlaySidebar ? sidebarOpen : !sidebarIsCollapsed}
        onOpenSidebar={() =>
          isOverlaySidebar ? setSidebarOpen((v) => !v) : setSidebarCollapsed((v) => !v)
        }
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        orgUnitInput={orgUnitInput}
        setOrgUnitInput={setOrgUnitInput}
        setOrgUnitId={setOrgUnitId}
        handleOpenCoursePanel={handleOpenCoursePanel}
        authUser={authUser}
        isDualRole={isDualRole}
        onGoHome={() => navigate("/")}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenCoordinator={() => setShowCoordinator(true)}
        isSuperAdmin={isSuperAdmin}
        onOpenTour={startGuidedTour}
        adminView={impersonateStudent ? "student" : "teacher"}
        onAdminViewChange={(v) => {
          // Disponible para profesores y superadmin: "Vista estudiante" abre
          // el selector de estudiantes del curso y muestra su portal.
          if (v === "student") setStudentPickerOpen(true);
          else { setImpersonateStudent(null); setStudentPickerOpen(false); }
        }}
      />

      {/* ── Main content ── */}
      <main id="main-content" tabIndex={-1} className={`app-main${sidebarIsCollapsed ? " sidebar-collapsed" : ""}`}>
        <div className="app-content">

        {/* ── Routes tab ── */}
        {activeTab === "routes" && (
          <div className="fade-up tab-enter">
            <RoutesView
              studentRows={studentRows}
              overview={overview}
              courseInfo={courseInfo}
              thresholds={thresholds}
              onSelectStudent={setSelectedStudent}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* ── Predictions tab ── */}
        {activeTab === "predictions" && (
          <div className="fade-up tab-enter">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                Visor de desempeño estudiantil · Predicciones
              </div>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
                Predicción de calificaciones finales
              </h1>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                {courseInfo?.Name || `Curso ${orgUnitId}`}
              </div>
            </div>
            <Card>
              <ErrorBoundary sectionName="Predicción de calificaciones">
                <GradePredictions
                  studentRows={studentRows}
                  onStudentClick={selectStudentById}
                  courseInfo={courseInfo}
                  variant="full"
                />
              </ErrorBoundary>
            </Card>
          </div>
        )}

        {/* ── Evidences tab ── */}
        {activeTab === "evidences" && (
          <div className="fade-up tab-enter">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                Visor de desempeño estudiantil · Informes de evidencias
              </div>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
                Evidencias por banda de desempeño
              </h1>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                {courseInfo?.Name || `Curso ${orgUnitId}`}
              </div>
            </div>
            <Card>
              <ErrorBoundary sectionName="Informes de evidencias">
                <EvidenceReports
                  orgUnitId={orgUnitId}
                  studentRows={studentRows}
                  courseInfo={courseInfo}
                  onStudentClick={selectStudentById}
                />
              </ErrorBoundary>
            </Card>
          </div>
        )}

        {/* ── Resultados de aprendizaje (vincular actividades → RA) ── */}
        {activeTab === "learning-outcomes" && (
          <div className="fade-up tab-enter">
            <ErrorBoundary sectionName="Resultados de aprendizaje">
              <RaLinker orgUnitId={orgUnitId} courseName={courseInfo?.Name} />
            </ErrorBoundary>
          </div>
        )}

        {/* ── Assistant tab ── */}
        {activeTab === "assistant" && (
          <div className="fade-up tab-enter">
            <ErrorBoundary sectionName="Asistente de voz">
              <VoiceAssistant
                studentRows={studentRows}
                overview={overview}
                raDashboard={raDashboard}
                courseInfo={courseInfo}
                thresholds={thresholds}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* ── Dashboard tab ── */}
        {activeTab === "dashboard" && (
          <DashboardTab
            accessListOpen={accessListOpen}
            accessStats={accessStats}
            assignmentRiskData={assignmentRiskData}
            atRiskCount={atRiskCount}
            atRiskPct={atRiskPct}
            avgCov={avgCov}
            avgOverdueUnscoredPct={avgOverdueUnscoredPct}
            avgPendingUngradedPct={avgPendingUngradedPct}
            avgPerfPct={avgPerfPct}
            consumptionDetailOpen={consumptionDetailOpen}
            consumptionStats={consumptionStats}
            consumptionStudentOpen={consumptionStudentOpen}
            contentKpis={contentKpis}
            contentTopicMeta={contentTopicMeta}
            contentTypesOpen={contentTypesOpen}
            courseInfo={courseInfo}
            courseStatus={courseStatus}
            covDone={covDone}
            covPending={covPending}
            dropboxGradingStatus={dropboxGradingStatus}
            elementsStats={elementsStats}
            handleOpenCoursePanel={handleOpenCoursePanel}
            handleRefresh={handleRefresh}
            isCompact={isCompact}
            isDualRole={isDualRole}
            isMobile={isMobile}
            isNarrow={isNarrow}
            lastUpdate={lastUpdate}
            learningOutcomesData={learningOutcomesData}
            learningOutcomesRef={learningOutcomesRef}
            loading={loading}
            missingNoDueList={missingNoDueList}
            missingNoDueOpen={missingNoDueOpen}
            navigate={navigate}
            orgUnitId={orgUnitId}
            overview={overview}
            overviewRef={overviewRef}
            pendingGradingList={pendingGradingList}
            pendingGradingOpen={pendingGradingOpen}
            priorityOverdueOpen={priorityOverdueOpen}
            priorityRef={priorityRef}
            quizOutcomesData={quizOutcomesData}
            raDashboard={raDashboard}
            raTab={raTab}
            riskData={riskData}
            selectStudentById={selectStudentById}
            setAccessListOpen={setAccessListOpen}
            setActiveTab={setActiveTab}
            setConsumptionDetailOpen={setConsumptionDetailOpen}
            setConsumptionStudentOpen={setConsumptionStudentOpen}
            setContentTypesOpen={setContentTypesOpen}
            setMissingNoDueOpen={setMissingNoDueOpen}
            setPendingGradingOpen={setPendingGradingOpen}
            setPriorityOverdueOpen={setPriorityOverdueOpen}
            setRaTab={setRaTab}
            setSelectedStudent={setSelectedStudent}
            studentRows={studentRows}
            studentsCount={studentsCount}
            teacherAccessList={teacherAccessList}
            thresholds={thresholds}
            totalAssignmentsCount={totalAssignmentsCount}
            totalPendingGrading={totalPendingGrading}
            totalStudents={totalStudents}
          />
        )}

        {/* ── Tendencias tab ── */}
        {activeTab === "trends" && (
        <div className="fade-up tab-enter">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              Visor de desempeño estudiantil · Tendencias
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
              Tendencias del curso
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
              {courseInfo?.Name || `Curso ${orgUnitId}`}
            </div>
          </div>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Tendencias del curso <InfoTooltip text="Evolución de nota promedio, porcentaje en riesgo y cobertura a lo largo de los últimos días. Los datos se capturan automáticamente cada vez que abres el dashboard." /></span>} accent="brand">
            <ErrorBoundary sectionName="Tendencias del curso">
              <CourseTrends snapshots={courseSnapshots} />
            </ErrorBoundary>
          </Card>
        </div>
        )}

        {/* ── Calendario tab ── */}
        {activeTab === "calendar" && (
        <div className="fade-up tab-enter">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              Visor de desempeño estudiantil · Calendario
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
              Calendario de entregas
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
              {courseInfo?.Name || `Curso ${orgUnitId}`}
            </div>
          </div>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Calendario de entregas <InfoTooltip text="Próximas entregas del curso con detección de sobrecarga (3 o más en el mismo día). Al final hay un mapa de calor semanal. Toma las fechas de las actividades calificables del curso." /></span>}>
            <ErrorBoundary sectionName="Calendario de entregas">
              <DueDateCalendar orgUnitId={orgUnitId} studentRows={studentRows} />
            </ErrorBoundary>
          </Card>
        </div>
        )}

        {/* ── Estudiantes tab ── */}
        {activeTab === "students" && (
          <StudentsTab
            advancedQuery={advancedQuery}
            authUser={authUser}
            clearSelection={clearSelection}
            collapsedGroups={collapsedGroups}
            compactRouteCol={compactRouteCol}
            courseInfo={courseInfo}
            csvColumns={csvColumns}
            csvOpen={csvOpen}
            filteredStudents={filteredStudents}
            groupByRisk={groupByRisk}
            hideCriticalMacroCol={hideCriticalMacroCol}
            hideGlobalProgressCol={hideGlobalProgressCol}
            isMobile={isMobile}
            lastAccessMap={lastAccessMap}
            makeSort={makeSort}
            onlyRisk={onlyRisk}
            orgUnitId={orgUnitId}
            overview={overview}
            query={query}
            quickFilter={quickFilter}
            selectedStudentIds={selectedStudentIds}
            setAdvancedQuery={setAdvancedQuery}
            setCsvColumns={setCsvColumns}
            setCsvOpen={setCsvOpen}
            setGroupByRisk={setGroupByRisk}
            setOnlyRisk={setOnlyRisk}
            setQuery={setQuery}
            setQuickFilter={setQuickFilter}
            setSelectedStudent={setSelectedStudent}
            setSelectedStudentIds={setSelectedStudentIds}
            setVoiceFeedback={setVoiceFeedback}
            sortedStudents={sortedStudents}
            studentRows={studentRows}
            studentsList={studentsList}
            studentsRef={studentsRef}
            thresholds={thresholds}
            toggleGroupCollapsed={toggleGroupCollapsed}
            toggleStudentSelection={toggleStudentSelection}
            toggleVoice={toggleVoice}
            useCards={useCards}
            voiceFeedback={voiceFeedback}
            voiceListening={voiceListening}
            voiceSupported={voiceSupported}
            weakestMacro={weakestMacro}
          />
        )}

        </div>
      </main>

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      {/* ── #13 Configurable risk thresholds ── */}
      {showThresholdsModal && (
        <ThresholdsModal
          current={thresholds}
          base={baseThresholds}
          isOverridden={!!thresholdsOverride}
          onSave={(v) => { saveThresholds(v); setShowThresholdsModal(false); }}
          onReset={() => { resetThresholds(); setShowThresholdsModal(false); }}
          onClose={() => setShowThresholdsModal(false)}
        />
      )}

      {/* ── Floating AI button ── */}
      {overview && (
        <FloatingAI
          onOpenTutorial={() => setShowTutorial(true)}
          onOpenAssistant={() => setActiveTab("assistant")}
        />
      )}

      {/* Course Panel overlay */}
      {showCoursePanel && (
        <CoursePanel
          courses={courseList}
          loadingCourses={loadingCourses}
          currentId={orgUnitId}
          onSelect={handleSelectCourse}
          onClose={() => setShowCoursePanel(false)}
        />
      )}

      <Drawer
        open={!!selectedStudent}
        onClose={() => {
          setSelectedStudent(null);
          setStudentDetail(null);
          setStudentErr("");
          setStudentLoading(false);
        }}
        title={selectedStudent ? `${selectedStudent.displayName}` : "Estudiante"}
        subtitle={`ID ${selectedStudent?.userId ?? "—"} · Visor de desempeño estudiantil · Vista docente`}
        extraHeader={isSuperAdmin && selectedStudent && (
          <button
            onClick={() => setImpersonateStudent({
              userId: selectedStudent.userId,
              name: selectedStudent.displayName,
            })}
            style={{
              fontSize: 11, fontWeight: 700,
              padding: "5px 10px", borderRadius: 8,
              background: "var(--warning-bg)",
              color: "var(--warning-fg)",
              border: "1px solid var(--warning-border)",
              cursor: "pointer",
              fontFamily: "var(--font)",
            }}
          >
            👁 Ver portal de este estudiante
          </button>
        )}
      >
        <StudentDrawerBody
          chatInputText={chatInputText}
          chatInputType={chatInputType}
          courseInfo={courseInfo}
          drawerTab={drawerTab}
          learningOutcomesData={learningOutcomesData}
          outcomesMap={outcomesMap}
          selectedStudent={selectedStudent}
          setChatInputText={setChatInputText}
          setChatInputType={setChatInputType}
          setDrawerTab={setDrawerTab}
          setShowThresholdsModal={setShowThresholdsModal}
          studentChatHook={studentChatHook}
          studentDetail={studentDetail}
          studentErr={studentErr}
          studentLoading={studentLoading}
          studentNotesHook={studentNotesHook}
          thresholds={thresholds}
          thresholdsOverride={thresholdsOverride}
        />
      </Drawer>

      {/* Selector de estudiante para "Vista estudiante" (profesores y superadmin) */}
      {studentPickerOpen && (
        <StudentPickerModal
          pickerSearch={pickerSearch}
          setImpersonateStudent={setImpersonateStudent}
          setPickerSearch={setPickerSearch}
          setStudentPickerOpen={setStudentPickerOpen}
          studentRows={studentRows}
        />
      )}

      {/* SuperAdmin impersonation — view a student's portal */}
      {impersonateStudent && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 310,
          background: "var(--surface-muted)",
          overflow: "auto",
        }}>
          {/* Banner: "Viewing as..." */}
          <div style={{
            position: "sticky", top: 0, zIndex: 5,
            padding: "8px 20px",
            background: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)",
            color: "#000",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 12, fontWeight: 700,
          }}>
            <span>👁 Vista previa: estás viendo como <strong>{impersonateStudent.name}</strong> (ID {impersonateStudent.userId})</span>
            <button
              onClick={() => setImpersonateStudent(null)}
              style={{
                background: "#fff", border: "none", borderRadius: 6,
                padding: "4px 12px", fontSize: 11, fontWeight: 800,
                cursor: "pointer", color: "#000",
              }}
            >
              ✕ Salir de vista previa
            </button>
          </div>
          <React.Suspense fallback={<SharedCesaLoader title="Portal del Estudiante" subtitle="Cargando vista previa" />}>
            <StudentPortal
              orgUnitIdOverride={orgUnitId}
              userIdOverride={impersonateStudent.userId}
              allowOverviewPanel={isSuperAdmin}
            />
          </React.Suspense>
        </div>
      )}

      {/* Coordinator overlay — renders ON TOP of the dashboard so data is
          preserved. When the user closes it, the dashboard is still mounted. */}
      {showCoordinator && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "var(--surface-muted)",
          overflow: "auto",
        }}>
          <React.Suspense fallback={<SharedCesaLoader title="Panel Coordinador" subtitle="Cargando" />}>
            <CoordinatorDashboard onClose={() => setShowCoordinator(false)} />
          </React.Suspense>
        </div>
      )}
    </div>
  );
}
