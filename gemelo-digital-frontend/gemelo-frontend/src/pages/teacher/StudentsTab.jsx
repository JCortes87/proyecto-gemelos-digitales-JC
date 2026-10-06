import React from "react";
import { COLORS, colorForPct } from "../../utils/colors";
import { STUDENT_CSV_COLUMNS, downloadCsv, exportCourseReport, exportStudentsCsv } from "../../utils/export";
import StudentAvatar from "../../components/ui/StudentAvatar";
import { computeRiskFromPct, fmtGrade10FromPct, fmtPct } from "../../utils/helpers";
import { Card, ProgressBar, SortTh, StatusBadge } from "./primitives";
import { StudentCard } from "./panels";
import { fmtLastAccess } from "./utils";

// Pestaña "Estudiantes" del tablero docente (tabla, filtros, agrupación por
// riesgo y exportaciones). Extraída de TeacherDashboard.jsx sin cambios de
// comportamiento: el estado y los manejadores siguen viviendo en el padre.
export function StudentsTab({
  advancedQuery,
  authUser,
  clearSelection,
  collapsedGroups,
  compactRouteCol,
  courseInfo,
  csvColumns,
  csvOpen,
  filteredStudents,
  groupByRisk,
  hideCriticalMacroCol,
  hideGlobalProgressCol,
  isMobile,
  lastAccessMap,
  makeSort,
  onlyRisk,
  orgUnitId,
  overview,
  query,
  quickFilter,
  selectedStudentIds,
  setAdvancedQuery,
  setCsvColumns,
  setCsvOpen,
  setGroupByRisk,
  setOnlyRisk,
  setQuery,
  setQuickFilter,
  setSelectedStudent,
  setSelectedStudentIds,
  setVoiceFeedback,
  sortedStudents,
  studentRows,
  studentsList,
  studentsRef,
  thresholds,
  toggleGroupCollapsed,
  toggleStudentSelection,
  toggleVoice,
  useCards,
  voiceFeedback,
  voiceListening,
  voiceSupported,
  weakestMacro,
}) {
  return (
    <div className="fade-up tab-enter">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          Visor de desempeño estudiantil · Estudiantes
        </div>
        <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
          Listado de estudiantes
        </h1>
        <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
          {courseInfo?.Name || `Curso ${orgUnitId}`}
        </div>
      </div>
    <div ref={studentsRef}>
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Estudiantes</span>
            <span className="tag">{studentsList?.students?.count ?? studentRows.length ?? 0}</span>
            {studentRows.some((s) => s.isLoading) && (
              <span
                className="pulse-dot"
                style={{ background: COLORS.brand, width: 8, height: 8 }}
                title="Cargando datos..."
              />
            )}
          </div>
        }
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className="btn"
                  onClick={() => {
                    const activeFilters = [];
                    if (onlyRisk) activeFilters.push("solo-riesgo");
                    if (quickFilter) activeFilters.push(quickFilter);
                    if (advancedQuery?.mode) activeFilters.push(advancedQuery.mode);
                    if (query.trim()) activeFilters.push("buscar");
                    const filterDescription = activeFilters.join("-");
                    exportStudentsCsv(filteredStudents, courseInfo, {
                      columns: csvColumns,
                      filterDescription,
                    });
                  }}
                  title={`Exportar ${filteredStudents.length} estudiantes (filtro activo) a CSV`}
                  aria-label="Exportar estudiantes a CSV"
                  style={{ fontSize: 11, padding: "6px 10px" }}
                >
                  📥 CSV ({filteredStudents.length})
                </button>
                <button
                  className="btn"
                  onClick={() => setCsvOpen((o) => !o)}
                  aria-label="Configurar columnas del CSV"
                  aria-expanded={csvOpen}
                  title="Elegir columnas a exportar"
                  style={{ fontSize: 11, padding: "6px 8px" }}
                >
                  ▾
                </button>
              </div>
              {csvOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute", top: "calc(100% + 4px)", right: 0,
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "var(--shadow)",
                    padding: 10, minWidth: 200, zIndex: 50,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                    Columnas a exportar
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                    {STUDENT_CSV_COLUMNS.map((col) => {
                      const checked = csvColumns.includes(col.key);
                      return (
                        <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "2px 0" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCsvColumns((prev) =>
                                e.target.checked
                                  ? STUDENT_CSV_COLUMNS.map((c) => c.key).filter((k) => prev.includes(k) || k === col.key)
                                  : prev.filter((k) => k !== col.key)
                              );
                            }}
                          />
                          {col.label}
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    <button
                      className="btn"
                      onClick={() => setCsvColumns(STUDENT_CSV_COLUMNS.map((c) => c.key))}
                      style={{ fontSize: 10, padding: "4px 8px", flex: 1 }}
                    >
                      Todas
                    </button>
                    <button
                      className="btn"
                      onClick={() => setCsvOpen(false)}
                      style={{ fontSize: 10, padding: "4px 8px", flex: 1 }}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="btn"
              onClick={() => exportCourseReport(studentRows, courseInfo, overview)}
              title="Generar reporte imprimible (PDF via Print)"
              aria-label="Generar reporte imprimible"
              style={{ fontSize: 11, padding: "6px 10px" }}
            >
              🖨 Reporte
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
              Solo en riesgo
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar estudiante por ID o nombre"
                placeholder={voiceListening ? "🎙️ Escuchando…" : "Buscar por ID o nombre…"}
                type="text"
                style={{
                  width: isMobile ? 160 : 200,
                  border: `1px solid ${voiceListening ? "var(--critical)" : "var(--border)"}`,
                  borderRadius: 10,
                  padding: "7px 10px",
                  fontWeight: 600,
                  background: voiceListening ? "var(--critical-bg)" : "var(--card)",
                  color: "var(--text)",
                  fontSize: 12,
                  transition: "border-color 0.2s, background 0.2s",
                }}
              />
              {voiceSupported && (
                <button
                  className={`voice-btn${voiceListening ? " listening" : ""}`}
                  type="button"
                  onClick={toggleVoice}
                  title={voiceListening ? "Detener escucha" : "Buscar por voz"}
                  aria-label={voiceListening ? "Detener búsqueda por voz" : "Buscar por voz"}
                  aria-pressed={voiceListening}
                >
                  {voiceListening ? "⏹" : "🎙️"}
                </button>
              )}
            </div>
          </div>
        }
      >
        {/* Voice feedback banner */}
        {voiceFeedback && (
          <div style={{
            marginBottom: 12, padding: "10px 14px", borderRadius: 10,
            border: `1px solid ${voiceListening ? "var(--critical)" : "var(--brand)"}`,
            background: voiceListening ? "var(--critical-bg)" : "var(--brand-light)",
            color: voiceListening ? "var(--critical)" : "var(--brand)",
            fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>{voiceListening ? "🎙️" : "🔍"}</span>
            <span style={{ flex: 1 }}>{voiceFeedback}</span>
            <button
              type="button"
              className="btn"
              aria-label="Limpiar búsqueda por voz"
              style={{ padding: "3px 8px", fontSize: 11 }}
              onClick={() => { setVoiceFeedback(""); setAdvancedQuery({ mode: "text", target: null }); setOnlyRisk(false); setQuery(""); }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Quick filter chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[
            { id: null, label: "Todos", icon: "📋" },
            { id: "risk_high", label: "Riesgo alto", icon: "🔴" },
            { id: "risk_medium", label: "Riesgo medio", icon: "🟡" },
            { id: "overdue", label: "Vencidos", icon: "⚠️" },
            { id: "pending_grade", label: "Pendientes calificación", icon: "⏳" },
            { id: "no_coverage", label: "Cobertura < 40%", icon: "📉" },
            { id: "approved", label: "Aprobados", icon: "✅" },
            { id: "no_grade", label: "Sin nota", icon: "❓" },
          ].map(f => {
            const active = quickFilter === f.id;
            return (
              <button
                key={f.id || "all"}
                className={`chip ${active ? "active" : ""}`}
                onClick={() => setQuickFilter(f.id)}
                aria-pressed={active}
                style={{ fontSize: 11 }}
              >
                {f.icon} {f.label}
              </button>
            );
          })}
          <button
            className="chip"
            onClick={() => setGroupByRisk(v => !v)}
            aria-pressed={groupByRisk}
            title="Agrupar la tabla por nivel de riesgo"
            style={{ fontSize: 11, marginLeft: "auto", borderColor: groupByRisk ? "var(--brand)" : undefined, color: groupByRisk ? "var(--brand)" : undefined }}
          >
            📑 {groupByRisk ? "Agrupado" : "Agrupar por riesgo"}
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedStudentIds.size > 0 && (
          <div style={{
            marginBottom: 10, padding: "10px 14px",
            borderRadius: 10, border: "1px solid var(--brand)",
            background: "var(--brand-light)",
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--brand)" }}>
              {selectedStudentIds.size} estudiante{selectedStudentIds.size !== 1 ? "s" : ""} seleccionado{selectedStudentIds.size !== 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() => {
                  // Compose mailto with all selected student emails
                  const selected = studentRows.filter(s => selectedStudentIds.has(s.userId));
                  const withEmail = selected.filter(s => s.email);
                  const skipped = selected.length - withEmail.length;

                  if (withEmail.length === 0) {
                    alert(
                      `Ninguno de los ${selected.length} estudiantes seleccionados tiene email disponible.\n\n` +
                      `El email se obtiene del classlist de Brightspace. Si el campo no aparece, ` +
                      `puede deberse a permisos de privacidad del curso o a que los estudiantes no tienen email registrado.`
                    );
                    return;
                  }

                  if (skipped > 0) {
                    const proceed = window.confirm(
                      `${withEmail.length} de ${selected.length} estudiantes tienen email.\n` +
                      `${skipped} serán omitidos.\n\n¿Continuar con los disponibles?`
                    );
                    if (!proceed) return;
                  }

                  const emails = withEmail.map(s => s.email).join(",");
                  const subject = encodeURIComponent("Sobre el curso: " + (courseInfo?.Name || ""));
                  const body = encodeURIComponent(
                    `Hola,\n\n[escribe tu mensaje aquí]\n\nSaludos,\n${authUser?.user_name || "Docente"}`
                  );
                  // Use BCC to protect privacy; mailto: limit varies by client (~2000 chars usually)
                  window.location.href = `mailto:?bcc=${encodeURIComponent(emails)}&subject=${subject}&body=${body}`;
                }}
                style={{ fontSize: 11, padding: "5px 10px" }}
              >
                ✉ Email a todos
              </button>
              <button
                className="btn"
                onClick={() => {
                  // Export selected students to CSV (vía downloadCsv: escapa y
                  // neutraliza fórmulas en nombres/emails de Brightspace)
                  const selected = studentRows.filter(s => selectedStudentIds.has(s.userId));
                  downloadCsv(
                    `estudiantes_${orgUnitId}_${Date.now()}.csv`,
                    ["ID", "Nombre", "Email", "Nota", "Cobertura", "Riesgo"],
                    selected.map(s => [
                      s.userId,
                      s.displayName || "",
                      s.email || "",
                      s.currentPerformancePct != null ? (s.currentPerformancePct / 10).toFixed(1) : "",
                      s.coveragePct != null ? s.coveragePct.toFixed(1) + "%" : "",
                      s.risk || "",
                    ]),
                  );
                }}
                style={{ fontSize: 11, padding: "5px 10px" }}
              >
                📥 Exportar CSV
              </button>
              <button
                className="btn"
                onClick={clearSelection}
                style={{ fontSize: 11, padding: "5px 10px" }}
              >
                ✕ Limpiar
              </button>
            </div>
          </div>
        )}

        {/* Voice hint */}
        {voiceSupported && !voiceFeedback && (
          <div className="voice-hint" style={{ marginBottom: 10 }}>
            <span>🎙️</span>
            Prueba: <em>"resultado más bajo"</em> · <em>"resultados de aprendizaje"</em> · <em>"estudiantes en riesgo"</em>
          </div>
        )}

        {useCards ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedStudents.map((s) => (
              <StudentCard key={s.userId} s={s} onOpen={setSelectedStudent} weakestMacro={weakestMacro} />
            ))}
            {!sortedStudents.length && (
              <div className="empty-state">
                <span className="empty-state-icon">🔍</span>
                <span>Sin resultados para el filtro</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 10px", width: 28 }}>
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los estudiantes visibles"
                      checked={sortedStudents.length > 0 && sortedStudents.every(s => selectedStudentIds.has(s.userId))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudentIds(new Set(sortedStudents.map(s => s.userId)));
                        } else {
                          clearSelection();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <SortTh label="ID" {...makeSort("userId")} />
                  <SortTh label="Nombre" {...makeSort("name")} />
                  <SortTh label="Riesgo" {...makeSort("risk")} />
                  <th
                    style={{
                      padding: "10px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--muted)",
                    }}
                  >
                    Ruta
                  </th>
                  {!hideCriticalMacroCol && (
                    <th
                      style={{
                        padding: "10px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--muted)",
                      }}
                    >
                      RA crítico
                    </th>
                  )}
                  {!hideGlobalProgressCol && (
                    <th
                      style={{
                        padding: "10px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--muted)",
                      }}
                    >
                      Global
                    </th>
                  )}
                  <SortTh label="Nota" {...makeSort("grade10")} />
                  <SortTh label="Cobertura" {...makeSort("coverage")} title="% del curso con evidencias calificadas" />
                  <th
                    title="Último acceso del estudiante al curso en Brightspace"
                    style={{ padding: "10px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left", whiteSpace: "nowrap" }}
                  >
                    Último acceso
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const renderStudentRow = (s) => (
                    <tr
                      key={s.userId}
                      onClick={() => setSelectedStudent(s)}
                      className="tr-hover"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: selectedStudentIds.has(s.userId) ? "var(--brand-light)" : undefined,
                      }}
                    >
                      <td style={{ padding: "10px 10px", width: 28 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${s.displayName}`}
                          checked={selectedStudentIds.has(s.userId)}
                          onChange={() => toggleStudentSelection(s.userId)}
                        />
                      </td>
                      <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {s.userId}
                      </td>
                      <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--text)", minWidth: 180 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <StudentAvatar userId={s.userId} name={s.displayName} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                              {/* Botón accesible: la fila entera es clicable con el mouse; con
                                  teclado se abre el detalle desde aquí (el clic burbujea al <tr>). */}
                              <button
                                type="button"
                                aria-label={`Ver detalle de ${s.displayName}`}
                                style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              >
                                {s.displayName}
                              </button>
                              {s.hasPrescription && (
                                <span title="Tiene prescripción activa" style={{ fontSize: 14 }}>📋</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px" }}>
                        <StatusBadge status={s.isLoading ? "cargando" : s.risk} />
                      </td>
                      <td style={{ padding: "10px 10px", maxWidth: compactRouteCol ? 200 : 320, minWidth: 160 }}>
                        {s.route ? (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)" }}>
                              {s.route.title}
                            </div>
                            <div
                              style={{
                                fontSize: 11, color: "var(--muted)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                maxWidth: compactRouteCol ? 180 : 300,
                              }}
                              title={s.route.summary}
                            >
                              {s.route.summary}
                            </div>
                          </div>
                        ) : ("—")}
                      </td>
                      {!hideCriticalMacroCol && (
                        <td style={{ padding: "10px 10px", minWidth: 90 }}>
                          {(() => {
                            const ra = s.mostCriticalMacro || weakestMacro;
                            if (!ra) return <span style={{ color: "var(--muted)" }}>—</span>;
                            const isFallback = !s.mostCriticalMacro;
                            return (
                              <div title={isFallback ? "RA del curso (sin datos individuales)" : undefined}>
                                <div style={{
                                  fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800,
                                  color: isFallback ? "var(--muted)" : colorForPct(ra.pct, thresholds),
                                }}>
                                  {ra.code}
                                  {isFallback && <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.6 }}>~</span>}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                  {fmtPct(ra.pct ?? ra.avgPct)}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      {!hideGlobalProgressCol && (
                        <td style={{ padding: "10px 10px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                          {fmtPct(s.globalPct)}
                        </td>
                      )}
                      <td style={{ padding: "10px 10px" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 900, color: colorForPct(s.currentPerformancePct, thresholds) }}>
                          {fmtGrade10FromPct(s.currentPerformancePct)}
                        </div>
                      </td>
                      <td style={{ padding: "10px 10px", minWidth: 110 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "var(--font-mono)" }}>
                          {fmtPct(s.coveragePct)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                          {s.coverageCountText || "—"}
                        </div>
                        {s.coveragePct != null && (
                          <ProgressBar value={s.coveragePct} color={colorForPct(s.coveragePct, thresholds)} animate={false} />
                        )}
                      </td>
                      <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                        {(() => {
                          const iso = lastAccessMap[String(s.userId)];
                          const txt = Object.keys(lastAccessMap).length ? fmtLastAccess(iso) : "—";
                          const days = iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : null;
                          const color = !Object.keys(lastAccessMap).length ? "var(--muted)"
                            : iso == null ? COLORS.critical
                            : days > 14 ? COLORS.watch
                            : "var(--text)";
                          return (
                            <span title={iso ? new Date(iso).toLocaleString("es-CO") : "Sin accesos registrados"} style={{ fontSize: 12, fontWeight: 700, color }}>
                              {txt}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>
                        <button
                          className="btn"
                          style={{ fontSize: 12, padding: "5px 10px" }}
                          onClick={(e) => { e.stopPropagation(); setSelectedStudent(s); }}
                        >
                          Ver →
                        </button>
                      </td>
                    </tr>
                  );

                  if (!sortedStudents.length) {
                    return (
                      <tr>
                        <td colSpan={12} style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                          Sin resultados para el filtro.
                        </td>
                      </tr>
                    );
                  }

                  if (!groupByRisk) {
                    return sortedStudents.map(renderStudentRow);
                  }

                  const groups = { alto: [], medio: [], bajo: [], pending: [] };
                  for (const s of sortedStudents) {
                    const r = computeRiskFromPct(s.currentPerformancePct);
                    if (groups[r]) groups[r].push(s);
                  }
                  const groupMeta = [
                    { key: "alto", label: "Riesgo alto", color: "var(--critical)", bg: "var(--critical-bg)" },
                    { key: "medio", label: "Riesgo medio", color: "var(--watch)", bg: "var(--watch-bg)" },
                    { key: "bajo", label: "Bajo riesgo", color: "var(--ok)", bg: "var(--ok-bg)" },
                    { key: "pending", label: "Sin datos", color: "var(--muted)", bg: "var(--bg)" },
                  ];
                  return groupMeta.map(gm => {
                    if (groups[gm.key].length === 0) return null;
                    const isCollapsed = collapsedGroups.has(gm.key);
                    return (
                      <React.Fragment key={`group-${gm.key}`}>
                        <tr
                          onClick={() => toggleGroupCollapsed(gm.key)}
                          style={{ cursor: "pointer", background: gm.bg, borderBottom: "1px solid var(--border)" }}
                        >
                          <td colSpan={20} style={{ padding: "8px 12px" }}>
                            {/* Botón accesible (el clic burbujea al <tr>) */}
                            <button
                              type="button"
                              aria-expanded={!isCollapsed}
                              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: gm.color, background: "none", border: "none", padding: 0, margin: 0, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
                            >
                              <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: gm.color }} />
                              <span>{gm.label}</span>
                              <span className="tag" style={{ background: "color-mix(in srgb, var(--card) 60%, transparent)", color: gm.color }}>{groups[gm.key].length}</span>
                            </button>
                          </td>
                        </tr>
                        {!isCollapsed && groups[gm.key].map(renderStudentRow)}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
    </div>
  );
}
