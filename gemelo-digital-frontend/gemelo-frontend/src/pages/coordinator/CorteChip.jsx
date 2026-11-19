import React from "react";
import { CORTE_STATUS_META, corteTooltip } from "./coordinatorUtils";

/**
 * Chip compacto del estado de reporte de un corte (C1/C2/C3).
 * Color por estado; tooltip (title) y aria-label con %, conteo y fecha.
 * Sin ítem de corte en el libro de calificaciones → "C1 —" en gris.
 */
export default function CorteChip({ period, corte }) {
  const tip = corteTooltip(period, corte);
  const meta = corte ? (CORTE_STATUS_META[corte.status] || CORTE_STATUS_META.error) : null;
  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minWidth: 52,
    justifyContent: "center",
    padding: "2px 7px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 800,
    fontFamily: "var(--font-mono)",
    whiteSpace: "nowrap",
    border: `1px solid ${meta ? meta.border : "var(--border)"}`,
    background: meta ? meta.bg : "transparent",
    color: meta ? meta.fg : "var(--muted)",
  };
  let value = "—";
  if (corte && corte.status === "error") value = "!";
  else if (corte) value = `${Math.round(Number(corte.pct || 0))}%`;
  return (
    <span
      role="img"
      aria-label={tip}
      title={tip}
      data-status={corte ? corte.status : "ausente"}
      style={style}
    >
      <span aria-hidden="true">C{period}</span>
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

/** Los tres chips de un curso en fila. */
export function CorteChips({ cortes, usesCortes }) {
  if (usesCortes === false) {
    return (
      <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }} title="El libro de calificaciones no tiene ítems de corte">
        Sin cortes
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {[1, 2, 3].map((p) => (
        <CorteChip key={p} period={p} corte={cortes ? cortes[p] : null} />
      ))}
    </span>
  );
}
