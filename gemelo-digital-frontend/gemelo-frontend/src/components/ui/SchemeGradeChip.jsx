import { rangeForPct, schemeLabel } from "../../utils/gradeScheme";

/**
 * Nota en la escala del curso según el esquema de calificación de Brightspace
 * (p. ej. "Aprobado · 3.5"). No renderiza nada si no hay esquema o dato.
 */
export default function SchemeGradeChip({ scheme, pct, style }) {
  // Esquemas puramente porcentuales (p. ej. "Percentage" sin símbolos) no
  // agregan información sobre el % que ya se muestra: no se renderiza.
  if (!scheme || scheme.informative === false) return null;
  const range = rangeForPct(scheme, pct);
  const label = schemeLabel(range);
  if (!label) return null;
  return (
    <span
      title={`Según el esquema de calificación del curso${scheme?.name ? ` (${scheme.name})` : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 700, color: "var(--text)",
        background: "var(--surface-muted)", border: "1px solid var(--border)",
        borderRadius: 999, padding: "2px 10px", ...style,
      }}
    >
      {range?.color && (
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: range.color }} />
      )}
      {label}
    </span>
  );
}
