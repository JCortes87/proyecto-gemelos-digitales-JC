// Constantes y helpers puros del tablero docente (extraídos de
// TeacherDashboard.jsx). Sin React: se pueden testear de forma aislada.

// Clasificación por tipo de recurso: contentTypeLabel y
// countEducationalResources viven en utils/helpers.js (con tests).
// Categorías: HTML (solo páginas creadas en Brightspace), PDF, Word, Excel,
// PowerPoint (archivos o enlaces a ellos, alojados donde sea), Audios y
// Videos (solo cargados en Brightspace), Enlace (páginas externas) y Otros.
export const CONTENT_TYPE_ICONS = {
  HTML: "🌐", PDF: "📃", Excel: "📗", Word: "📘", PowerPoint: "📙",
  Audios: "🎧", Videos: "🎬", Enlace: "🔗", Otros: "📄",
};

// Ritmo de publicación de la tarjeta "Recursos educativos publicados"
// ("Mínimo esperado: N" + insignia Óptimo/En seguimiento/Crítico).
// OCULTO por ahora a pedido del usuario (18 ago 2026) — el cálculo sigue
// funcionando; poner en true para volver a mostrarlo cuando se requiera.
export const SHOW_CONTENT_RHYTHM = false;

// Cuentas institucionales/de servicio que no deben aparecer como profesor
export const SERVICE_ACCOUNT_RE = /^cesa\b|laboratorio|desarrollo profesoral|soporte|capacitaci|prueba|demo|test/i;

// Formatea el último acceso de un estudiante como texto relativo corto.
export function fmtLastAccess(iso) {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return "Hoy";
  if (days < 2) return "Ayer";
  if (days < 30) return `Hace ${Math.floor(days)} días`;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
