import React, { useRef } from "react";

/** Piezas visuales compartidas del Panel Coordinador (solo tokens de tema). */

export function KpiCard({ label, value, hint, tone }) {
  const color = tone === "critical" ? "var(--critical)" : tone === "watch" ? "var(--watch)" : tone === "ok" ? "var(--ok)" : "var(--text)";
  return (
    <div className="kpi-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, marginTop: 4, fontFamily: "var(--font-mono)" }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function LoadProgress({ done, total }) {
  if (!total || done >= total) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="kpi-card" style={{ padding: "12px 14px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)" }} aria-live="polite">
          Analizando cursos… {done}/{total}
        </span>
        <span style={{ fontSize: 12, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)" }}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Progreso de carga de cursos"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ height: 7, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--brand)", borderRadius: 99, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

/** Barra apilada crítico / observación / sólido (de globalRiskDistribution). */
export function RiskDistributionBar({ distribution, width = 90 }) {
  if (!distribution) return null;
  const alto = Number(distribution.alto || 0);
  const medio = Number(distribution.medio || 0);
  const bajo = Number(distribution.bajo || 0);
  const total = alto + medio + bajo;
  if (total <= 0) return null;
  const label = `Distribución: ${alto} crítico, ${medio} observación, ${bajo} sólido`;
  const seg = (n, color) => (n > 0 ? <div style={{ width: `${(n / total) * 100}%`, background: color }} /> : null);
  return (
    <div role="img" aria-label={label} title={label}
      style={{ display: "flex", width, height: 6, borderRadius: 99, overflow: "hidden", background: "var(--border)", marginTop: 4, marginLeft: "auto" }}>
      {seg(alto, "var(--critical)")}
      {seg(medio, "var(--watch)")}
      {seg(bajo, "var(--ok)")}
    </div>
  );
}

export function SectionError({ message }) {
  return (
    <div role="status" style={{ fontSize: 11, padding: "8px 10px", borderRadius: 8, background: "var(--critical-bg)", color: "var(--critical-fg)", border: "1px solid var(--critical-border)" }}>
      {message}
    </div>
  );
}

export function ExportCsvButton({ onClick, disabled }) {
  return (
    <button type="button" className="btn" onClick={onClick} disabled={disabled} style={{ padding: "6px 12px", fontSize: 12 }}>
      ⬇ Exportar CSV
    </button>
  );
}

/** Barra de pestañas accesible (flechas izquierda/derecha cambian de pestaña). */
export function TabBar({ tabs, active, onChange, idPrefix }) {
  const refs = useRef({});
  const onKeyDown = (e, idx) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };
  return (
    <div role="tablist" aria-label="Vistas del panel coordinador" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16, overflowX: "auto" }}>
      {tabs.map((t, idx) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            style={{
              background: "none",
              border: "none",
              borderBottom: `2px solid ${selected ? "var(--brand)" : "transparent"}`,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 800,
              fontFamily: "var(--font)",
              color: selected ? "var(--brand)" : "var(--muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 99, background: selected ? "var(--brand-light)" : "var(--pending-bg)" }}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
