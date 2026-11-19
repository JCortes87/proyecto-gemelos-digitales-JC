// @vitest-environment jsdom
// Smoke test del refactor #15: verifica que los módulos extraídos de
// TeacherDashboard.jsx importan sin errores, exportan lo esperado y que
// los átomos de UI renderizan en jsdom. Detecta imports rotos, exports
// faltantes y ciclos de importación que el build no siempre revela.
import { describe, it, expect } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

// En arranque en frío (primer run, sin caché de transformación de Vite) el
// import dinámico de TeacherDashboard y sus dependencias (recharts, etc.)
// puede superar los 5 s por defecto. Se amplía el timeout de estos tests en
// lugar de debilitar lo que verifican.
const COLD_IMPORT_TIMEOUT = 60_000;

describe("módulos extraídos: exports completos", { timeout: COLD_IMPORT_TIMEOUT }, () => {
  it("dashboardStyles exporta injectStyles y la inyecta una sola vez", async () => {
    const m = await import("./dashboardStyles");
    expect(typeof m.injectStyles).toBe("function");
    m.injectStyles();
    m.injectStyles(); // idempotente
    expect(document.querySelectorAll("#gemelo-styles")).toHaveLength(1);
  });

  it("primitives exporta los 10 átomos", async () => {
    const m = await import("./primitives");
    for (const name of [
      "StatusBadge", "CircularRing", "ThresholdsModal", "Card", "Stat",
      "Divider", "ProgressBar", "InfoTooltip", "SortTh", "CoverageBars",
    ]) {
      expect(m[name], name).toBeDefined();
    }
  });

  it("panels exporta los 13 bloques", async () => {
    const m = await import("./panels");
    for (const name of [
      "LoginScreen", "CesaLoader", "UnlinkedItemsList", "AlertsPanel", "Drawer",
      "ProjectionBlock", "NoRaMappingNotice", "QualityFlagsBlock",
      "PendingItemsBlock", "EvidencesTimeline", "CoursePanel", "StudentCard",
      "GradeDistributionCard",
    ]) {
      expect(typeof m[name], name).toBe("function");
    }
  });

  it("layout, modals, onboarding y RaLinker exportan sus componentes", async () => {
    const layout = await import("./layout");
    expect(typeof layout.AppSidebar).toBe("function");
    expect(typeof layout.AppTopbar).toBe("function");
    const modals = await import("./modals");
    expect(typeof modals.BugReportModal).toBe("function");
    expect(typeof modals.FloatingAI).toBe("function");
    const onboarding = await import("./onboarding");
    expect(typeof onboarding.AnnouncementsModal).toBe("function");
    expect(typeof onboarding.OnboardingTutorial).toBe("function");
    const ra = await import("./RaLinker");
    expect(typeof ra.RaLinker).toBe("function");
  });

  it("TeacherDashboard (página completa) importa sin errores", async () => {
    const m = await import("../TeacherDashboard");
    expect(typeof m.default).toBe("function");
  });
});

// Fase 2 del refactor: secciones del render, hooks de carga y helpers puros
// extraídos de TeacherDashboard.jsx.
describe("fase 2: módulos extraídos de TeacherDashboard", { timeout: COLD_IMPORT_TIMEOUT }, () => {
  it("utils exporta constantes y fmtLastAccess", async () => {
    const m = await import("./utils");
    expect(m.CONTENT_TYPE_ICONS.PDF).toBeDefined();
    expect(typeof m.SHOW_CONTENT_RHYTHM).toBe("boolean");
    expect(m.SERVICE_ACCOUNT_RE).toBeInstanceOf(RegExp);
    expect(m.fmtLastAccess(null)).toBe("Nunca");
    expect(m.fmtLastAccess("no-es-fecha")).toBe("—");
    expect(m.fmtLastAccess(new Date().toISOString())).toBe("Hoy");
  });

  it("secciones del render exportan sus componentes", async () => {
    const mods = {
      DashboardTab: await import("./DashboardTab"),
      StudentsTab: await import("./StudentsTab"),
      StudentDrawerBody: await import("./StudentDrawerBody"),
      CourseSelectScreen: await import("./CourseSelectScreen"),
      CourseErrorScreen: await import("./CourseErrorScreen"),
    };
    for (const [name, m] of Object.entries(mods)) {
      expect(typeof m[name], name).toBe("function");
    }
    // StudentPickerModal va envuelto en React.memo (objeto, no función)
    const picker = await import("./StudentPickerModal");
    expect(picker.StudentPickerModal).toBeDefined();
  });

  it("hooks de carga exportan funciones", async () => {
    const names = [
      "useCourseOverviewLoader", "useCourseInfoLoader", "useCourseActivityData",
      "useStudentDetailLoader", "useVoiceSearch",
    ];
    for (const name of names) {
      const m = await import(`./hooks/${name}.js`);
      expect(typeof m[name], name).toBe("function");
    }
  });
});

