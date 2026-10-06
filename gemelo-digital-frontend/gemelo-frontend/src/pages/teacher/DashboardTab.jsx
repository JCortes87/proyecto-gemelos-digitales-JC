import AINarrativeSummary from "../../components/dashboard/AINarrativeSummary";
import AssignmentsPanel from "../../components/dashboard/AssignmentsPanel";
import Breadcrumb from "../../components/ui/Breadcrumb";
import { COLORS, colorForPct, colorForRisk } from "../../utils/colors";
import ContextualTip from "../../components/ui/ContextualTip";
import ErrorBoundary from "../../components/ui/ErrorBoundary";
import LastUpdated from "../../components/ui/LastUpdated";
import SmartAlerts from "../../components/dashboard/SmartAlerts";
import { computeRiskFromPct, contentTypeLabel, fmtGrade10FromPct, fmtPct } from "../../utils/helpers";
import { CONTENT_TYPE_ICONS, SHOW_CONTENT_RHYTHM, fmtLastAccess } from "./utils";
import { Card, CircularRing, CoverageBars, Divider, InfoTooltip, ProgressBar, StatusBadge } from "./primitives";
import { GradeDistributionCard } from "./panels";

// Pestaña "Tablero" (vista principal del curso): encabezado, KPIs, cobertura,
// resultados de aprendizaje, asignaciones, accesos, alertas y resumen semanal.
// Extraída de TeacherDashboard.jsx sin cambios de comportamiento: los datos y
// manejadores llegan por props desde el padre.
export function DashboardTab({
  accessListOpen,
  accessStats,
  assignmentRiskData,
  atRiskCount,
  atRiskPct,
  avgCov,
  avgOverdueUnscoredPct,
  avgPendingUngradedPct,
  avgPerfPct,
  consumptionDetailOpen,
  consumptionStats,
  consumptionStudentOpen,
  contentKpis,
  contentTopicMeta,
  contentTypesOpen,
  courseInfo,
  courseStatus,
  covDone,
  covPending,
  dropboxGradingStatus,
  elementsStats,
  handleOpenCoursePanel,
  handleRefresh,
  isCompact,
  isDualRole,
  isMobile,
  isNarrow,
  lastUpdate,
  learningOutcomesData,
  learningOutcomesRef,
  loading,
  missingNoDueList,
  missingNoDueOpen,
  navigate,
  orgUnitId,
  overview,
  overviewRef,
  pendingGradingList,
  pendingGradingOpen,
  priorityOverdueOpen,
  priorityRef,
  quizOutcomesData,
  raDashboard,
  raTab,
  riskData,
  selectStudentById,
  setAccessListOpen,
  setActiveTab,
  setConsumptionDetailOpen,
  setConsumptionStudentOpen,
  setContentTypesOpen,
  setMissingNoDueOpen,
  setPendingGradingOpen,
  setPriorityOverdueOpen,
  setRaTab,
  setSelectedStudent,
  studentRows,
  studentsCount,
  teacherAccessList,
  thresholds,
  totalAssignmentsCount,
  totalPendingGrading,
  totalStudents,
}) {
  return (
    <>

      {/* Page header */}
      <div className="fade-up tab-enter" style={{ marginBottom: 20 }}>
        {/* Breadcrumb */}
        <Breadcrumb items={[
          ...(isDualRole ? [{ label: "Inicio", icon: "🏠", onClick: () => navigate("/") }] : []),
          { label: "Mis cursos", icon: "📚", onClick: handleOpenCoursePanel },
          { label: courseInfo?.Name || `Curso ${orgUnitId}` },
        ]} />
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              Visor de desempeño estudiantil · Vista Docente
            </div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {courseInfo?.Name || (orgUnitId ? `Curso ${orgUnitId}` : "Selecciona un curso")}
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
              {studentsCount} estudiantes
              {avgPerfPct != null && avgPerfPct > 0 ? ` · Promedio ${fmtGrade10FromPct(avgPerfPct)}/10` : ""}
              {courseInfo?.StartDate ? ` · ${new Date(courseInfo.StartDate).getFullYear()}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <LastUpdated timestamp={lastUpdate} onRefresh={handleRefresh} loading={loading} />
            <StatusBadge status={courseStatus} />
          </div>
        </div>
      </div>

      {/* ── KPIs principales del curso (estilo tarjetas centradas, compacto) ── */}
      <div
        className="fade-up fade-up-1"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 12,
          alignItems: "stretch",
        }}
      >
        {/* Calificación promedio — donut centrado verticalmente: la tarjeta
            vecina (recursos educativos) creció con las barras de consumo y
            con alignItems:stretch esta quedaba arrinconada arriba */}
        <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: isMobile ? 12 : 14, textAlign: "center" }}>
          <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>
            Calificación promedio
          </div>
          <CircularRing
            pct={avgPerfPct != null && Number(avgPerfPct) > 0 ? avgPerfPct : 0}
            size={isMobile ? 96 : 128}
            stroke={12}
            color={avgPerfPct != null && Number(avgPerfPct) > 0 ? colorForPct(avgPerfPct, thresholds) : "var(--border)"}
            label={avgPerfPct == null || Number(avgPerfPct) === 0 ? "—" : fmtGrade10FromPct(avgPerfPct)}
            fontSize={isMobile ? 18 : 24}
          />
          <div style={{ fontSize: isMobile ? 10 : 11, color: "var(--muted)" }}>Escala 0–10 · gradebook</div>
        </div>

        {/* Estudiantes — número grande */}
        <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? 12 : 14, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>
            Estudiantes
          </div>
          <div style={{ fontSize: isMobile ? 30 : 38, fontWeight: 900, color: "var(--text)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
            {studentsCount || "—"}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>Inscritos en el curso</div>
        </div>

        {/* En riesgo — número grande coloreado */}
        <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? 12 : 14, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>
            En riesgo
          </div>
          <div style={{
            fontSize: isMobile ? 30 : 38, fontWeight: 900, fontFamily: "var(--font-mono)", lineHeight: 1,
            color: atRiskPct == null ? "var(--muted)" : atRiskPct > 40 ? COLORS.critical : atRiskPct > 20 ? COLORS.watch : COLORS.ok,
          }}>
            {atRiskPct == null ? "—" : atRiskCount}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>
            {atRiskPct == null ? "Sin datos aún" : `${fmtPct(atRiskPct)} del curso (alto + medio)`}
          </div>
        </div>

        {/* Contenidos creados — número grande + ritmo */}
        <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? 12 : 14, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em", display: "inline-flex", alignItems: "center", gap: 4 }}>
            Recursos educativos publicados <InfoTooltip text="Todo lo visible en las unidades del curso: archivos, páginas y enlaces, incluidos los enlazados dentro de páginas y unidades. No incluye las asignaciones." />
          </div>
          <div style={{ fontSize: isMobile ? 30 : 38, fontWeight: 900, color: elementsStats.total == null ? "var(--muted)" : SHOW_CONTENT_RHYTHM ? elementsStats.rhythm.color : "var(--text)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
            {elementsStats.total ?? "—"}
          </div>
          {SHOW_CONTENT_RHYTHM && (
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {contentKpis?.minExpected != null ? `Mínimo esperado: ${contentKpis.minExpected}` : "Desde inicio del curso"}
            </div>
          )}
          {SHOW_CONTENT_RHYTHM && elementsStats.total != null && (
            <span className="badge" style={{ background: elementsStats.rhythm.bg, color: elementsStats.rhythm.color, fontSize: 10 }}>
              {elementsStats.rhythm.label}
            </span>
          )}
          {(elementsStats.breakdown?.length ?? 0) > 0 && (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={() => setContentTypesOpen((v) => !v)}
                  aria-expanded={contentTypesOpen}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    fontSize: 10, fontWeight: 700, color: "var(--brand)",
                    fontFamily: "var(--font)", padding: "2px 6px",
                  }}
                >
                  Tipos de recurso educativo {contentTypesOpen ? "▴" : "▾"}
                </button>
                <InfoTooltip text="HTML: páginas creadas en Brightspace. Enlace: enlaces a páginas externas. Un enlace a un archivo (PDF, Word, Excel, PowerPoint) cuenta como ese archivo." />
              </span>
              {contentTypesOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", maxHeight: 110, overflowY: "auto" }}>
                  {elementsStats.breakdown.map((t) => (
                    <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "1px 8px" }}>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>
                        <span aria-hidden="true" style={{ marginRight: 4 }}>{CONTENT_TYPE_ICONS[t.label] || "📄"}</span>
                        {t.label}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--brand)" }}>{t.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Consumo de contenidos por estudiantes (antes en "Accesos al curso"):
              barras de promedio y cobertura + desplegable con el detalle */}
          <div style={{ width: "100%", textAlign: "left", marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            {consumptionStats == null ? (
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Cargando consumo…</div>
            ) : !consumptionStats.available ? (
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Consumo no disponible para este curso.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {consumptionStats.avgPct != null && (
                  <div>
                    <ProgressBar
                      value={Math.min(100, consumptionStats.avgPct)}
                      color={colorForPct(consumptionStats.avgPct, thresholds)}
                      animate={false}
                      showLabel={false}
                    />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        Promedio de acceso a recursos educativos
                        <InfoTooltip text="Porcentaje de los recursos publicados que ha consultado en promedio cada estudiante. Cada recurso cuenta una vez por estudiante." />
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>{fmtPct(consumptionStats.avgPct)}</span>
                    </div>
                  </div>
                )}
                {consumptionStats.openedPct != null && (
                  <div>
                    <ProgressBar
                      value={Math.min(100, consumptionStats.openedPct)}
                      color={colorForPct(consumptionStats.openedPct, thresholds)}
                      animate={false}
                      showLabel={false}
                    />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {consumptionStats.opened} de {consumptionStats.total} estudiantes han consultado recursos educativos
                        <InfoTooltip text="Estudiantes que han consultado al menos un recurso publicado del curso." />
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>{fmtPct(consumptionStats.openedPct)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="fade-up fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(4, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 12,
          alignItems: "stretch",
        }}
      >
        <div ref={overviewRef} style={{ order: 3, display: "flex" }}>
        <Card style={{ flex: 1 }} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📋 Evaluación y Feedback <InfoTooltip text="Índice de actividades evaluadas y retroalimentadas del curso: % del peso calificado, pendiente de calificación y vencido sin registro." /></span>} right={<StatusBadge status={courseStatus} />} accent="brand">
          <div style={{ marginTop: 4 }}>
            {avgCov == null || Number(avgCov) === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Cobertura no disponible (sin evidencias calificadas)
              </div>
            ) : (
              <CoverageBars
                donePct={covDone}
                pendingPct={avgPendingUngradedPct}
                openPct={covPending}
                overduePct={avgOverdueUnscoredPct}
              />
            )}

            {/* Asignaciones por calificar (trabajo del profesor): número,
                barra de progreso y desplegable con las entregas de quiénes */}
            {pendingGradingList.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    ⏳ Asignaciones por calificar
                    <InfoTooltip text="Asignaciones con entregas de estudiantes que aún no tienen calificación ni feedback, sobre el total de asignaciones publicadas. Las que ya vencieron van primero." />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-mono)", color: pendingGradingList.some((f) => f.isPastDue) ? COLORS.critical : COLORS.watch }}>
                    {pendingGradingList.length}/{totalAssignmentsCount}
                  </span>
                </div>
                <ProgressBar
                  value={totalAssignmentsCount > 0 ? (pendingGradingList.length / totalAssignmentsCount) * 100 : 0}
                  color={pendingGradingList.some((f) => f.isPastDue) ? COLORS.critical : COLORS.watch}
                  animate={false}
                />
                <button
                  onClick={() => setPendingGradingOpen((v) => !v)}
                  aria-expanded={pendingGradingOpen}
                  style={{ marginTop: 6, background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--brand)", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  {pendingGradingOpen ? "Ocultar entregas" : `Ver entregas por calificar (${totalPendingGrading})`} <span style={{ fontSize: 9 }}>{pendingGradingOpen ? "▲" : "▼"}</span>
                </button>
                {pendingGradingOpen && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", paddingRight: 2 }}>
                    {pendingGradingList.map((f) => (
                      <div key={f.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", background: "var(--bg)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>
                            {f.name}{f.isGroup ? " (grupal)" : ""}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 800, flexShrink: 0, color: f.isPastDue ? COLORS.critical : "var(--muted)" }}>
                            {f.due
                              ? `${f.isPastDue ? "Venció" : "Vence"}: ${f.due.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`
                              : "Sin fecha"}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                          {f.pendingNames.length} de {f.submittedCount} entrega{f.submittedCount !== 1 ? "s" : ""} sin calificar:{" "}
                          <span style={{ color: "var(--muted-strong)" }}>{f.pendingNames.join(", ")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Asignaciones SIN fecha de vencimiento con la mayoría entregada:
                quiénes faltan por entregar (probablemente van tarde) */}
            {missingNoDueList.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  📥 Faltan por entregar (sin fecha límite)
                  <InfoTooltip text="Asignaciones sin fecha de vencimiento donde la mayoría del curso ya entregó (50% o más): no se puede saber si 'vencieron', pero los que faltan probablemente van tarde." />
                </div>
                <button
                  onClick={() => setMissingNoDueOpen((v) => !v)}
                  aria-expanded={missingNoDueOpen}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--brand)", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  {missingNoDueOpen ? "Ocultar" : `Ver asignaciones (${missingNoDueList.length})`} <span style={{ fontSize: 9 }}>{missingNoDueOpen ? "▲" : "▼"}</span>
                </button>
                {missingNoDueOpen && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto", paddingRight: 2 }}>
                    {missingNoDueList.map((f) => (
                      <div key={f.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", background: "var(--bg)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>
                            {f.name}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 800, flexShrink: 0, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                            {f.submittedCount}/{f.total} entregaron
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                          Faltan: <span style={{ color: "var(--muted-strong)" }}>{f.missing.join(", ")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
        </div>

        {/* ── Riesgo académico ── */}
        <div style={{ order: 1, display: "flex" }}>
          <Card style={{ flex: 1 }} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>⚠️ Riesgo académico <InfoTooltip text="Distribución de los estudiantes según su calificación actual: Alto (<5.0), Medio (5.0–7.0), Bajo (≥7.0). Se calcula solo con calificaciones reales publicadas, sin contar las columnas de corte." /></span>} accent="pending">
            {/* Dona (CircularRing), mismo tipo de gráfico que "Calificación promedio" */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "4px 0 6px" }}>
              <CircularRing
                pct={atRiskPct ?? 0}
                size={120}
                stroke={12}
                color={atRiskPct == null ? "var(--border)" : atRiskPct > 40 ? COLORS.critical : atRiskPct > 20 ? COLORS.watch : COLORS.ok}
                label={atRiskPct == null ? "—" : fmtPct(atRiskPct)}
                fontSize={20}
              />
              <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
                {totalStudents ? `${atRiskCount} de ${totalStudents} estudiantes en riesgo` : "Sin datos aún"}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {riskData.map((r) => {
                const count = Number(r.value || 0);
                const pct = totalStudents > 0 ? (count / totalStudents) * 100 : 0;
                return (
                  <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: colorForRisk(r.key),
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                      {r.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: "var(--font-mono)",
                        color: colorForRisk(r.key),
                      }}
                    >
                      {count}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", width: 44, textAlign: "right" }}>
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Distribución de notas ── */}
        <div style={{ order: 2, display: "flex" }}>
          <GradeDistributionCard studentRows={studentRows} thresholds={thresholds} style={{ flex: 1 }} />
        </div>

        <div ref={priorityRef} style={{ order: 4, display: "flex" }}>
        <Card
          style={{ flex: 1 }}
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🚨 Estudiantes prioritarios <InfoTooltip text="Estudiantes con calificación crítica (<5) o con asignaciones vencidas que NO entregaron. Si además llevan más de 7 días sin ingresar, se muestra la alerta — pero la inactividad por sí sola no los incluye aquí (esa vista completa está en Accesos al curso). Lo que ya entregaron y falta calificar está en Evaluación y Feedback." /></span>} accent="critical"
          right={
            assignmentRiskData.length > 0
              ? <span className="tag" style={{ background: "var(--critical-bg)", color: "var(--critical-fg)" }}>Requieren atención</span>
              : <StatusBadge status="solido" />
          }
        >
          {(studentRows.some((s) => s.isLoading) || dropboxGradingStatus === null) && !assignmentRiskData.length ? (
            <div className="empty-state" style={{ minHeight: 120 }}>
              <span className="pulse-dot" style={{ background: COLORS.brand, width: 10, height: 10 }} />
              <span style={{ fontSize: 12 }}>Cargando datos de entregas…</span>
            </div>
          ) : assignmentRiskData.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                Calificación &lt;5 · vencidas sin entrega
              </div>
              <div style={{ overflowY: "auto", maxHeight: 300, paddingRight: 2, display: "flex", flexDirection: "column", gap: 6 }}>
              {assignmentRiskData.map((item) => {
                const covColor = colorForPct(item.coveragePct, thresholds);
                const hasOverdue = item.hasOverdue;
                const hasLowGrade = item.isLowGrade;
                const grade10 = item.currentPerformancePct != null ? (item.currentPerformancePct / 10).toFixed(1) : null;
                const gradeColor = item.currentPerformancePct != null ? colorForPct(item.currentPerformancePct, thresholds) : COLORS.pending;
                const borderColor = hasLowGrade ? "var(--critical-border)" : hasOverdue ? "var(--watch-border)" : "var(--border)";
                const bgColor = hasLowGrade ? "var(--critical-bg)" : hasOverdue ? "var(--watch-bg)" : "var(--card)";

                return (
                  <div
                    key={item.userId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const s = studentRows.find((r) => r.userId === item.userId);
                      if (s) setSelectedStudent(s);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return; // no interceptar controles internos
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const s = studentRows.find((r) => r.userId === item.userId);
                        if (s) setSelectedStudent(s);
                      }
                    }}
                    style={{
                      border: `1px solid ${borderColor}`,
                      borderRadius: 10,
                      padding: "9px 11px",
                      background: bgColor,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      transition: "box-shadow 0.15s, transform 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </div>
                        <div style={{ marginTop: 2, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
                          {item.isLowGrade && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.critical, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠️ Calificación crítica</span>
                          )}
                          {item.hasOverdue && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.critical, textTransform: "uppercase", letterSpacing: "0.06em" }}>🔴 {item.overdueList.length} vencida{item.overdueList.length !== 1 ? "s" : ""} sin entrega</span>
                          )}
                          {item.isInactive && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.watch, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              🕐 {item.inactiveDays == null ? "Nunca ha ingresado" : `Sin ingresar hace ${item.inactiveDays} días`}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={computeRiskFromPct(item.currentPerformancePct)} />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {grade10 != null && (
                          <div style={{ flex: 1, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "color-mix(in srgb, var(--card) 60%, transparent)", border: `1px solid ${gradeColor}30` }}>
                            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Nota</div>
                            <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "var(--font-mono)", color: gradeColor, lineHeight: 1.1 }}>{grade10}</div>
                          </div>
                        )}
                        {hasOverdue && (
                          <div
                            title="Asignaciones con fecha vencida que este estudiante NO ha entregado (las de fecha heredada de importación no cuentan)"
                            style={{ flex: 1, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "color-mix(in srgb, var(--card) 60%, transparent)", border: "1px solid var(--critical-border)" }}
                          >
                            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Sin entregar</div>
                            <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: COLORS.critical }}>{item.overdueList.length}</div>
                          </div>
                        )}
                        {item.isInactive && (
                          <div
                            title="Último ingreso del estudiante al aula en Brightspace"
                            style={{ flex: 1, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "color-mix(in srgb, var(--card) 60%, transparent)", border: "1px solid var(--watch-border)" }}
                          >
                            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Último ingreso</div>
                            <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: COLORS.watch }}>
                              {item.inactiveDays == null ? "Nunca" : `${item.inactiveDays}d`}
                            </div>
                          </div>
                        )}
                      </div>
                      {hasOverdue && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPriorityOverdueOpen((v) => (v === item.userId ? null : item.userId)); }}
                          aria-expanded={priorityOverdueOpen === item.userId}
                          style={{ alignSelf: "center", background: "none", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, color: "var(--brand)", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          {priorityOverdueOpen === item.userId ? "Ocultar asignaciones vencidas ▴" : "Ver asignaciones vencidas sin entrega ▾"}
                        </button>
                      )}
                      {priorityOverdueOpen === item.userId && item.overdueList.length > 0 && (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 3, background: "color-mix(in srgb, var(--card) 60%, transparent)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px", cursor: "default" }}>
                          {item.overdueList.map((it2, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10 }}>
                              <span style={{ color: "var(--text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it2.name}>{it2.name}</span>
                              <span style={{ color: COLORS.critical, fontWeight: 800, flexShrink: 0 }}>
                                Venció: {it2.dueDate.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ width: "100%" }}>
                        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          Cobertura
                          <InfoTooltip text="Qué tanto del curso ya tiene calificación para este estudiante. 0% significa que aún no tiene calificaciones publicadas en este curso." />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${item.coveragePct}%`, background: covColor, borderRadius: 999 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "var(--font-mono)", color: covColor, flexShrink: 0 }}>
                            {fmtPct(item.coveragePct)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>
                Haz clic en un estudiante para ver su gemelo →
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ minHeight: 110 }}>
              <span className="empty-state-icon">✅</span>
              <span style={{ fontSize: 12 }}>Sin estudiantes críticos</span>
              <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                Todos los estudiantes tienen cobertura ≥ 60% y sin ítems vencidos.
              </span>
            </div>
          )}
        </Card>
        </div>

      </div>

      {/* ── Fila: Resultados de aprendizaje + Asignaciones + Accesos ──
          En pantallas compactas (≤1366) RA pasa a ocupar una fila completa
          y Asignaciones + Accesos comparten la de abajo, para que estas dos
          no se aplasten; en móvil todo va en una columna. */}
      <div
        className="fade-up fade-up-2"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : isCompact ? "1fr 1fr" : "1.15fr 1.15fr 0.75fr",
          gap: 12,
          marginBottom: 12,
          alignItems: "stretch",
        }}
      >
      <div ref={learningOutcomesRef} style={{ display: "flex", gridColumn: !isMobile && isCompact ? "1 / -1" : "auto" }}>
        <Card
          style={{ flex: 1 }}
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🎯 Resultados de aprendizaje <InfoTooltip text="Resultados de Aprendizaje (RA) del curso ordenados de menor a mayor desempeño. El RA en primera posición es donde tus estudiantes están más débiles — prioriza refuerzo ahí." /></span>}
          accent="brand"
          right={
            <button
              onClick={() => setActiveTab("learning-outcomes")}
              title="Vincula o ajusta los RA de tus actividades para activar/afinar la analítica por resultado."
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                color: "var(--on-brand)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.1))",
              }}
            >
              🔗 Vincular
            </button>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {quizOutcomesData.length > 0 && (
              <div
                role="tablist"
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  gap: 2,
                  padding: 3,
                  borderRadius: 10,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  marginBottom: 2,
                }}
              >
                {[
                  { key: "rubrica", label: "Por asignación" },
                  { key: "quiz", label: "Por quiz" },
                ].map((tab) => {
                  const active = raTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setRaTab(tab.key)}
                      style={{
                        border: "none",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "5px 12px",
                        borderRadius: 8,
                        background: active ? "var(--brand)" : "transparent",
                        color: active ? "var(--on-brand)" : "var(--muted-strong)",
                        transition: "background 0.15s",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 8 }}>
            {(raTab === "quiz" ? quizOutcomesData : learningOutcomesData)
              .slice()
              .sort((a, b) => a.avgPct - b.avgPct)
              .map((m) => {
                const computedStatus =
                  m.status ||
                  (m.avgPct < thresholds.critical
                    ? "critico"
                    : m.avgPct < thresholds.watch
                    ? "observacion"
                    : "solido");
                const ringColor = colorForPct(m.avgPct, thresholds);

                return (
                  <div
                    key={m.code}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: "var(--card)",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      transition: "box-shadow 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow-md)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                  >
                    <CircularRing
                      pct={m.studentsWithData > 0 ? m.avgPct : 0}
                      size={64}
                      stroke={6}
                      color={m.studentsWithData > 0 ? ringColor : "var(--border)"}
                      label={m.studentsWithData > 0 ? fmtPct(m.avgPct) : "—"}
                      fontSize={11}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span className="tag">{m.code}</span>
                        <InfoTooltip text={(m.description || m.name || "Sin descripción disponible.").trim()} />
                        <div style={{ marginLeft: "auto" }}>
                          {m.studentsWithData > 0
                            ? <StatusBadge status={computedStatus} />
                            : <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", background: "var(--bg)", padding: "2px 7px", borderRadius: 99, border: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.alignedToAssignment ? "Sin uso" : "Sin asignación"}</span>
                          }
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
                        {m.source === "quiz"
                          ? "Evaluado por quiz"
                          : `Peso ${m.weightPct ? `${Number(m.weightPct).toFixed(0)}%` : "—"}`}
                      </div>
                      {m.studentsWithData > 0 && m.coveragePct != null ? (
                        <div>
                          <ProgressBar value={m.coveragePct} color={colorForPct(m.coveragePct, thresholds)} />
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: "right" }}>
                            {fmtPct(m.coveragePct)} · {m.studentsWithData}/{m.totalStudents} est.
                          </div>
                        </div>
                      ) : m.studentsWithData === 0 ? (
                        <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.4 }}>
                          {m.alignedToAssignment
                            ? "Sin evaluaciones vinculadas a rúbricas aún."
                            : (m.note || "No alineado a asignaciones (evaluado por quiz).")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {!(raTab === "quiz" ? quizOutcomesData : learningOutcomesData).length && (
              <div className="empty-state">
                <span className="empty-state-icon">🎯</span>
                <span style={{ fontSize: 12 }}>Sin datos de RA para este curso</span>
                <span style={{ fontSize: 11, color: "var(--muted-strong)", textAlign: "center", lineHeight: 1.5, maxWidth: 340, marginTop: 4 }}>
                  Los Resultados de Aprendizaje necesitan estar registrados en Brightspace <strong>y</strong> mapeados a las rúbricas del curso en la configuración del gemelo.
                  Si el curso ya los tiene definidos en Brightspace, solicita al equipo que registre la configuración para este <code>orgUnitId</code>.
                </span>
                {Number(avgCov ?? 0) > 0 && (
                  <span style={{ fontSize: 11, color: "var(--watch)", fontWeight: 700, textAlign: "center", padding: "4px 8px", borderRadius: 8, background: "var(--watch-bg)", marginTop: 6 }}>
                    ⚠️ Hay evidencias calificadas pero sin rúbricas vinculadas a RA
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Estado de asignaciones (entregado / calificado / vencido) ── */}
      <div style={{ display: "flex" }}>
        <Card
          style={{ flex: 1 }}
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📝 Asignaciones del curso <InfoTooltip text="Estado de las asignaciones publicadas en Brightspace: cuántas tienen entregas de estudiantes (con % de entrega), cuántas ya están completamente calificadas y cuántas vencieron. Ordenadas por fecha de entrega." /></span>}
          accent="brand"
        >
          <ErrorBoundary sectionName="Asignaciones del curso">
            <AssignmentsPanel orgUnitId={orgUnitId} courseStart={courseInfo?.StartDate} />
          </ErrorBoundary>
        </Card>
      </div>

      {/* ── Accesos al curso (LastAccessed del classlist) ── */}
      <div style={{ display: "flex" }}>
        <Card
          style={{ flex: 1 }}
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🔑 Accesos al curso <InfoTooltip text="Último ingreso de cada estudiante al curso en Brightspace. Útil para detectar estudiantes desconectados. En la pestaña Estudiantes ves el último ingreso de cada uno." /></span>}
          accent="brand"
        >
          {accessStats == null ? (
            <div className="empty-state" style={{ minHeight: 90 }}>
              <span className="pulse-dot" style={{ background: COLORS.brand, width: 8, height: 8 }} />
              <span style={{ fontSize: 11 }}>Cargando accesos…</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[
                { key: "today", label: "Ingresaron hoy", value: accessStats.today, color: COLORS.ok },
                { key: "week", label: "Ingresaron entre ayer y hace 7 días", value: accessStats.week, color: COLORS.brand },
                { key: "stale", label: "Sin ingresar hace +7 días", value: accessStats.stale, color: accessStats.stale > 0 ? COLORS.critical : "var(--muted)" },
                { key: "never", label: "Nunca han ingresado", value: accessStats.never, color: accessStats.never > 0 ? COLORS.critical : "var(--muted)" },
              ].map((row) => {
                const canExpand = row.value > 0;
                const isOpen = accessListOpen === row.key;
                const rowInner = (
                  <>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, color: "var(--text)", fontWeight: 600, textAlign: "left" }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-mono)", color: row.color }}>{row.value}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", width: 40, textAlign: "right" }}>
                      {accessStats.total > 0 ? `${((row.value / accessStats.total) * 100).toFixed(0)}%` : ""}
                    </div>
                    {canExpand && (
                      <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>{isOpen ? "▴" : "▾"}</span>
                    )}
                  </>
                );
                return canExpand ? (
                  <button
                    key={row.key}
                    onClick={() => setAccessListOpen((v) => (v === row.key ? null : row.key))}
                    aria-expanded={isOpen}
                    title="Clic para ver quiénes son"
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: isOpen ? "var(--bg)" : "transparent",
                      border: "none", borderRadius: 8, padding: "3px 4px",
                      cursor: "pointer", fontFamily: "var(--font)", width: "100%",
                    }}
                  >
                    {rowInner}
                  </button>
                ) : (
                  <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 4px" }}>
                    {rowInner}
                  </div>
                );
              })}

              {accessListOpen && (() => {
                const lists = {
                  today: accessStats.todayList,
                  week: accessStats.weekList,
                  stale: accessStats.staleList,
                  never: accessStats.neverList,
                };
                const colors = { today: COLORS.ok, week: COLORS.brand, stale: COLORS.critical, never: COLORS.critical };
                const rightLabel = (s) => {
                  if (accessListOpen === "never") return "Nunca";
                  if (s.days === 0) return "Hoy";
                  if (s.days === 1) return "Ayer";
                  return `Hace ${s.days} días`;
                };
                const list = lists[accessListOpen] || [];
                if (!list.length) return null;
                return (
                  <div style={{
                    maxHeight: 170, overflowY: "auto",
                    border: "1px solid var(--border)", borderRadius: 10,
                    background: "var(--bg)", padding: "4px 2px",
                    display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    {list.map((s) => (
                      <button
                        key={s.userId}
                        onClick={() => {
                          const row = studentRows.find((r) => r.userId === s.userId);
                          if (row) setSelectedStudent(row);
                        }}
                        title="Ver el gemelo de este estudiante"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                          border: "none", background: "transparent", cursor: "pointer",
                          padding: "4px 8px", borderRadius: 6, fontSize: 11,
                          fontFamily: "var(--font)", color: "var(--text)", textAlign: "left", width: "100%",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-light)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        <span style={{ color: colors[accessListOpen], fontWeight: 800, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                          {rightLabel(s)}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              <Divider />

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Accesos del profesor
                </div>
                <InfoTooltip text="Último ingreso al curso de cada miembro del equipo docente." />
              </div>
              {teacherAccessList.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Dato no disponible.</div>
              ) : (
                teacherAccessList.slice(0, 4).map((t) => (
                  <div key={t.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontWeight: 700 }}>
                      {t.name}
                    </span>
                    <span style={{ color: t.iso ? "var(--text)" : COLORS.critical, fontWeight: 800, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {fmtLastAccess(t.iso)}
                    </span>
                  </div>
                ))
              )}

              {/* Detalle de acceso a contenidos por estudiante (las barras de
                  resumen viven en la tarjeta KPI "Elementos publicados") */}
              {consumptionStats?.available && (
                <>
                  <Divider />

                  <button
                    className="btn"
                    onClick={() => { setConsumptionDetailOpen((v) => !v); setConsumptionStudentOpen(null); }}
                    aria-expanded={consumptionDetailOpen}
                    style={{ alignSelf: "center", fontSize: 11, padding: "5px 12px", borderRadius: 8 }}
                  >
                    👥 {consumptionDetailOpen ? "Ocultar detalle" : "Acceso a contenidos"} {consumptionDetailOpen ? "▴" : "▾"}
                  </button>

                  {consumptionDetailOpen && (
                    <div style={{
                      maxHeight: 220, overflowY: "auto",
                      border: "1px solid var(--border)", borderRadius: 10,
                      background: "var(--bg)", padding: "4px 2px",
                      display: "flex", flexDirection: "column", gap: 2,
                    }}>
                      {(consumptionStats.detail || []).map((s) => {
                        const isOpen = consumptionStudentOpen === s.userId;
                        const hasTopics = s.topicIds.length > 0;
                        return (
                          <div key={s.userId}>
                            <button
                              onClick={() => setConsumptionStudentOpen((v) => (v === s.userId ? null : s.userId))}
                              title={hasTopics ? "Ver qué contenidos consultó" : "Sin detalle de contenidos"}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                                border: "none", background: isOpen ? "var(--brand-light)" : "transparent",
                                cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontSize: 11,
                                fontFamily: "var(--font)", color: "var(--text)", textAlign: "left", width: "100%",
                              }}
                            >
                              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                <span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color: s.count > 0 ? "var(--brand)" : "var(--muted)" }}>
                                  {s.count} {s.count === 1 ? "contenido" : "contenidos"}
                                </span>
                                {hasTopics && <span style={{ fontSize: 9, color: "var(--muted)" }}>{isOpen ? "▴" : "▾"}</span>}
                              </span>
                            </button>
                            {isOpen && hasTopics && (
                              <div style={{ padding: "2px 8px 6px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                                {[...new Set(s.topicIds)].map((tid) => {
                                  const meta = contentTopicMeta.get(String(tid));
                                  const title = meta?.title || `Contenido ${tid}`;
                                  const typeLabel = contentTypeLabel(title, meta?.url, meta?.topicType);
                                  return (
                                    <div key={tid} style={{ fontSize: 10, color: "var(--muted-strong)", display: "flex", gap: 5, alignItems: "flex-start" }}>
                                      <span aria-hidden="true" style={{ flexShrink: 0 }} title={typeLabel}>{CONTENT_TYPE_ICONS[typeLabel] || "📄"}</span>
                                      <span style={{ lineHeight: 1.35 }}>{title}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {isOpen && !hasTopics && (
                              <div style={{ padding: "2px 8px 6px 16px", fontSize: 10, color: "var(--muted)" }}>
                                Sin detalle de contenidos disponible para este estudiante.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

            </div>
          )}
        </Card>
      </div>

      </div>

      {/* ── Alertas inteligentes (fusiona Radar docente + heurísticas locales) ── */}
      <div className="fade-up fade-up-3" style={{ marginBottom: 12 }}>
        <ErrorBoundary sectionName="Alertas inteligentes">
          <SmartAlerts
            studentRows={studentRows}
            overview={overview}
            courseInfo={courseInfo}
            contentKpis={contentKpis}
            backendAlerts={overview?.alerts}
            onStudentClick={selectStudentById}
          />
        </ErrorBoundary>
      </div>

      {/* ── Resumen semanal IA (narrativa) ── */}
      <div className="fade-up fade-up-3" style={{ marginBottom: 12 }}>
        <ContextualTip
          id="batch4_intro_v3"
          title="✨ Nuevas funciones disponibles"
          description="Tu dashboard ahora tiene resumen narrativo con IA, predicción de calificaciones finales (menú lateral), alertas inteligentes, tendencias históricas y más. Haz Ctrl+K para la paleta de comandos, o presiona ? para ver todos los atajos."
        />
        <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🤖 Resumen semanal <InfoTooltip text="Resumen narrativo en lenguaje natural del estado del curso. Se genera automáticamente a partir de los datos actuales. Puedes escucharlo con TTS." /></span>} accent="brand">
          <ErrorBoundary sectionName="Resumen semanal">
            <AINarrativeSummary
              studentRows={studentRows}
              overview={overview}
              courseInfo={courseInfo}
              raDashboard={raDashboard}
              contentKpis={contentKpis}
            />
          </ErrorBoundary>
        </Card>
      </div>

    </>
  );
}
