/**
 * Lógica pura del Panel Coordinador (sin React): períodos/categorías del
 * catálogo, métricas por curso a partir del resumen del backend
 * (/gemelo/coordinator/summary/batch), agregación por profesor, estudiantes
 * en riesgo en varios cursos, KPIs y filas para CSV.
 */

export const CORTE_PERIODS = [1, 2, 3];
export const LOW_CONTENT_TOPICS = 5;     // < 5 temas visibles → "poco contenido"
export const BACKLOG_ALERT_DAYS = 7;     // entregas sin calificar hace > 7 días

export const CORTE_STATUS_META = {
  publicado: { label: "Publicado", bg: "var(--ok-bg)", fg: "var(--ok-fg)", border: "var(--ok-border)" },
  parcial: { label: "Parcial", bg: "var(--watch-bg)", fg: "var(--watch-fg)", border: "var(--watch-border)" },
  pendiente: { label: "Pendiente", bg: "var(--pending-bg)", fg: "var(--muted-strong)", border: "var(--pending-border)" },
  vencido_sin_reporte: { label: "Vencido sin reporte", bg: "var(--critical-bg)", fg: "var(--critical-fg)", border: "var(--critical-border)" },
  error: { label: "Error al leer", bg: "var(--pending-bg)", fg: "var(--muted)", border: "var(--border)" },
};

export const KNOWN_CATEGORIES = [
  { value: "all", label: "Todas las categorías" },
  { value: "PREGRADO", label: "Pregrado" },
  { value: "POSGRADO", label: "Posgrado / Maestría" },
  { value: "AULA", label: "Aula" },
  { value: "DIPLOMADO", label: "Diplomado" },
  { value: "EDUCACIÓN CONTINUA", label: "Educación Continua" },
  { value: "DESARROLLO", label: "Desarrollo" },
];

// ── Catálogo: período y categoría ───────────────────────────────────────────
function semesterFromText(text) {
  const hay = String(text || "");
  const strict = hay.match(/\b(20\d{2})(10|20|30)\b/);
  if (strict) return `${strict[1]}${strict[2]}`;
  const loose = hay.match(/\b(20\d{2})[\s\-._](\d)\b/);
  if (loose && ["1", "2", "3"].includes(loose[2])) return `${loose[1]}${loose[2]}0`;
  return null;
}

/**
 * Código de período (p. ej. "202610"). Usa primero los campos del catálogo
 * (semesterCode / semesterName) y solo como respaldo la regex sobre el nombre.
 */
export function extractSemester(course) {
  const code = String(course?.semesterCode || "").trim();
  // Códigos reales de Brightspace (202600, 202615, 202631, 202660…): cualquier
  // AAAA + 2 dígitos. La regex sobre el nombre queda solo como respaldo.
  if (/^20\d{4}$/.test(code)) return code;
  const fromFields = semesterFromText(`${code} ${course?.semesterName || ""}`);
  if (fromFields) return fromFields;
  return semesterFromText(`${course?.name || ""} ${course?.code || ""}`);
}

export function extractCategory(course) {
  let name = String(course?.name || "").trim();
  name = name.replace(/^20\d{2}(?:10|20|30)\s*[-·_]?\s*/i, "");
  const upper = name.toUpperCase();
  if (/PREGRADO/.test(upper)) return "PREGRADO";
  if (/POSGRADO|MAESTR|DOCTORADO/.test(upper)) return "POSGRADO";
  if (/AULA/.test(upper)) return "AULA";
  if (/DESARROLLO/.test(upper)) return "DESARROLLO";
  if (/DIPLOMADO/.test(upper)) return "DIPLOMADO";
  if (/EDUCACI/.test(upper)) return "EDUCACIÓN CONTINUA";
  const words = name.split(/\s+/).filter((w) => w.length > 0 && !/^\d+$/.test(w));
  return words.length > 0 ? words[0].toUpperCase() : "SIN CATEGORÍA";
}

