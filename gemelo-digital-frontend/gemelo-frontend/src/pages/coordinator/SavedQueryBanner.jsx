import React from "react";
import { fmtRelative } from "./coordinatorUtils";

/**
 * Aviso de que la vista muestra la última consulta guardada en el navegador,
 * con acciones para completar los cursos faltantes, re-escanear todo
 * (saltando la caché del servidor) o descartarla.
 */
export default function SavedQueryBanner({
  semesterLabel, courseCount, savedAt, missingCount, busy,
  onCompleteMissing, onRefreshAll, onDiscard,
}) {
  return (
    <div role="status" className="kpi-card" style={{
      marginBottom: 16, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      background: "var(--brand-light)", border: "1px solid var(--border)",
    }}>
      <div style={{ flex: "1 1 320px", fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>
        Mostrando la última consulta: <strong>{semesterLabel || "Todos los períodos"}</strong>
        {" · "}{courseCount} cursos
        {" · "}guardada <span title={savedAt ? new Date(savedAt).toLocaleString("es-CO") : undefined}>{fmtRelative(savedAt)}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {missingCount > 0 && (
          <button type="button" className="btn btn-primary" onClick={onCompleteMissing} disabled={busy} style={{ padding: "7px 12px", fontSize: 12 }}>
            Completar faltantes ({missingCount})
          </button>
        )}
        <button type="button" className="btn" onClick={onRefreshAll} disabled={busy} style={{ padding: "7px 12px", fontSize: 12 }}>
          Actualizar todo
        </button>
        <button type="button" className="btn" onClick={onDiscard} style={{ padding: "7px 12px", fontSize: 12, color: "var(--muted)" }}>
          Descartar
        </button>
      </div>
    </div>
  );
}
