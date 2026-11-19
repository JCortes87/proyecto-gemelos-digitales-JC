import React from "react";
import { ExportCsvButton } from "./parts";
import { thStyle, tdStyle, linkButtonStyle } from "./styles";

/** Estudiantes en riesgo en 2+ cursos del conjunto filtrado. */
export default function RiskTab({ students, onOpenCourse, onExport }) {
  return (
    <div className="kpi-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted-strong)" }}>
          Estudiantes en riesgo en <strong>2 o más</strong> cursos del conjunto filtrado: {students.length}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <ExportCsvButton onClick={onExport} disabled={students.length === 0} />
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
              <th scope="col" style={thStyle}>Estudiante</th>
              <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Cursos</th>
              <th scope="col" style={thStyle}>Detalle (nota actual)</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                  Ningún estudiante aparece en riesgo en más de un curso.
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr key={s.userId} style={{ borderBottom: "1px solid var(--border)" }}>
                <th scope="row" style={{ ...tdStyle, textAlign: "left", fontWeight: 800 }}>
                  {s.name}
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>ID {s.userId}</div>
                </th>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 900, color: s.courses.length >= 3 ? "var(--critical)" : "var(--watch)" }}>
                  {s.courses.length}
                </td>
                <td style={tdStyle}>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {s.courses.map((c) => (
                      <li key={c.id} style={{ marginBottom: 2 }}>
                        <button type="button" style={{ ...linkButtonStyle, fontSize: 12, fontWeight: 700 }} onClick={() => onOpenCourse(c.id)}>
                          {c.name}
                        </button>
                        <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", color: "var(--muted-strong)" }}>
                          {c.pct != null ? `${(Number(c.pct) / 10).toFixed(1)}/10` : "sin nota"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