export function formatSemester(code) {
  if (!code || code.length !== 6) return code || "";
  const year = code.slice(0, 4);
  const q = code.slice(4, 6);
  const roman = q === "10" ? "I" : q === "20" ? "II" : q === "30" ? "III" : q;
  return `${year}-${roman}`;
}

/**
 * Semestre por defecto: el más reciente de pregrado/posgrado (p. ej.
 * "202620 2DO PREGRADO / POSGRADO"); si no hay, el primero de la lista.
 * `semesters` viene ordenado del más reciente al más antiguo.
 */
export function pickDefaultSemester(semesters) {
  const list = Array.isArray(semesters) ? semesters : [];
  const preferred = list.find((s) => /PREGRADO|POSGRADO/i.test(String(s?.name || "")));
  return (preferred || list[0] || null);
}

export function filterCourses(courses, { semester = "", category = "all", search = "" } = {}) {
  const q = String(search || "").trim().toLowerCase();
  return (courses || []).filter((c) => {
    if (semester && extractSemester(c) !== semester) return false;
    if (category !== "all" && extractCategory(c) !== category) return false;
    if (q && !(String(c.name || "").toLowerCase().includes(q) || String(c.code || "").toLowerCase().includes(q))) {
      return false;
    }
    return true;
  });
}

