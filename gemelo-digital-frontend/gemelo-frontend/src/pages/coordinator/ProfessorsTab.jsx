import React, { useMemo, useState } from "react";
import { CorteChips } from "./CorteChip";
import { ExportCsvButton } from "./parts";
import { thStyle, tdStyle, selectStyle, linkButtonStyle } from "./styles";
import {
  BACKLOG_ALERT_DAYS, LOW_CONTENT_TOPICS, PROFESSOR_SORTS,
  daysSince, fmtDate, sortProfessors,
} from "./coordinatorUtils";

const dash = (v) => (v == null ? "—" : v);

function LastAccess({ iso }) {
  if (!iso) return <span style={{ color: "var(--muted)" }}>—</span>;
  const d = daysSince(iso);
  const stale = d != null && d > BACKLOG_ALERT_DAYS;
  return (
    <span title={`Último acceso: ${fmtDate(iso)}`} style={{ color: stale ? "var(--watch-fg)" : "var(--text)", fontWeight: stale ? 800 : 600 }}>
      {d === 0 ? "Hoy" : d === 1 ? "Ayer" : `Hace ${d} días`}
    </span>
  );
}

function Backlog({ pending, days }) {
  if (pending == null) return <span style={{ color: "var(--muted)" }}>—</span>;
  if (pending === 0) return <span style={{ color: "var(--ok-fg)", fontWeight: 700 }}>0</span>;
  const alert = days != null && days > BACKLOG_ALERT_DAYS;
  return (
    <span
      title={days != null ? `La entrega más antigua espera hace ${days} días` : undefined}
      style={{
        display: "inline-block", padding: "1px 7px", borderRadius: 6, fontWeight: 800, fontFamily: "var(--font-mono)",
        background: alert ? "var(--critical-bg)" : "var(--watch-bg)",
        color: alert ? "var(--critical-fg)" : "var(--watch-fg)",
      }}
    >
      {pending}{days != null ? ` · ${days} d` : ""}
    </span>
  );
}

function ProfessorCard({ p, onOpenCourse }) {
  const headingId = `prof-${String(p.key).replace(/[^a-z0-9]/gi, "-")}`;
  const onTime = p.onTimePct != null ? `${Math.round(p.onTimePct)}%` : "—";
  return (
    <section className="kpi-card" aria-labelledby={headingId} style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ flex: "1 1 240px" }}>
          <h3 id={headingId} style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--text)" }}>{p.name}</h3>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {p.email || "Sin email"} · {p.courses.length} curso{p.courses.length !== 1 ? "s" : ""} · Último acceso: <LastAccess iso={p.lastAccess} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-strong)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span title="Cortes con nota para ≥90% de los estudiantes sobre el total de cortes existentes">
            Cortes reportados: <strong style={{ color: "var(--text)" }}>{p.cortesPublished}/{p.cortesTotal}</strong> ({onTime})
          </span>
          {p.cortesLate > 0 && (
            <span style={{ color: "var(--critical-fg)", fontWeight: 800 }}>{p.cortesLate} vencido{p.cortesLate !== 1 ? "s" : ""} sin reporte</span>
          )}
          <span>
            Por calificar: <strong style={{ color: p.backlogMaxDays > BACKLOG_ALERT_DAYS ? "var(--critical-fg)" : "var(--text)" }}>{p.backlogTotal}</strong>
            {p.backlogMaxDays != null && p.backlogTotal > 0 ? ` (más antigua: ${p.backlogMaxDays} d)` : ""}
          </span>
          {p.lowContentCourses > 0 && (
            <span style={{ color: "var(--watch-fg)", fontWeight: 800 }} title={`Cursos con menos de ${LOW_CONTENT_TOPICS} temas visibles`}>
              {p.lowContentCourses} con poco contenido
            </span>
          )}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption className="sr-only" style={{ position: "absolute", left: -9999 }}>Cursos de {p.name}</caption>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              <th scope="col" style={thStyle}>Curso</th>
              <th scope="col" style={thStyle}>Cortes</th>
              <th scope="col" style={thStyle} title="Módulos / temas visibles">Contenido</th>
              <th scope="col" style={thStyle} title="Tareas / quizzes / foros">Actividades</th>
              <th scope="col" style={thStyle} title="Entregas por calificar · días de la más antigua">Por calificar</th>
              <th scope="col" style={thStyle}>Último acceso</th>
            </tr>
          </thead>
          <tbody>
            {p.courses.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={tdStyle}>
                  <button type="button" style={{ ...linkButtonStyle, fontSize: 12 }} onClick={() => onOpenCourse(c.id)}>
                    {c.name}
                  </button>
                  {c.code && <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{c.code}</div>}
                  {c.sectionErrors.length > 0 && (
                    <div style={{ fontSize: 10, color: "var(--critical-fg)" }}>Datos incompletos</div>
                  )}
                </td>
                <td style={tdStyle}><CorteChips cortes={c.cortes} usesCortes={c.usesCortes} /></td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>
                  {dash(c.modules)} / {dash(c.topics)}
                  {c.lowContent && (
                    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "var(--watch-fg)", background: "var(--watch-bg)", padding: "1px 5px", borderRadius: 4, fontFamily: "var(--font)" }}>
                      POCO
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>
                  {dash(c.assignments)} / {dash(c.quizzes)} / {dash(c.discussions)}
                </td>
                <td style={tdStyle}><Backlog pending={c.backlogPending} days={c.backlogOldestDays} /></td>
                <td style={tdStyle}><LastAccess iso={c.lastAccess} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ProfessorsTab({ professors, coursesWithoutTeacher, onOpenCourse, onExport, loading }) {
  const [sortBy, setSortBy] = useState("retraso");
  const sorted = useMemo(() => sortProfessors(professors, sortBy), [professors, sortBy]);
  const failed = coursesWithoutTeacher.filter((x) => x.state !== "loading");

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
          Ordenar:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            {PROFESSOR_SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {sorted.length} profesor{sorted.length !== 1 ? "es" : ""}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <ExportCsvButton onClick={() => onExport(sorted)} disabled={sorted.length === 0} />
        </span>
      </div>

      {sorted.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">👩‍🏫</div>
          <div>{loading ? "Cargando actividad docente…" : "No se identificaron profesores en los cursos cargados."}</div>
        </div>
      )}

      {sorted.map((p) => <ProfessorCard key={p.key} p={p} onOpenCourse={onOpenCourse} />)}

      {failed.length > 0 && (
        <details className="kpi-card" style={{ padding: "12px 16px" }}>
          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
            {failed.length} curso{failed.length !== 1 ? "s" : ""} sin profesor identificado o con error
          </summary>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--muted-strong)" }}>
            {failed.map(({ course, error }) => (
              <li key={course.id} style={{ marginBottom: 4 }}>
                <button type="button" style={{ ...linkButtonStyle, fontSize: 12 }} onClick={() => onOpenCourse(course.id)}>{course.name}</button>
                {error ? <span style={{ color: "var(--critical-fg)" }}> — {error}</span> : <span> — sin profesores en el listado</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
