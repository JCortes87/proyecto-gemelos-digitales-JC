import { COLORS, colorForPct } from "../../utils/colors";
import StudentAvatar from "../../components/ui/StudentAvatar";
import SchemeGradeChip from "../../components/ui/SchemeGradeChip";
import useGradeScheme from "../../hooks/useGradeScheme";
import { buildCorteGroups, computeRiskFromPct, fmtGrade10FromPct, fmtPct } from "../../utils/helpers";
import { Card, CircularRing, CoverageBars, ProgressBar, StatusBadge } from "./primitives";
import { EvidencesTimeline, NoRaMappingNotice, PendingItemsBlock, ProjectionBlock, QualityFlagsBlock } from "./panels";

// Contenido del Drawer de detalle del estudiante (pestañas resumen, evidencias,
// unidades, prescripción, calidad, historial y notas). Extraído de
// TeacherDashboard.jsx sin cambios de comportamiento: todo el estado vive en el padre.
export function StudentDrawerBody({
  chatInputText,
  chatInputType,
  courseInfo,
  drawerTab,
  learningOutcomesData,
  orgUnitId,
  outcomesMap,
  selectedStudent,
  setChatInputText,
  setChatInputType,
  setDrawerTab,
  setShowThresholdsModal,
  studentChatHook,
  studentDetail,
  studentErr,
  studentLoading,
  studentNotesHook,
  thresholds,
  thresholdsOverride,
}) {
  // Esquema de calificación del curso (Brightspace) para mostrar la nota en su escala.
  const gradeScheme = useGradeScheme(orgUnitId);
  // Valores derivados del detalle del estudiante (antes calculados en el padre;
  // solo los usa este Drawer).
  const drawerSummary = studentDetail?.summary || {};
  const drawerMacro = (studentDetail?.macroUnits || studentDetail?.macro?.units || []).map((u) => ({
    code: u.code,
    pct: Number(u.pct || 0),
  }));
  const drawerUnits = studentDetail?.units || [];
  const drawerPrescription = Array.isArray(studentDetail?.prescription) ? studentDetail.prescription : [];
  const drawerProjection = studentDetail?.projection || null;
  const drawerGradebook = studentDetail?.gradebook || {};
  const drawerEvidences = Array.isArray(drawerGradebook?.evidences) ? drawerGradebook.evidences : [];
  const drawerGradeCategories = Array.isArray(drawerGradebook?.gradeCategories) ? drawerGradebook.gradeCategories : [];
  const drawerPendingItems = Array.isArray(drawerGradebook?.pendingItems) ? drawerGradebook.pendingItems : [];
  const drawerMissingValues = Array.isArray(drawerGradebook?.missingValues) ? drawerGradebook.missingValues : [];
  const drawerQcFlags = Array.isArray(studentDetail?.qualityFlags) ? studentDetail.qualityFlags : [];
  const drawerPendingUngradedPct = Number(drawerSummary?.pendingUngradedWeightPct ?? 0);
  const drawerOverdueUnscoredPct = Number(drawerSummary?.overdueUnscoredWeightPct ?? 0);
  const covGraded = Number(drawerSummary?.gradedItemsCount ?? drawerGradebook?.gradedItemsCount ?? 0) || 0;
  const covTotal = Number(drawerSummary?.totalItemsCount ?? drawerGradebook?.totalItemsCount ?? 0) || 0;
  const covText =
    drawerSummary?.coverageCountText ||
    drawerGradebook?.coverageCountText ||
    (covTotal > 0 ? `${covGraded}/${covTotal}` : null);

  const drawerTabs = [
    { id: "resumen", label: "Resumen", icon: "📊" },
    { id: "evidencias", label: "Evidencias", icon: "📋", count: drawerEvidences.length || undefined },
    { id: "unidades", label: "Unidades", icon: "🎯", count: drawerUnits.length || undefined },
    { id: "notas", label: "Mis notas", icon: "📝" },
    { id: "historial", label: "Historial", icon: "💬", count: studentChatHook.entries.length || undefined },
    ...(drawerPrescription.length
      ? [{ id: "prescripcion", label: "Intervención", icon: "💊", count: drawerPrescription.length }]
      : []),
    ...(drawerQcFlags.filter((f) => f?.type && f.type !== "role_not_enabled").length
      ? [{ id: "calidad", label: "Calidad", icon: "🔍" }]
      : []),
  ];

  return (
    <>
      {studentLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
          <div className="cesa-water-text" style={{ fontSize: 36 }}>
            <span className="cesa-water-text__outline" style={{ fontSize: 36 }}>CESA</span>
            <span className="cesa-water-text__fill" aria-hidden="true" style={{ fontSize: 36 }}>CESA</span>
            <span className="cesa-water-text__wave" aria-hidden="true" />
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Consolidando gemelo digital…</div>
        </div>
      ) : studentErr ? (
        <Card title="Error" right={<StatusBadge status="critico" />}>
          <div style={{ color: "var(--critical)", fontWeight: 700 }}>{studentErr}</div>
        </Card>
      ) : !studentDetail ? (
        <Card title="Sin información" right={<StatusBadge status="pending" />}>
          <div style={{ color: "var(--muted)" }}>No hay datos consolidados para este estudiante.</div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── Student header: photo + quick actions ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", flexWrap: "wrap" }}>
            <StudentAvatar userId={selectedStudent?.userId} name={selectedStudent?.displayName} size={56} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>
                {selectedStudent?.displayName || "Estudiante"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                ID {selectedStudent?.userId ?? "—"}
                {studentDetail?.email && <> · {studentDetail.email}</>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {studentDetail?.email && (
                <a
                  href={`mailto:${studentDetail.email}?subject=${encodeURIComponent("Sobre tu curso: " + (courseInfo?.Name || ""))}`}
                  className="btn"
                  style={{ fontSize: 11, padding: "6px 10px", textDecoration: "none" }}
                  title="Enviar correo al estudiante"
                >
                  ✉ Email
                </a>
              )}
              <button
                className="btn"
                onClick={() => window.print()}
                style={{ fontSize: 11, padding: "6px 10px" }}
                title="Imprimir expediente del estudiante"
              >
                🖨 Imprimir
              </button>
            </div>
          </div>

          {/* ── Hero KPI row with circular rings ── */}
          <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
            {/* Nota ring */}
            <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 10px", background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border)", gap: 6 }}>
              <CircularRing
                pct={drawerSummary?.currentPerformancePct ?? 0}
                size={88}
                stroke={8}
                color={colorForPct(drawerSummary?.currentPerformancePct, thresholds)}
                label={fmtGrade10FromPct(drawerSummary?.currentPerformancePct)}
                sublabel="/10"
                fontSize={20}
              />
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Nota actual</div>
              <SchemeGradeChip scheme={gradeScheme} pct={drawerSummary?.currentPerformancePct} />
            </div>
            {/* Cobertura ring */}
            <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 10px", background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border)", gap: 6 }}>
              <CircularRing
                pct={drawerSummary?.coveragePct ?? 0}
                size={88}
                stroke={8}
                color={colorForPct(drawerSummary?.coveragePct, thresholds)}
                label={fmtPct(drawerSummary?.coveragePct)}
                fontSize={14}
              />
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Cobertura</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>{covText || "—"} ítems</div>
            </div>
            {/* Riesgo + stats */}
            <div style={{ flex: "2 1 180px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 14px", background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border)", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Estado de riesgo</span>
                <StatusBadge status={drawerSummary?.risk || selectedStudent?.risk || "pending"} />
              </div>
              {drawerPendingUngradedPct > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "var(--watch-bg)", border: "1px solid var(--watch-border)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--watch)" }}>⏳ Pendiente calificación</span>
                  <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--watch)" }}>{fmtPct(drawerPendingUngradedPct)}</span>
                </div>
              )}
              {drawerOverdueUnscoredPct > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "var(--critical-bg)", border: "1px solid var(--critical-border)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--critical)" }}>🔴 Vencido sin entrega</span>
                  <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--critical)" }}>{fmtPct(drawerOverdueUnscoredPct)}</span>
                </div>
              )}
              {drawerPendingUngradedPct === 0 && drawerOverdueUnscoredPct === 0 && (
                <div style={{ fontSize: 12, color: "var(--ok)", fontWeight: 700 }}>✅ Sin entregas pendientes</div>
              )}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
            {drawerTabs.map((tab) => (
              <button key={tab.id} className={`chip ${drawerTab === tab.id ? "active" : ""}`} onClick={() => setDrawerTab(tab.id)} style={{ fontSize: 12 }}>
                {tab.icon} {tab.label}{" "}
                {tab.count != null ? (
                  <span className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{tab.count}</span>
                ) : null}
              </button>
            ))}
          </div>

          {drawerTab === "resumen" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Cobertura individual del estudiante */}
              {drawerSummary?.coveragePct != null && (
                <Card title="Cobertura de evaluación">
                  <CoverageBars
                    donePct={drawerSummary?.coveragePct ?? 0}
                    pendingPct={drawerPendingUngradedPct}
                    openPct={Math.max(0, 100 - (drawerSummary?.coveragePct ?? 0) - drawerPendingUngradedPct - drawerOverdueUnscoredPct)}
                    overduePct={drawerOverdueUnscoredPct}
                  />
                </Card>
              )}

              {drawerMacro.length > 0 ? (
                <Card title="Resultados de aprendizaje del estudiante">
                  {/* Ring grid */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 14 }}>
                    {drawerMacro.map((item) => {
                      const ringColor = colorForPct(item.pct, thresholds);
                      const isCrit = item.pct < (thresholds?.critical ?? 50);
                      const isWatch = !isCrit && item.pct < (thresholds?.watch ?? 70);
                      const statusLabel = isCrit ? "Crítico" : isWatch ? "Observación" : "Óptimo";
                      const statusColor = isCrit ? COLORS.critical : isWatch ? COLORS.watch : COLORS.ok;
                      return (
                        <div key={item.code} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 10px 10px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", flex: "1 1 90px", maxWidth: 130 }}>
                          <CircularRing pct={item.pct} size={68} stroke={7} color={ringColor} label={fmtPct(item.pct)} fontSize={11} />
                          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", textAlign: "center" }}>{item.code}</div>
                          <span style={{ fontSize: 9, fontWeight: 800, color: statusColor, background: statusColor + "1A", padding: "2px 7px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em" }}>{statusLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Description list — one row per RA */}
                  {drawerMacro.some(item => {
                    const ri = learningOutcomesData.find(r => r.code === item.code);
                    return ri?.description || ri?.name;
                  }) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                      {drawerMacro.map((item) => {
                        const ri = learningOutcomesData.find(r => r.code === item.code);
                        const rawDesc = ri?.description || ri?.name || "";
                        // Strip leading "CODE - " prefix if present
                        const desc = rawDesc.replace(/^[A-Za-z0-9_.-]+\s*[-–]\s*/, "").trim();
                        if (!desc || desc === item.code) return null;
                        const ringColor = colorForPct(item.pct, thresholds);
                        return (
                          <div key={item.code + "_d"} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}>
                            <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 900, color: ringColor, minWidth: 26, paddingTop: 1 }}>{item.code}</span>
                            <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, fontWeight: 500 }}>{desc}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Legend */}
                  <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--muted)", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 2, background: COLORS.critical, display: "inline-block", borderRadius: 1 }} /> Crítico ({thresholds?.critical ?? 50}%)
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 2, background: COLORS.watch, display: "inline-block", borderRadius: 1 }} /> Observación ({thresholds?.watch ?? 70}%)
                    </span>
                    <button
                      onClick={() => setShowThresholdsModal(true)}
                      title="Configurar umbrales de riesgo para este curso"
                      style={{
                        marginLeft: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700,
                        border: "1px solid var(--border)", background: "var(--card)",
                        color: "var(--brand)", borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      ⚙ Ajustar{thresholdsOverride ? " ●" : ""}
                    </button>
                  </div>
                </Card>
              ) : learningOutcomesData.length > 0 ? (
                <Card title="Resultados de aprendizaje del curso">
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
                    Sin datos de evaluación por RA para este estudiante aún. Resultados del curso:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {learningOutcomesData.map((ra) => (
                      <div key={ra.code} style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "8px 10px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "var(--bg)",
                      }}>
                        <span className="tag" style={{ flexShrink: 0, marginTop: 1 }}>{ra.code}</span>
                        <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, fontWeight: 500 }}>
                          {ra.description || ra.name || ra.code}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              {drawerProjection && <ProjectionBlock projection={drawerProjection} thresholds={thresholds} />}

              {selectedStudent?.route && (
                <Card title={selectedStudent.route.title} right={<StatusBadge status={computeRiskFromPct(selectedStudent?.currentPerformancePct)} />}>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{selectedStudent.route.summary}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(selectedStudent.route.actions || []).map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: COLORS.brand, fontWeight: 900, minWidth: 16, fontSize: 12 }}>{i + 1}.</span>
                        <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <PendingItemsBlock pendingItems={drawerPendingItems} missingValues={drawerMissingValues} />
            </div>
          )}

          {drawerTab === "evidencias" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {drawerEvidences.length > 0 ? (() => {
                const drawerNonCorte = drawerEvidences.filter(e => e?.isCorte !== true);
                const drawerOverdue = drawerNonCorte.filter(e => e?.status === "overdue_unscored" || (e?.isOverdue && e?.scorePct == null));
                // Mapa evidenceKey → [códigos RA] derivado de las unidades
                // del estudiante. u.evidence[].folderId/gradeObjectId nos
                // conecta cada evidencia con las RAs a las que aporta.
                const evidenceRasMap = (() => {
                  const m = new Map();
                  for (const u of (drawerUnits || [])) {
                    const code = u?.code;
                    if (!code) continue;
                    for (const ev of (u.evidence || [])) {
                      const keys = [ev?.folderId, ev?.gradeObjectId, ev?.rubricId]
                        .filter((k) => k != null)
                        .map(String);
                      for (const k of keys) {
                        if (!m.has(k)) m.set(k, new Set());
                        m.get(k).add(code);
                      }
                    }
                  }
                  return m;
                })();
                const raCodesFor = (e) => {
                  const cands = [e?.gradeObjectId, e?.folderId, e?.rubricId]
                    .filter((k) => k != null)
                    .map(String);
                  const set = new Set();
                  for (const k of cands) {
                    const v = evidenceRasMap.get(k);
                    if (v) v.forEach((c) => set.add(c));
                  }
                  return Array.from(set);
                };
                const fmtDue = (iso) => {
                  if (!iso) return "—";
                  try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" }); } catch { return "—"; }
                };
                return (
                  <>
                    {/* Cortes agrupados por categoría/período (no cuentan en el promedio) */}
                    {(() => {
                      const dgroups = buildCorteGroups(drawerEvidences, drawerGradeCategories);
                      return dgroups.length > 0;
                    })() && (
                      <Card title="Resumen por Cortes" right={<span className="tag">No suman</span>} accent="brand">
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                          📊 Ponderados acumulados que Brightspace calcula. Se agrupan por categoría/corte con las evidencias que los componen. <strong>No cuentan</strong> en el promedio del estudiante.
                        </div>
                        {(() => {
                          const dgroups = buildCorteGroups(drawerEvidences, drawerGradeCategories);
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {dgroups.map((g, gi) => {
                                const corteList = g.aggregates;
                                const evList = g.components;
                                const mainCorte = corteList.find((e) => e.scorePct != null) || corteList[0];
                                const hPct = mainCorte?.scorePct;
                                const hColor = hPct != null ? colorForPct(hPct, thresholds) : "var(--muted)";
                                const label = g.name;
                                const k = g.period ?? (gi + 1);
                                return (
                                  <div key={g.id} style={{
                                    borderRadius: 12,
                                    border: `1.5px solid ${hColor === "var(--muted)" ? "var(--border)" : `${hColor}55`}`,
                                    overflow: "hidden",
                                    background: "var(--card)",
                                  }}>
                                    <div style={{
                                      padding: "10px 14px",
                                      background: hColor === "var(--muted)" ? "var(--bg)" : `${hColor}14`,
                                      borderBottom: `1px solid ${hColor === "var(--muted)" ? "var(--border)" : `${hColor}33`}`,
                                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                                    }}>
                                      <div style={{
                                        width: 30, height: 30, borderRadius: 8,
                                        background: hColor === "var(--muted)" ? "var(--bg)" : hColor,
                                        color: hColor === "var(--muted)" ? "var(--muted)" : "var(--on-status)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 12, fontWeight: 900,
                                      }}>{k === 99 ? "?" : k}</div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                                          {mainCorte?.name || label}
                                        </div>
                                      </div>
                                      {hPct != null && (
                                        <div style={{ textAlign: "right" }}>
                                          <div style={{ fontSize: 8, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Acum.</div>
                                          <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-mono)", color: hColor, lineHeight: 1 }}>
                                            {(hPct / 10).toFixed(1)}<span style={{ fontSize: 10, color: "var(--muted)" }}>/10</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ padding: "10px 14px" }}>
                                      {corteList.length > 1 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                                          {corteList.filter(c => c !== mainCorte).map((c, idx) => {
                                            const col = c.scorePct != null ? colorForPct(c.scorePct, thresholds) : "var(--muted)";
                                            return (
                                              <span key={`tc-${idx}`} style={{
                                                fontSize: 10, fontWeight: 700,
                                                padding: "3px 8px", borderRadius: 7,
                                                background: `${col}15`, border: `1px solid ${col}44`, color: col,
                                              }}>
                                                {c.name}: <strong style={{ fontFamily: "var(--font-mono)" }}>{c.scorePct != null ? (c.scorePct / 10).toFixed(1) : "—"}</strong>
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {evList.length > 0 && (
                                        <div>
                                          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>
                                            Evidencias ({evList.length})
                                          </div>
                                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            {evList.map((e, idx) => {
                                              const col = e.scorePct != null ? colorForPct(e.scorePct, thresholds) : "var(--muted)";
                                              const isG = e.scorePct != null;
                                              return (
                                                <div key={`tev-${idx}`} style={{
                                                  display: "flex", alignItems: "center", gap: 8,
                                                  padding: "5px 10px", borderRadius: 6,
                                                  background: "var(--bg)", border: "1px solid var(--border)",
                                                  fontSize: 11,
                                                }}>
                                                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: col }} />
                                                  <span style={{ flex: 1, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {e.name || `Ítem ${e.gradeObjectId}`}
                                                  </span>
                                                  {e.categoryName && (
                                                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 8, background: "var(--brand-light)", color: "var(--brand)", fontWeight: 700 }}>
                                                      {e.categoryName}
                                                    </span>
                                                  )}
                                                  {e.weightPct > 0 && (
                                                    <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{Number(e.weightPct).toFixed(0)}%</span>
                                                  )}
                                                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 12, color: col, minWidth: 28, textAlign: "right" }}>
                                                    {isG ? (e.scorePct / 10).toFixed(1) : "—"}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {mainCorte?.formula && (
                                        <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 7, background: "rgba(99, 102, 241, 0.08)", border: "1px dashed rgba(99, 102, 241, 0.35)", fontSize: 10 }}>
                                          <div style={{ fontWeight: 800, color: "var(--accent-fg)", marginBottom: 2 }}>🧮 Fórmula</div>
                                          <div style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", wordBreak: "break-word" }}>{mainCorte.formula}</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </Card>
                    )}

                    {/* Vencidas */}
                    {drawerOverdue.length > 0 && (
                      <Card title={`⚠️ Entregas Vencidas (${drawerOverdue.length})`} accent="critical">
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {drawerOverdue.map((e, i) => (
                            <div key={`d-overdue-${i}`} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "10px 12px", borderRadius: 10,
                              border: "1px solid var(--critical-border)",
                              background: "var(--critical-bg)", gap: 10,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                                  {e.name || `Ítem ${e.gradeObjectId}`}
                                </div>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 11, color: "var(--critical)", fontWeight: 700 }}>🗓 Venció: {fmtDue(e.dueDate)}</span>
                                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Peso: {fmtPct(e.weightPct)}</span>
                                </div>
                              </div>
                              <span className="badge" style={{ background: "var(--critical)", color: "var(--on-status)", border: "none", padding: "4px 10px", fontSize: 10, fontWeight: 800 }}>VENCIDA</span>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    <EvidencesTimeline evidences={drawerNonCorte} thresholds={thresholds} />
                    <Card title="Detalle de evidencias">
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid var(--border)" }}>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left" }}>Evidencia</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left" }}>RAs</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Peso</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Nota</th>
                              <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drawerNonCorte.map((e, i) => {
                              const evRas = raCodesFor(e);
                              return (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                                  {e.name || `Ítem ${e.gradeObjectId}`}
                                  {e.dueDate && (
                                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                                      🗓 {fmtDue(e.dueDate)}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: "8px 10px" }}>
                                  {evRas.length > 0 ? (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {evRas.map((code) => {
                                        const info = outcomesMap?.[code];
                                        return (
                                          <span
                                            key={code}
                                            className="tag"
                                            title={info?.title || info?.description || code}
                                            style={{ fontSize: 10, padding: "2px 6px" }}
                                          >
                                            {code}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: 10, color: "var(--muted)" }}>—</span>
                                  )}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                                  {fmtPct(e.weightPct)}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 900, color: colorForPct(e.scorePct, thresholds) }}>
                                  {e.scorePct != null ? (Number(e.scorePct) / 10).toFixed(1) : "—"}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                  <StatusBadge status={e.status || "pending"} />
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                    <NoRaMappingNotice evidences={drawerNonCorte} units={drawerUnits} />
                  </>
                );
              })() : (
                <div className="empty-state">
                  <span className="empty-state-icon">📭</span>
                  <span>Sin evidencias calificadas disponibles</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Las actividades del curso aún no tienen calificación registrada.
                  </span>
                </div>
              )}
            </div>
          )}

          {drawerTab === "unidades" && (
            <Card title="Subcompetencias / Unidades">
              {drawerUnits.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {drawerUnits.map((u) => (
                    <div key={u.code} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="tag">{u.code}</span>
                        <StatusBadge status={u.status} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 900, color: colorForPct(u.pct, thresholds) }}>
                          {fmtPct(u.pct)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{(u.evidence || []).length} evidencias</div>
                      </div>
                      <ProgressBar value={u.pct} color={colorForPct(u.pct, thresholds)} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-state-icon">🎯</span>
                  <span>Sin unidades consolidadas</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Posible falta de rúbricas evaluadas o mapeadas.
                  </span>
                </div>
              )}
            </Card>
          )}

          {drawerTab === "prescripcion" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "var(--watch-bg)", border: "1px solid var(--watch-border)", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--watch-fg)" }}>
                ⚠️ Este estudiante requiere intervención prioritaria.
              </div>
              {drawerPrescription.map((p) => (
                <Card key={p.routeId} title={p.title} right={<span className="tag">{p.routeId}</span>}>
                  {p.successCriteria && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
                      🎯 {p.successCriteria}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(p.actions || []).map((a, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span
                          style={{
                            background: COLORS.brand,
                            color: "var(--on-brand)",
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 900,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a}</span>
                      </div>
                    ))}
                  </div>
                  {p.priority?.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {p.priority.map((pr) => (
                        <span key={pr} className="tag" style={{ background: "var(--critical-bg)", color: "var(--critical-fg)" }}>
                          {pr}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {drawerTab === "calidad" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 12px", background: "var(--bg)", borderRadius: 8 }}>
                Flags generados por el motor de calidad del gemelo. Indican posibles inconsistencias en rúbricas, criterios no mapeados, o datos ausentes.
              </div>
              <QualityFlagsBlock flags={drawerQcFlags} />
            </div>
          )}

          {drawerTab === "historial" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card title={`Historial de interacciones (${studentChatHook.entries.length})`}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                  💬 Registra tus interacciones con este estudiante: reuniones, emails, acciones tomadas. Se guarda localmente en tu navegador.
                </div>

                {/* Entry form */}
                <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    {[
                      { id: "meeting", label: "Reunión", icon: "🤝" },
                      { id: "email", label: "Email", icon: "✉" },
                      { id: "note", label: "Nota", icon: "📝" },
                      { id: "action", label: "Acción", icon: "✅" },
                    ].map(t => (
                      <button
                        key={t.id}
                        className={`chip ${chatInputType === t.id ? "active" : ""}`}
                        onClick={() => setChatInputType(t.id)}
                        style={{ fontSize: 11 }}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={chatInputText}
                    onChange={(e) => setChatInputText(e.target.value)}
                    placeholder={`Describe la ${chatInputType}...`}
                    aria-label="Describir interacción"
                    style={{
                      width: "100%", minHeight: 60, padding: 10,
                      borderRadius: 8, border: "1px solid var(--border)",
                      background: "var(--card)", color: "var(--text)",
                      fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.4,
                      outline: "none", resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (chatInputText.trim()) {
                          studentChatHook.addEntry(chatInputType, chatInputText);
                          setChatInputText("");
                        }
                      }}
                      disabled={!chatInputText.trim()}
                      style={{ fontSize: 12, padding: "6px 14px" }}
                    >
                      Registrar
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                {studentChatHook.entries.length === 0 ? (
                  <div className="empty-state" style={{ minHeight: 100 }}>
                    <span className="empty-state-icon">💬</span>
                    <span>Sin interacciones registradas</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {studentChatHook.entries.map((entry) => {
                      const typeMeta = {
                        meeting: { icon: "🤝", color: "var(--brand)", label: "Reunión" },
                        email: { icon: "✉", color: "var(--watch)", label: "Email" },
                        note: { icon: "📝", color: "var(--muted)", label: "Nota" },
                        action: { icon: "✅", color: "var(--ok)", label: "Acción" },
                      }[entry.type] || { icon: "▸", color: "var(--muted)", label: entry.type };
                      return (
                        <div key={entry.id} style={{
                          display: "flex", gap: 10,
                          padding: "10px 12px", borderRadius: 10,
                          border: `1px solid var(--border)`,
                          background: "var(--card)",
                          borderLeft: `3px solid ${typeMeta.color}`,
                        }}>
                          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{typeMeta.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: typeMeta.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                {typeMeta.label}
                              </span>
                              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                                {new Date(entry.date).toLocaleString("es-CO", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                              {entry.text}
                            </div>
                          </div>
                          <button
                            onClick={() => studentChatHook.deleteEntry(entry.id)}
                            aria-label="Eliminar entrada"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14, padding: "0 4px", alignSelf: "flex-start" }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {drawerTab === "notas" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card title="Mis notas privadas" right={
                studentNotesHook.lastUpdated ? (
                  <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>
                    Guardado: {new Date(studentNotesHook.lastUpdated).toLocaleString("es-CO")}
                  </span>
                ) : null
              }>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "8px 12px", background: "var(--bg)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                  🔒 Estas notas son <strong>privadas y locales</strong> a tu navegador. No se comparten con el estudiante ni con otros docentes. Útil para registrar observaciones, acuerdos, recordatorios.
                </div>
                <textarea
                  value={studentNotesHook.notes}
                  onChange={(e) => studentNotesHook.setNotes(e.target.value)}
                  placeholder="Escribe aquí tus observaciones sobre este estudiante…"
                  aria-label="Notas privadas del estudiante"
                  style={{
                    width: "100%", minHeight: 200, padding: 12,
                    borderRadius: 10, border: "1px solid var(--border)",
                    background: "var(--bg)", color: "var(--text)",
                    fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.5,
                    outline: "none", resize: "vertical",
                  }}
                />
                {studentNotesHook.notes && (
                  <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        if (window.confirm("¿Borrar estas notas definitivamente?")) {
                          studentNotesHook.clearNotes();
                        }
                      }}
                      className="btn"
                      style={{ fontSize: 11, padding: "5px 10px", color: "var(--critical)", borderColor: "var(--critical-border)" }}
                    >
                      🗑 Borrar notas
                    </button>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}