export function chunk(list, size) {
  const out = [];
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Resumen por curso ───────────────────────────────────────────────────────
/** Una sección es usable si existe y no es {error}. */
export function sectionOk(sec) {
  if (sec == null) return false;
  if (Array.isArray(sec)) return true;
  return typeof sec === "object" && !("error" in sec);
}

export function sectionError(sec) {
  return sec && typeof sec === "object" && !Array.isArray(sec) && sec.error ? String(sec.error) : null;
}

/** Mensaje legible para un resumen fallido (o null si está bien). */
export function summaryError(summary) {
  if (!summary || !summary.error) return null;
  if (summary.error === "forbidden") return "Sin permiso para ver este curso";
  return String(summary.error);
}

/** Cortes del curso indexados por período: {1: corte|null, 2: …, 3: …}. */
export function cortesByPeriod(summary) {
  const out = { 1: null, 2: null, 3: null };
  const gr = summary?.gradeReporting;
  if (!sectionOk(gr)) return out;
  for (const c of gr.cortes || []) {
    if (c && CORTE_PERIODS.includes(Number(c.period))) out[Number(c.period)] = c;
  }
  return out;
}

/** Métricas planas de un curso para tablas, KPIs y CSV. */
export function courseMetrics(summary) {
  if (summary === undefined) return { state: "loading" };
  const err = summaryError(summary);
  if (err) return { state: "error", error: err };

  const risk = sectionOk(summary.risk) ? summary.risk : null;
  const students = risk ? Number(risk.studentsCount || 0) : null;
  const atRiskCount = risk ? (risk.studentsAtRisk || []).length : null;
  const gr = sectionOk(summary.gradeReporting) ? summary.gradeReporting : null;
  const cortes = cortesByPeriod(summary);
  const corteList = Object.values(cortes).filter(Boolean);
  const content = sectionOk(summary.content) ? summary.content : null;
  const backlog = sectionOk(summary.gradingBacklog) ? summary.gradingBacklog : null;
  return {
    state: "ok",
    students,
    avgPct: risk?.avgCurrentPerformancePct ?? null,
    avgCoverage: risk?.avgCoveragePct ?? null,
    atRiskCount,
    atRiskPct: students > 0 && atRiskCount != null ? (atRiskCount / students) * 100 : null,
    riskDistribution: risk?.riskDistribution || null,
    usesCortes: gr ? !!gr.usesCortes : null,
    cortes,
    cortesTotal: corteList.filter((c) => c.status !== "error").length,
    cortesPublished: corteList.filter((c) => c.status === "publicado").length,
    cortesLate: corteList.filter((c) => c.status === "vencido_sin_reporte").length,
    topics: content ? Number(content.topics || 0) : null,
    modules: content ? Number(content.modules || 0) : null,
    backlogPending: backlog ? Number(backlog.pending || 0) : null,
    backlogOldestDays: backlog?.oldestPendingDays ?? null,
    teachers: Array.isArray(summary.teachers) ? summary.teachers : [],
    sectionErrors: ["teachers", "gradeReporting", "content", "activities", "gradingBacklog", "risk"]
      .filter((k) => sectionError(summary[k])),
  };
}

/** Promedio ponderado por número de estudiantes (cursos sin dato se omiten). */
export function weightedAverage(items, valueKey, weightKey = "students") {
  let num = 0;
  let den = 0;
  for (const it of items || []) {
    const v = it?.[valueKey];
    const w = Number(it?.[weightKey] || 0);
    if (v == null || Number.isNaN(Number(v)) || w <= 0) continue;
    num += Number(v) * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

// ── Agregación por profesor ─────────────────────────────────────────────────
function teacherKey(t) {
  if (t?.userId != null) return `id:${t.userId}`;
  return `name:${String(t?.name || "").trim().toLowerCase()}`;
}

function laterIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/**
 * Agrupa por profesor los cursos del conjunto filtrado. Devuelve
 * { professors: [...], coursesWithoutTeacher: [...] }.
 * Cada profesor: {key, userId, name, email, lastAccess, courses: [fila],
 * cortesTotal, cortesPublished, cortesLate, onTimePct, backlogTotal,
 * backlogMaxDays, lowContentCourses}.
 */
export function aggregateProfessors(courses, summaries, { lowContentTopics = LOW_CONTENT_TOPICS } = {}) {
  const map = new Map();
  const withoutTeacher = [];
  for (const course of courses || []) {
    const summary = summaries?.[course.id] ?? summaries?.[String(course.id)];
    const m = courseMetrics(summary);
    const teachers = m.state === "ok" ? m.teachers : [];
    if (!teachers.length) {
      withoutTeacher.push({
        course,
        state: m.state,
        error: m.state === "error" ? m.error : sectionError(summary?.teachers),
      });
      continue;
    }
    const activities = sectionOk(summary.activities) ? summary.activities : null;
    for (const t of teachers) {
      const key = teacherKey(t);
      let p = map.get(key);
      if (!p) {
        p = { key, userId: t.userId ?? null, name: t.name || "Sin nombre", email: t.email || null, lastAccess: null, courses: [] };
        map.set(key, p);
      }
      if (!p.email && t.email) p.email = t.email;
      p.lastAccess = laterIso(p.lastAccess, t.lastAccess);
      p.courses.push({
        id: course.id,
        name: course.name,
        code: course.code,
        cortes: m.cortes,
        usesCortes: m.usesCortes,
        modules: m.modules,
        topics: m.topics,
        lowContent: m.topics != null && m.topics < lowContentTopics,
        assignments: activities?.assignments ?? null,
        quizzes: activities?.quizzes ?? null,
        discussions: activities?.discussions ?? null,
        backlogPending: m.backlogPending,
        backlogOldestDays: m.backlogOldestDays,
        lastAccess: t.lastAccess || null,
        cortesTotal: m.cortesTotal,
        cortesPublished: m.cortesPublished,
        cortesLate: m.cortesLate,
        sectionErrors: m.sectionErrors,
      });
    }
  }

  const professors = Array.from(map.values()).map((p) => {
    const sum = (k) => p.courses.reduce((a, c) => a + (Number(c[k]) || 0), 0);
    const cortesTotal = sum("cortesTotal");
    const cortesPublished = sum("cortesPublished");
    const maxDays = p.courses.reduce((a, c) => (c.backlogOldestDays != null && c.backlogOldestDays > a ? c.backlogOldestDays : a), -1);
    return {
      ...p,
      courses: p.courses.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es")),
      cortesTotal,
      cortesPublished,
      cortesLate: sum("cortesLate"),
      cortesUnreported: cortesTotal - cortesPublished,
      onTimePct: cortesTotal > 0 ? (cortesPublished / cortesTotal) * 100 : null,
      backlogTotal: sum("backlogPending"),
      backlogMaxDays: maxDays >= 0 ? maxDays : null,
      lowContentCourses: p.courses.filter((c) => c.lowContent).length,
    };
  });
  return { professors, coursesWithoutTeacher: withoutTeacher };
}

export const PROFESSOR_SORTS = [
  { value: "retraso", label: "Más retraso en reporte" },
  { value: "pendientes", label: "Más pendientes por calificar" },
  { value: "nombre", label: "Nombre A-Z" },
];

export function sortProfessors(list, sortBy) {
  const arr = (list || []).slice();
  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es");
  if (sortBy === "pendientes") {
    arr.sort((a, b) => (b.backlogTotal - a.backlogTotal) || ((b.backlogMaxDays ?? -1) - (a.backlogMaxDays ?? -1)) || byName(a, b));
  } else if (sortBy === "retraso") {
    arr.sort((a, b) => (b.cortesLate - a.cortesLate) || (b.cortesUnreported - a.cortesUnreported) || byName(a, b));
  } else {
    arr.sort(byName);
  }
  return arr;
}

// ── Estudiantes en riesgo en varios cursos ──────────────────────────────────
/**
 * Estudiantes en riesgo agrupados por userId a través de los cursos del
 * conjunto. Devuelve todos (para contar únicos); filtrar por minCourses.
 */
export function studentsAtRiskAcrossCourses(courses, summaries) {
  const map = new Map();
  for (const course of courses || []) {
    const summary = summaries?.[course.id] ?? summaries?.[String(course.id)];
    if (!summary || summary.error || !sectionOk(summary.risk)) continue;
    for (const s of summary.risk.studentsAtRisk || []) {
      if (s?.userId == null) continue;
      const key = String(s.userId);
      let e = map.get(key);
      if (!e) {
        e = { userId: s.userId, name: s.displayName || key, courses: [] };
        map.set(key, e);
      }
      if (e.courses.some((c) => String(c.id) === String(course.id))) continue;
      e.courses.push({
        id: course.id,
        name: course.name,
        pct: s.currentPerformancePct ?? null,
        risk: s.risk || null,
      });
    }
  }
  return Array.from(map.values());
}

export function studentsAtRiskInMultipleCourses(courses, summaries, minCourses = 2) {
  return studentsAtRiskAcrossCourses(courses, summaries)
    .filter((s) => s.courses.length >= minCourses)
    .sort((a, b) => (b.courses.length - a.courses.length) || String(a.name).localeCompare(String(b.name), "es"));
}

// ── KPIs del encabezado ─────────────────────────────────────────────────────
export function computeKpis(courses, summaries) {
  const metrics = (courses || []).map((c) => courseMetrics(summaries?.[c.id] ?? summaries?.[String(c.id)]));
  const ok = metrics.filter((m) => m.state === "ok");
  const { professors } = aggregateProfessors(courses, summaries);
  const cortesTotal = ok.reduce((a, m) => a + m.cortesTotal, 0);
  const cortesPublished = ok.reduce((a, m) => a + m.cortesPublished, 0);
  return {
    courses: (courses || []).length,
    loaded: ok.length,
    failed: metrics.filter((m) => m.state === "error").length,
    professors: professors.length,
    cortesTotal,
    cortesPublished,
    cortesLate: ok.reduce((a, m) => a + m.cortesLate, 0),
    cortesPct: cortesTotal > 0 ? (cortesPublished / cortesTotal) * 100 : null,
    backlog: ok.reduce((a, m) => a + (m.backlogPending || 0), 0),
    atRiskUnique: studentsAtRiskAcrossCourses(courses, summaries).length,
    students: ok.reduce((a, m) => a + (m.students || 0), 0),
    avgPct: weightedAverage(ok, "avgPct"),
    avgCoverage: weightedAverage(ok, "avgCoverage"),
  };
}

// ── Formato ─────────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/**
 * Tiempo relativo en español: "hace unos segundos", "hace 5 min", "hace 3 h",
 * "hace 2 días"; a partir de una semana, "el 05 oct 2026".
 */
export function fmtRelative(iso, now = Date.now()) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.floor(Math.max(0, now - t) / 60_000);
  if (mins < 1) return "hace unos segundos";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days} día${days !== 1 ? "s" : ""}`;
  return `el ${fmtDate(iso)}`;
}

export function corteLabel(corte) {
  if (!corte) return "—";
  const meta = CORTE_STATUS_META[corte.status] || CORTE_STATUS_META.error;
  if (corte.status === "error") return meta.label;
  return `${meta.label} (${Math.round(Number(corte.pct || 0))}%)`;
}

export function corteTooltip(period, corte) {
  if (!corte) return `Corte ${period}: no existe en el libro de calificaciones`;
  const meta = CORTE_STATUS_META[corte.status] || CORTE_STATUS_META.error;
  if (corte.status === "error") return `Corte ${period}: ${corte.error || meta.label}`;
  const parts = [
    `Corte ${period} · ${meta.label}`,
    `${Math.round(Number(corte.pct || 0))}% con nota (${corte.studentsWithGrade ?? 0}/${corte.studentsTotal ?? 0})`,
  ];
  if (corte.dueDate) parts.push(`Fecha: ${fmtDate(corte.dueDate)}`);
  if (corte.isHidden) parts.push("Oculto para estudiantes");
  return parts.join(" · ");
}

const num = (v) => (v == null ? "" : v);

// ── Filas CSV (cada builder devuelve {headers, rows}) ───────────────────────
export function buildProfessorCsv(professors) {
  const headers = [
    "Profesor", "Email", "Último acceso", "Curso", "Código",
    "Corte 1", "Corte 2", "Corte 3", "Módulos", "Temas",
    "Tareas", "Quizzes", "Foros", "Entregas por calificar", "Días entrega más antigua",
  ];
  const rows = [];
  for (const p of professors || []) {
    for (const c of p.courses || []) {
      rows.push([
        p.name, p.email || "", c.lastAccess || p.lastAccess || "", c.name || "", c.code || "",
        corteLabel(c.cortes?.[1]), corteLabel(c.cortes?.[2]), corteLabel(c.cortes?.[3]),
        num(c.modules), num(c.topics), num(c.assignments), num(c.quizzes), num(c.discussions),
        num(c.backlogPending), num(c.backlogOldestDays),
      ]);
    }
  }
  return { headers, rows };
}

export function buildCourseCsv(courses, summaries) {
  const headers = [
    "Curso", "Código", "Período", "Profesores", "Estudiantes", "Nota promedio (/10)",
    "Cobertura %", "En riesgo", "% en riesgo", "Corte 1", "Corte 2", "Corte 3",
    "Entregas por calificar", "Temas", "Estado",
  ];
  const rows = (courses || []).map((c) => {
    const m = courseMetrics(summaries?.[c.id] ?? summaries?.[String(c.id)]);
    if (m.state !== "ok") {
      return [c.name || "", c.code || "", formatSemester(extractSemester(c)), "", "", "", "", "", "", "", "", "", "", "",
        m.state === "error" ? `Error: ${m.error}` : "Sin cargar"];
    }
    return [
      c.name || "", c.code || "", formatSemester(extractSemester(c)),
      m.teachers.map((t) => t.name).join("; "),
      num(m.students),
      m.avgPct != null ? Number((m.avgPct / 10).toFixed(1)) : "",
      m.avgCoverage != null ? Math.round(m.avgCoverage) : "",
      num(m.atRiskCount),
      m.atRiskPct != null ? Math.round(m.atRiskPct) : "",
      corteLabel(m.cortes[1]), corteLabel(m.cortes[2]), corteLabel(m.cortes[3]),
      num(m.backlogPending), num(m.topics),
      m.sectionErrors.length ? `Parcial (sin: ${m.sectionErrors.join(", ")})` : "OK",
    ];
  });
  return { headers, rows };
}

export function buildRiskCsv(students) {
  const headers = ["Estudiante", "ID", "Cursos en riesgo", "Detalle"];
  const rows = (students || []).map((s) => [
    s.name, String(s.userId), s.courses.length,
    s.courses.map((c) => `${c.name} (${c.pct != null ? `${Number(c.pct).toFixed(1)}%` : "sin nota"})`).join("; "),
  ]);
  return { headers, rows };
}
