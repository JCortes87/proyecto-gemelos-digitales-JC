// @vitest-environment jsdom
// Smoke test del refactor de LearningOutcomesAdmin.jsx (fase 2): verifica que
// los módulos extraídos importan sin errores y exportan lo esperado, que la
// página sigue exportando su componente por defecto (lazy en App.jsx) y que
// los helpers puros conservan su comportamiento básico.
import { describe, it, expect } from "vitest";

// Arranque en frío: el primer import dinámico puede superar los 5 s por defecto.
const COLD_IMPORT_TIMEOUT = 60_000;

describe("LearningOutcomesAdmin: módulos extraídos", { timeout: COLD_IMPORT_TIMEOUT }, () => {
  it("la página exporta su componente por defecto", async () => {
    const m = await import("../LearningOutcomesAdmin");
    expect(typeof m.default).toBe("function");
  });

  it("utils exporta constantes y helpers puros", async () => {
    const m = await import("./utils");
    for (const name of [
      "ALIGN_ACTIVITY_TYPES", "ACTIVITY_TYPE_LABELS", "STATUS_META", "chipStyle",
    ]) {
      expect(m[name], name).toBeDefined();
    }
    for (const name of [
      "parseOutcomeSetsToList", "raParts", "parseRaTemplate", "classifyCourseUnit",
      "classifyUnit", "scoreSetMatch", "suggestSetsForCourse",
    ]) {
      expect(typeof m[name], name).toBe("function");
    }
    expect(m.raParts({ description: "RA1 - Analiza estados financieros" }))
      .toMatchObject({ code: "RA1", title: "Analiza estados financieros" });
    expect(m.classifyUnit({ typeId: 5, typeName: "Semestre" })).toBe("semester");
    const tpl = m.parseRaTemplate("conjunto;codigo;titulo\nFinanzas;RA1;Analiza");
    expect(tpl.sets).toHaveLength(1);
    expect(tpl.sets[0].rows[0]).toMatchObject({ code: "RA1" });
  });

  it("paneles y pestañas exportan sus componentes", async () => {
    const panels = await import("./panels");
    for (const name of ["MatcherPanel", "BulkImportPanel", "RegistryOutcome"]) {
      expect(typeof panels[name], name).toBe("function");
    }
    // Imports explícitos (Vite no admite import() con variable sobre el propio directorio)
    const tabs = {
      CatalogTab: () => import("./CatalogTab"),
      TemplateTab: () => import("./TemplateTab"),
      ManualImportTab: () => import("./ManualImportTab"),
      SemesterCoursesPanel: () => import("./SemesterCoursesPanel"),
      CourseLookupPanel: () => import("./CourseLookupPanel"),
    };
    for (const [name, load] of Object.entries(tabs)) {
      const m = await load();
      expect(typeof m[name], name).toBe("function");
    }
  });

  it("hooks por sección exportan funciones", async () => {
    const hooks = {
      useRaRegistry: () => import("./useRaRegistry"),
      useCatalogImport: () => import("./useCatalogImport"),
      useRaTemplate: () => import("./useRaTemplate"),
      useRaProbe: () => import("./useRaProbe"),
      useCourseSets: () => import("./useCourseSets"),
    };
    for (const [name, load] of Object.entries(hooks)) {
      const m = await load();
      expect(typeof m[name], name).toBe("function");
    }
  });
});

describe("contextos y tokens separados para Fast Refresh", { timeout: COLD_IMPORT_TIMEOUT }, () => {
  it("cada contexto exporta su Provider y el hook vive en su propio módulo", async () => {
    const pairs = [
      ["AuthContext", "AuthProvider", "useAuth"],
      ["CourseContext", "CourseProvider", "useCourse"],
      ["I18nContext", "I18nProvider", "useI18n"],
      ["ThemeContext", "ThemeProvider", "useTheme"],
      ["ToastContext", "ToastProvider", "useToast"],
    ];
    for (const [file, provider, hook] of pairs) {
      const p = await import(`../../context/${file}.jsx`);
      expect(typeof p[provider], provider).toBe("function");
      const h = await import(`../../context/${hook}.js`);
      expect(typeof h[hook], hook).toBe("function");
      expect(h[file], `${file} (objeto de contexto)`).toBeDefined();
    }
  });

  it("severity exporta tokens y normalizador", async () => {
    const m = await import("../../components/ui/severity");
    expect(m.normalizeSeverity("error")).toBe("critical");
    expect(m.getSeverityTokens("success")).toBe(m.SEVERITY_TOKENS.success);
    const badge = await import("../../components/ui/StatusBadge");
    expect(typeof badge.default).toBe("function");
  });
});