describe("fase 2: render básico de pantallas extraídas", { timeout: COLD_IMPORT_TIMEOUT }, () => {
  const render = async (element) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    // act() vacía el render de forma determinista (con setTimeout(0) la
    // aserción podía correr antes del commit cuando la máquina va cargada).
    await act(async () => {
      root.render(element);
    });
    return { div, root };
  };

  it("CourseErrorScreen muestra el mensaje de 'no encontrado'", async () => {
    const { CourseErrorScreen } = await import("./CourseErrorScreen");
    const noop = () => {};
    const { div } = await render(React.createElement(CourseErrorScreen, {
      err: "404 not found", orgUnitId: 123,
      setCourseListLoaded: noop, setErr: noop, setOrgUnitId: noop, setOrgUnitInput: noop,
      setOverview: noop, setStudentRows: noop, setStudentsList: noop,
    }));
    expect(div.textContent).toContain("Curso no encontrado");
    expect(div.textContent).toContain("123");
  });

  it("StudentPickerModal lista y filtra estudiantes", async () => {
    const { StudentPickerModal } = await import("./StudentPickerModal");
    const noop = () => {};
    const { div } = await render(React.createElement(StudentPickerModal, {
      pickerSearch: "ana",
      setImpersonateStudent: noop, setPickerSearch: noop, setStudentPickerOpen: noop,
      studentRows: [{ userId: 1, displayName: "Ana Pérez" }, { userId: 2, displayName: "Luis Gómez" }],
    }));
    expect(div.textContent).toContain("Ana Pérez");
    expect(div.textContent).not.toContain("Luis Gómez");
  });

  it("CourseSelectScreen separa cursos de profesor y de estudiante", async () => {
    const { CourseSelectScreen } = await import("./CourseSelectScreen");
    const noop = () => {};
    const { div } = await render(React.createElement(CourseSelectScreen, {
      authUser: { user_name: "Juana Docente" },
      courseList: [
        { id: 10, name: "Finanzas", roleName: "Profesor", isActive: true },
        { id: 11, name: "Mercadeo", roleName: "Estudiante", isActive: true },
      ],
      courseSearch: "", loadingCourses: false, logout: noop, searchCourses: noop,
      setCourseListLoaded: noop, setCourseSearch: noop, switchCourse: noop,
    }));
    expect(div.textContent).toContain("Como Profesor");
    expect(div.textContent).toContain("Como Estudiante");
    expect(div.textContent).toContain("Finanzas");
  });
});

describe("átomos de UI renderizan en jsdom", { timeout: COLD_IMPORT_TIMEOUT }, () => {
  const render = async (element) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    // act() vacía el render de forma determinista (con setTimeout(0) la
    // aserción podía correr antes del commit cuando la máquina va cargada).
    await act(async () => {
      root.render(element);
    });
    return { div, root };
  };

  it("Card renderiza título y contenido", async () => {
    const { Card } = await import("./primitives");
    const { div } = await render(
      React.createElement(Card, { title: "Mi tarjeta" }, "contenido-x")
    );
    expect(div.textContent).toContain("Mi tarjeta");
    expect(div.textContent).toContain("contenido-x");
  });

  it("Stat renderiza label y valor", async () => {
    const { Stat } = await import("./primitives");
    const { div } = await render(
      React.createElement(Stat, { label: "Promedio", value: "85%" })
    );
    expect(div.textContent).toContain("Promedio");
    expect(div.textContent).toContain("85%");
  });

  it("StatusBadge renderiza el estado", async () => {
    const { StatusBadge } = await import("./primitives");
    const { div } = await render(React.createElement(StatusBadge, { status: "critico" }));
    expect(div.textContent.length).toBeGreaterThan(0);
  });

  it("ProgressBar y CircularRing renderizan sin lanzar", async () => {
    const { ProgressBar, CircularRing } = await import("./primitives");
    await render(React.createElement(ProgressBar, { value: 65, color: "#0B5FFF" }));
    await render(React.createElement(CircularRing, { pct: 72, label: "RA1" }));
  });
});
