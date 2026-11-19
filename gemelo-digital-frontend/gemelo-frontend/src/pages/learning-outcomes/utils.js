// Constantes y helpers puros de la herramienta de RA (extraídos de
// LearningOutcomesAdmin.jsx sin cambios de comportamiento).

// Tipos de actividad que Brightspace acepta para alinear RAs.
export const ALIGN_ACTIVITY_TYPES = [
  "Assignment", "Quiz", "DiscussionTopic", "ContentObject",
  "QuizQuestion", "Checklist", "Survey", "SelfAssessment", "LtiLink",
];

// Etiquetas legibles (ES) por tipo de actividad.
export const ACTIVITY_TYPE_LABELS = {
  Assignment: "Tarea",
  Quiz: "Cuestionario",
  DiscussionTopic: "Discusión",
  ContentObject: "Contenido",
  QuizQuestion: "Pregunta",
  Checklist: "Lista",
  Survey: "Encuesta",
  SelfAssessment: "Autoeval.",
  LtiLink: "LTI",
};

// Deriva la lista de RA directamente del outcomeSets crudo (siempre llega
// fresco desde Brightspace), como fallback cuando el índice derivado del
// backend viene vacío por caché obsoleta tras importar RA.
// Separador amplio: guión ASCII, guiones Unicode (U+2010–2015), signo menos
// (U+2212) o dos puntos. Brightspace a veces usa un guión no-ASCII entre el
// código y el texto, lo que antes rompía la extracción del código.
export const RA_CODE_RE = /^([A-Za-z0-9._-]+)\s*[-\u2010-\u2015\u2212:]\s*(.+)$/;
// Normaliza espacios/saltos de línea/NBSP a un solo espacio y elimina
// caracteres invisibles (zero-width, BOM, marcas direccionales) para que el
// regex (cuyo `.` no cruza saltos de línea) encaje siempre.
export function normalizeDesc(v) {
  return String(v ?? "")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseOutcomeSetsToList(outcomeSets) {
  const acc = {};
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== "object") return;
    const guid = node.SourceId || node.OutcomeId || node.Id || node.id;
    const desc = normalizeDesc(node.Description ?? node.description ?? "");
    if (guid && desc) {
      const key = String(guid);
      if (!acc[key]) {
        const m = desc.match(RA_CODE_RE);
        acc[key] = m
          ? { guid: key, id: key, code: m[1].toUpperCase(), title: m[2].trim(), description: desc }
          : { guid: key, id: key, code: String(node.ShortCode || "").trim() || key.slice(0, 6), title: desc, description: desc };
      }
    }
    for (const k of ["Outcomes", "outcomes", "SubOutcomes", "subOutcomes", "ChildOutcomes", "childOutcomes", "Children", "children"]) {
      if (node[k]) walk(node[k]);
    }
  };
  walk(outcomeSets);
  return Object.values(acc);
}

// Devuelve {code, title} legibles derivándolos SIEMPRE de la descripción
// "CÓDIGO-texto", así el chip muestra el código real (p.ej. L1O1DNR2) aunque
// el índice del backend traiga el code vacío o un fragmento del GUID.
export function raParts(o) {
  const desc = normalizeDesc(o?.description ?? o?.title ?? "");
  const m = desc.match(RA_CODE_RE);
  if (m) return { code: m[1].toUpperCase(), title: m[2].trim(), full: desc };
  const code = String(o?.code ?? "").trim();
  // Si el `code` recibido parece un fragmento de GUID (hex de 6), no lo mostramos.
  const cleanCode = /^[0-9a-f]{6}$/i.test(code) ? "" : code;
  return { code: cleanCode, title: desc || code, full: desc || code };
}

export const chipStyle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  fontSize: 11.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999,
  background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
};

// ── Plantilla CSV de creación masiva de RA ──────────────────────────────────
// Divide una línea CSV respetando comillas dobles ("" = comilla escapada).
export function splitCsvLine(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Parser tolerante de la plantilla: detecta el delimitador (; , o tab),
// exige encabezado con columnas conjunto/codigo/titulo (acentos opcionales)
// y agrupa las filas por conjunto. Devuelve { sets, errors }.
export function parseRaTemplate(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r\n|\n|\r/).filter(l => l.trim() !== "");
  if (lines.length === 0) return { sets: [], errors: ["El archivo está vacío."] };
  const first = lines[0];
  const delim = [";", ",", "\t"]
    .map(d => ({ d, n: splitCsvLine(first, d).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (delim.n < 2) {
    return { sets: [], errors: ["No se reconoce el formato: la primera fila debe ser el encabezado conjunto;codigo;titulo (separado por ; o ,)."] };
  }
  const header = splitCsvLine(first, delim.d).map(h => normalizeDesc(h).toLowerCase());
  const idxOf = (...names) => header.findIndex(h => names.some(n => h.includes(n)));
  const iSet = idxOf("conjunto", "set", "asignatura");
  const iCode = idxOf("codigo", "código", "code");
  const iTitle = idxOf("titulo", "título", "descripcion", "descripción", "title");
  if (iCode < 0 || iTitle < 0) {
    return { sets: [], errors: ["Encabezado no reconocido: se esperan las columnas conjunto, codigo y titulo (la plantilla descargable ya las trae)."] };
  }
  const errors = [];
  const byName = new Map();
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li], delim.d);
    const setName = normalizeDesc((iSet >= 0 ? cols[iSet] : "") || "") || "RA importados (Gemelo)";
    const code = normalizeDesc(cols[iCode] || "").toUpperCase();
    const title = normalizeDesc(cols[iTitle] || "");
    if (!code && !title) continue; // fila vacía
    if (!code) { errors.push(`Fila ${li + 1}: falta el código.`); continue; }
    if (!/^[A-Za-z0-9._-]+$/.test(code)) {
      errors.push(`Fila ${li + 1}: código inválido "${code}" (sin espacios; solo letras, números, punto, guión y guión bajo).`);
      continue;
    }
    if (!title) { errors.push(`Fila ${li + 1}: falta el título del RA "${code}".`); continue; }
    if (!byName.has(setName)) byName.set(setName, []);
    const rows = byName.get(setName);
    if (rows.some(r => r.code === code)) {
      errors.push(`Fila ${li + 1}: código duplicado "${code}" en el conjunto "${setName}".`);
      continue;
    }
    rows.push({ code, title });
  }
  const sets = Array.from(byName.entries()).map(([name, rows]) => ({ name, rows }));
  return { sets: sets.filter(s => s.rows.length > 0), errors };
}

