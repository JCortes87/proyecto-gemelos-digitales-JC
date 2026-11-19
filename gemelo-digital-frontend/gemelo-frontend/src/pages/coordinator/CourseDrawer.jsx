import React from "react";
import Dialog from "../../components/ui/Dialog";
import CorteChip from "./CorteChip";
import { RiskDistributionBar, SectionError } from "./parts";
import { thStyle, tdStyle } from "./styles";
import {
  BACKLOG_ALERT_DAYS, CORTE_PERIODS, CORTE_STATUS_META,
  extractSemester, fmtDate, fmtRelative, formatSemester, sectionError, summaryError,
} from "./coordinatorUtils";

function Block({ title, children }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === "critical" ? "var(--critical-fg)" : "var(--text)";
  return (
    <div style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)", minWidth: 90 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color, fontFamily: "var(--font-mono)" }}>{value ?? "—"}</div>
    </div>
  );
}

const statRow = { display: "flex", gap: 8, flexWrap: "wrap" };

export default function CourseDrawer({ course, summary, onClose, onOpenTeacherView }) {
  if (!course) return null;
  const titleId = "coord-course-drawer-title";
  const err = summaryError(summary);
  const s = summary || {};
  const sem = extractSemester(course);

  const teachers = Array.isArray(s.teachers) ? s.teachers : null;
  const gr = s.gradeReporting;
  const content = s.content;
  const acts = s.activities;
  const backlog = s.gradingBacklog;
  const risk = s.risk;
  const byPeriod = {};
  for (const c of (gr && !gr.error ? gr.cortes || [] : [])) byPeriod[c.period] = c;

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabelledBy={titleId}
      alignTop={false}
      width="min(560px, 100%)"
      maxHeight="100vh"
      panelStyle={{ position: "fixed", top: 0, right: 0, bottom: 0, height: "100vh", borderRadius: 0, animation: "drawerIn 0.28s cubic-bezier(.4,0,.2,1) both" }}
    >
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--text)" }}>{course.name}</h2>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            {course.code && <span style={{ fontFamily: "var(--font-mono)" }}>{course.code}</span>}
            {sem && <span> · {formatSemester(sem)}</span>}
          </div>
          {s.generatedAt && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }} title={`Datos generados el ${fmtDate(s.generatedAt)}`}>
              Actualizado {fmtRelative(s.generatedAt)}{s.fromCache ? " (caché)" : ""}
            </div>
          )}
          {s.refreshError && (
            <div role="status" style={{ fontSize: 11, color: "var(--warning-fg)", marginTop: 2 }}>
              No se pudo actualizar ({s.refreshError}); se muestran los datos anteriores.
            </div>
          )}
        </div>
        <button type="button" className="btn" onClick={onClose} aria-label="Cerrar detalle del curso" style={{ padding: "4px 10px" }}>✕</button>
      </div>

      <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
        {summary === undefined && <div style={{ color: "var(--muted)", fontSize: 13 }}>Cargando resumen del curso…</div>}
        {err && <SectionError message={err} />}

        {summary && !err && (
          <>
            <Block title="Profesores">
              {sectionError(s.teachers) ? <SectionError message={sectionError(s.teachers)} /> : (
                teachers && teachers.length ? (
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                    {teachers.map((t) => (
                      <li key={t.userId ?? t.name} style={{ fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                        <strong style={{ color: "var(--text)" }}>{t.name}</strong>
                        <span style={{ color: "var(--muted)" }}> · {t.roleName || "Profesor"}{t.email ? ` · ${t.email}` : ""}</span>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Último acceso: {t.lastAccess ? fmtDate(t.lastAccess) : "no disponible"}</div>
                      </li>
                    ))}
                  </ul>
                ) : <div style={{ fontSize: 12, color: "var(--muted)" }}>Sin profesores en el listado.</div>
              )}
            </Block>

            <Block title="Reporte de notas por corte">
              {sectionError(gr) ? <SectionError message={sectionError(gr)} /> : gr && !gr.usesCortes ? (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  El libro de calificaciones no tiene ítems de corte ({gr.gradeItemsTotal} ítems en total).
                </div>
              ) : gr ? (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg)" }}>
                          <th scope="col" style={thStyle}>Corte</th>
                          <th scope="col" style={thStyle}>Ítem</th>
                          <th scope="col" style={thStyle}>Fecha</th>
                          <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Con nota</th>
                          <th scope="col" style={thStyle}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CORTE_PERIODS.map((p) => {
                          const c = byPeriod[p];
                          return (
                            <tr key={p} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={tdStyle}><CorteChip period={p} corte={c || null} /></td>
                              <td style={tdStyle}>{c ? c.name : <span style={{ color: "var(--muted)" }}>No existe</span>}</td>
                              <td style={tdStyle}>{c?.dueDate ? fmtDate(c.dueDate) : "—"}</td>
                              <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                {c && c.status !== "error" ? `${c.studentsWithGrade}/${c.studentsTotal}` : "—"}
                              </td>
                              <td style={{ ...tdStyle, fontSize: 11 }}>
                                {c ? (c.status === "error" ? c.error : (CORTE_STATUS_META[c.status]?.label || c.status)) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    {gr.gradeItemsTotal} ítems en el libro de calificaciones.
                    {gr.missingCortes?.length > 0 && ` Faltan: ${gr.missingCortes.map((p) => `Corte ${p}`).join(", ")}.`}
                  </div>
                </>
              ) : null}
            </Block>

            <Block title="Contenido en Brightspace">
              {sectionError(content) ? <SectionError message={sectionError(content)} /> : content ? (
                <>
                  <div style={statRow}>
                    <Stat label="Módulos" value={content.modules} />
                    <Stat label="Temas" value={content.topics} />
                    <Stat label="Archivos" value={content.topicsByType?.file} />
                    <Stat label="Enlaces" value={content.topicsByType?.link} />
                    <Stat label="LTI" value={content.topicsByType?.lti} />
                    <Stat label="Otros" value={content.topicsByType?.other} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    {content.hiddenTopics > 0 && `${content.hiddenTopics} temas ocultos. `}
                    Última modificación: {content.lastModified ? fmtDate(content.lastModified) : "no disponible"}
                  </div>
                </>
              ) : null}
            </Block>

            <Block title="Actividades">
              {sectionError(acts) ? <SectionError message={sectionError(acts)} /> : acts ? (
                <>
                  <div style={statRow}>
                    <Stat label="Tareas" value={acts.assignments} />
                    <Stat label="Quizzes" value={acts.quizzes} />
                    <Stat label="Foros" value={acts.discussions} />
                  </div>
                  {acts.notes?.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{acts.notes.join(" ")}</div>
                  )}
                </>
              ) : null}
            </Block>

            <Block title="Entregas por calificar">
              {sectionError(backlog) ? <SectionError message={sectionError(backlog)} /> : backlog ? (
                <div style={statRow}>
                  <Stat label="Pendientes" value={backlog.pending} tone={backlog.oldestPendingDays > BACKLOG_ALERT_DAYS ? "critical" : undefined} />
                  <Stat label="Tareas con pendientes" value={backlog.foldersWithPending} />
                  <Stat label="Días más antigua" value={backlog.oldestPendingDays} tone={backlog.oldestPendingDays > BACKLOG_ALERT_DAYS ? "critical" : undefined} />
                </div>
              ) : null}
            </Block>

            <Block title="Estudiantes en riesgo">
              {sectionError(risk) ? <SectionError message={sectionError(risk)} /> : risk ? (
                <>
                  <div style={statRow}>
                    <Stat label="Estudiantes" value={risk.studentsCount} />
                    <Stat label="Nota prom." value={risk.avgCurrentPerformancePct != null ? (risk.avgCurrentPerformancePct / 10).toFixed(1) : null} />
                    <Stat label="Cobertura" value={risk.avgCoveragePct != null ? `${Math.round(risk.avgCoveragePct)}%` : null} />
                    <Stat label="En riesgo" value={(risk.studentsAtRisk || []).length} />
                  </div>
                  <div style={{ maxWidth: 240 }}><RiskDistributionBar distribution={risk.riskDistribution} width="100%" /></div>
                  {(risk.studentsAtRisk || []).length > 0 && (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--muted-strong)" }}>
                      {risk.studentsAtRisk.slice(0, 15).map((st) => (
                        <li key={st.userId}>
                          {st.displayName}
                          <span style={{ fontFamily: "var(--font-mono)", marginLeft: 6 }}>
                            {st.currentPerformancePct != null ? `${(st.currentPerformancePct / 10).toFixed(1)}/10` : "sin nota"}
                          </span>
                        </li>
                      ))}
                      {risk.studentsAtRisk.length > 15 && <li>y {risk.studentsAtRisk.length - 15} más…</li>}
                    </ul>
                  )}
                </>
              ) : null}
            </Block>
          </>
        )}
      </div>

      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        <button type="button" className="btn btn-primary" onClick={() => onOpenTeacherView(course.id)}>
          Abrir en vista docente →
        </button>
      </div>
    </Dialog>
  );
}
