// Esquema de calificación del curso (Brightspace grades/schemes).
// El backend entrega los rangos ya ordenados por `start` (PercentStart).

/** Rango del esquema que corresponde a un porcentaje, o null. */
export function rangeForPct(scheme, pct) {
  if (!scheme || pct === null || pct === undefined || pct === "") return null;
  const p = Number(pct);
  if (Number.isNaN(p)) return null;
  const ranges = Array.isArray(scheme.ranges) ? scheme.ranges : [];
  let match = null;
  for (const r of ranges) {
    if (p >= Number(r.start)) match = r;
    else break;
  }
  return match || ranges[0] || null;
}

/** Texto corto: "Aprobado · 3.5" (o solo el símbolo si no hay valor). */
export function schemeLabel(range) {
  if (!range) return "";
  const value = range.assignedValue;
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
  if (range.symbol && hasValue) return `${range.symbol} · ${Number(value).toFixed(1)}`;
  return range.symbol || (hasValue ? Number(value).toFixed(1) : "");
}