// Metadatos visuales por estado de RA de una oferta (para badges y filtros).
export const STATUS_META = {
  sinRA:      { label: "Sin RA",      color: "var(--danger-fg)", bg: "var(--danger-bg)", border: "var(--danger-border)" },
  sinAlinear: { label: "Sin alinear", color: "var(--warning-fg)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  alineado:   { label: "Alineado",    color: "var(--success-fg)", bg: "var(--success-bg)", border: "var(--success-border)" },
  error:      { label: "Error",       color: "var(--muted)", bg: "var(--bg)",             border: "var(--border)" },
};

// Clasifica un descendiente por su tipo: oferta de curso vs grupo (sección).
export function classifyCourseUnit(typeName) {
  const t = (typeName || "").toLowerCase();
  if (t.includes("oferta")) return "offering";
  if (t.includes("grupo") || t.includes("section")) return "group";
  return "other";
}

// Clasifica una unidad de la búsqueda (usa typeId + typeName). Los semestres
// son contenedores → "Ver cursos"; las ofertas llevan RA → "Ver RA"; los grupos
// son secciones hijas sin RA propios.
export function classifyUnit(u) {
  const t = (u?.typeName || "").toLowerCase();
  if (Number(u?.typeId) === 5 || t.includes("semestre") || t.includes("semester")) return "semester";
  if (t.includes("oferta")) return "offering";
  if (t.includes("grupo") || t.includes("section")) return "group";
  return "other";
}

// ────────────────────────────────────────────────────────────────
// Auto-emparejador (Opción A): dado el nombre de un curso "Sin RA",
// sugiere el conjunto de RA org-level que mejor coincide (de los ~137).
// Los conjuntos se nombran "NOMBRE ASIGNATURA-ZZ#" (ZZ=código asignatura,
// #=1 pregrado / 2 posgrado / 3 flexibilización). Normalizamos ambos lados
// (sin tildes, mayúsculas, sin puntuación ni stopwords) y puntuamos por
// solapamiento de tokens + bonus si el nombre de la asignatura es substring.
// ────────────────────────────────────────────────────────────────
export const MATCH_STOPWORDS = new Set([
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "A", "E", "O", "U", "EN",
  "PARA", "CON", "POR", "SIN", "AL", "SE", "UN", "UNA", "SU",
]);

export function normSubject(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function subjectTokens(s) {
  return normSubject(s)
    .split(" ")
    .filter(t => t.length > 1 && !MATCH_STOPWORDS.has(t));
}

// Quita el sufijo "-ZZ#" (guion + 2-4 letras + dígito) del nombre del conjunto.
export function stripSetSuffix(name) {
  return (name || "").replace(/[-–—]\s*[A-Za-z]{2,4}\d\s*$/, "").trim();
}

// Puntúa qué tan bien un conjunto (setName) coincide con un curso (courseName).
// Devuelve [0..~1.5]: fracción de tokens del conjunto presentes en el curso,
// + 0.5 de bonus si el nombre completo de la asignatura aparece como substring.
export function scoreSetMatch(courseName, setName) {
  const courseSet = new Set(subjectTokens(courseName));
  const stripped = stripSetSuffix(setName);
  const setToks = subjectTokens(stripped);
  if (setToks.length === 0 || courseSet.size === 0) return 0;
  let hits = 0;
  for (const t of setToks) if (courseSet.has(t)) hits += 1;
  let score = hits / setToks.length;
  const sn = normSubject(stripped);
  const cn = normSubject(courseName);
  if (sn && cn.includes(sn)) score += 0.5;        // asignatura completa dentro del curso
  else if (sn && sn.includes(cn) && cn.length > 3) score += 0.25;
  return score;
}

// Ordena el catálogo por afinidad con el curso y devuelve las mejores opciones
// con puntaje > 0. `limit` opciones (por defecto 6).
export function suggestSetsForCourse(courseName, catalogSummary, limit = 6) {
  const rows = (catalogSummary || [])
    .map(s => ({ ...s, score: scoreSetMatch(courseName, s.name) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}
