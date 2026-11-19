import React, { useMemo, useState } from "react";
import { CorteChips } from "./CorteChip";
import { ExportCsvButton, RiskDistributionBar } from "./parts";
import { thStyle, tdStyle, selectStyle, linkButtonStyle } from "./styles";
import { courseMetrics, extractCategory, extractSemester, formatSemester } from "./coordinatorUtils";

const SORTS = [
  { value: "riesgo", label: "Mayor % en riesgo" },
  { value: "cortes", label: "Más cortes sin reportar" },
  { value: "nota", label: "Mejor nota primero" },
  { value: "nombre", label: "Nombre A-Z" },
];

function pctColor(pct) {
  if (pct == null) return "var(--muted)";
  if (pct < 50) return "var(--critical)";
  if (pct < 70) return "var(--watch)";
  return "var(--ok)";
}

export default function CoursesTab({ courses, summaries, onOpenCourse, onRetry, onExport }) {
  const [sortBy, setSortBy] = useState("riesgo");
  const rows = useMemo(() => {
    const list = courses.map((c) => ({ c, m: courseMetrics(summaries[c.id]) }));
    const v = (x, k) => (x.m.state === "ok" && x.m[k] != null ? x.m[k] : -1);
    list.sort((a, b) => {
      if (sortBy === "nombre") return String(a.c.name || "").localeCompare(String(b.c.name || ""), "es");
      if (sortBy === "nota") return v(b, "avgPct") - v(a, "avgPct");
      if (sortBy === "cortes") {
        const pend = (x) => (x.m.state === "ok" ? x.m.cortesTotal - x.m.cortesPublished + x.m.cortesLate : -1);
        return pend(b) - pend(a);
      }
      return v(b, "atRiskPct") - v(a, "atRiskPct");
    });
    return list;
  }, [courses, summaries, sortBy]);

  const failedIds = rows.filter((r) => r.m.state === "error").map((r) => r.c.id);

  return (
    <div className="kpi-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
          Ordenar:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{rows.length} curso{rows.length !== 1 ? "s" : ""}</span>
        {failedIds.length > 0 && (
          <button type="button" className="btn" onClick={() => onRetry(failedIds)} style={{ padding: "6px 12px", fontSize: 12 }}>
            ↻ Reintentar {failedIds.length} con error
          </button>
        )}
        <span style={{ marginLeft: "auto" }}>
          <ExportCsvButton onClick={onExport} disabled={rows.length === 0} />
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
              <th scope="col" style={thStyle}>Curso</th>
              <th scope="col" style={thStyle}>Profesores</th>
              <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Estudiantes</th>
              <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Nota prom.</th>
              <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Cobertura</th>
              <th scope="col" style={{ ...thStyle, textAlign: "right" }}>En riesgo</th>
              <th scope="col" style={thStyle}>Cortes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Sin cursos con estos filtros.</td></tr>
            )}
            {rows.map(({ c, m }) => {
              const sem = extractSemester(c);
              const cat = extractCategory(c);
              return (
                <tr key={c.id} className="tr-hover" style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdStyle}>
                    <button type="button" style={linkButtonStyle} onClick={() => onOpenCourse(c.id)}>{c.name}</button>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                      {c.code && <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{c.code}</span>}
                      {sem && <span className="tag" style={{ fontSize: 9, padding: "1px 6px" }}>{formatSemester(sem)}</span>}
                      {cat && cat !== "SIN CATEGORÍA" && (
                        <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>{cat}</span>
                      )}
                    </div>
                  </td>
                  {m.state === "loading" && (
                    <td colSpan={6} style={{ ...tdStyle, color: "var(--muted)" }}>Cargando…</td>
                  )}
                  {m.state === "error" && (
                    <td colSpan={6} style={tdStyle}>
                      <span style={{ color: "var(--critical-fg)", fontWeight: 700 }}>⚠ {m.error}</span>
                      <button type="button" className="btn" onClick={() => onRetry([c.id])} style={{ marginLeft: 10, padding: "3px 10px", fontSize: 11 }}>
                        Reintentar
                      </button>
                    </td>
                  )}
                  {m.state === "ok" && (
                    <>
                      <td style={{ ...tdStyle, fontSize: 11, color: "var(--muted-strong)" }}>
                        {m.teachers.length ? m.teachers.map((t) => t.name).join(", ") : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{m.students ?? "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 900, fontSize: 14, color: pctColor(m.avgPct) }}>
                        {m.avgPct != null ? (m.avgPct / 10).toFixed(1) : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {m.avgCoverage != null ? `${Math.round(m.avgCoverage)}%` : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={{ fontWeight: 800, color: m.atRiskPct > 30 ? "var(--critical)" : m.atRiskPct > 15 ? "var(--watch)" : "var(--text)" }}>
                          {m.atRiskCount != null ? `${m.atRiskCount}${m.atRiskPct != null ? ` (${Math.round(m.atRiskPct)}%)` : ""}` : "—"}
                        </span>
                        <RiskDistributionBar distribution={m.riskDistribution} />
                      </td>
                      <td style={tdStyle}><CorteChips cortes={m.cortes} usesCortes={m.usesCortes} /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
