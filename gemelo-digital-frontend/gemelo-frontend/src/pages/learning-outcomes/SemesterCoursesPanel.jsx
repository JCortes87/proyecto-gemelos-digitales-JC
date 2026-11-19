import { Download, LayoutGrid, ListChecks, Loader2, Search, Target, TrendingUp, Upload } from "lucide-react";
import { BulkImportPanel, MatcherPanel } from "./panels";
import { STATUS_META, chipStyle, classifyUnit } from "./utils";

// Pestaña "Cursos" — Fase 2: cursos por semestre, estado de RA por oferta,
// emparejador y vinculación masiva. Extraído de LearningOutcomesAdmin.jsx
// sin cambios de comportamiento.
export function SemesterCoursesPanel({
  analysis,
  analyzeProgress,
  analyzeStatuses,
  analyzing,
  bulkIds,
  bulkPanel,
  bulkSel,
  courseLoadingFor,
  courseQuery,
  coursesFiltered,
  exportSelectedCsv,
  fetchLO,
  impCatalog,
  loadCourses,
  matcher,
  openBulkPanel,
  openMatcher,
  runBulkImport,
  runMatcherImport,
  searchSemester,
  semCourses,
  semLoading,
  semQuery,
  semUnits,
  setBulkPanel,
  setBulkPanelQuery,
  setBulkSel,
  setCourseQuery,
  setMatcherQuery,
  setSemQuery,
  setStatusFilter,
  statusCounts,
  statusFilter,
  toggleBulkCourse,
  toggleBulkSet,
  toggleBulkVisible,
  toggleMatcherSet,
}) {
  return (
    <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
          <LayoutGrid size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Cursos por semestre
        </div>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Busca el semestre (ej. 202620), da “Ver cursos” y entra a los RA de cada oferta.</span>
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Nombre o código del semestre (ej: 202620)"
            aria-label="Nombre o código del semestre"
            value={semQuery}
            onChange={e => setSemQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") searchSemester(); }}
            style={{ flex: "1 1 220px", minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
          />
          <button
            onClick={searchSemester}
            disabled={semLoading || !semQuery.trim()}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: semLoading || !semQuery.trim() ? "not-allowed" : "pointer", background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            {semLoading ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
            Buscar semestre
          </button>
        </div>

        {/* Semestres encontrados */}
        {semUnits && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {semUnits.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "6px 2px" }}>No hay semestres que coincidan con “{semQuery.trim()}”.</div>
            )}
            {semUnits.map(u => {
              const kind = classifyUnit(u);
              const isOffering = kind === "offering";
              const isGroup = kind === "group";
              return (
                <div key={u.id} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", opacity: isGroup ? 0.6 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{u.typeName} · #{u.id}{u.code ? ` · ${u.code}` : ""}</div>
                  </div>
                  {isGroup ? (
                    <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "var(--bg)", border: "1px solid var(--border)", padding: "3px 9px", borderRadius: 6 }}>
                      Sección — usa la oferta con el mismo código
                    </span>
                  ) : isOffering ? (
                    <button
                      onClick={() => fetchLO(u.id)}
                      style={{ marginLeft: "auto", flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <ListChecks size={13} strokeWidth={2.4} /> Ver RA
                    </button>
                  ) : (
                    <button
                      onClick={() => loadCourses(u.id)}
                      disabled={courseLoadingFor === u.id}
                      style={{ marginLeft: "auto", flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--brand)", cursor: "pointer", background: "var(--bg)", color: "var(--brand)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      {courseLoadingFor === u.id ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <LayoutGrid size={13} strokeWidth={2.4} />}
                      Ver cursos
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Cursos de la unidad elegida */}
        {semCourses && (
          <div style={{ marginTop: 12, borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={chipStyle}>Unidad #{semCourses.orgUnitId} · {semCourses.count} descendientes</span>
              {Object.entries(semCourses.typeHistogram || {}).map(([k, v]) => (
                <span key={k} style={{ ...chipStyle, fontSize: 11 }}>{k} ({v})</span>
              ))}
              <button
                onClick={analyzeStatuses}
                disabled={analyzing || statusCounts.total === 0}
                title="Consulta los RA de cada oferta y clasifica su estado (sin RA / sin alinear / alineado)"
                style={{
                  marginLeft: "auto", padding: "7px 14px", borderRadius: 999, border: "none",
                  cursor: analyzing || statusCounts.total === 0 ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
                  color: "var(--on-brand)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                  display: "inline-flex", alignItems: "center", gap: 7,
                }}
              >
                {analyzing ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <TrendingUp size={13} strokeWidth={2.4} />}
                {analyzing
                  ? `Analizando… ${analyzeProgress.done}/${analyzeProgress.total}`
                  : statusCounts.analyzed > 0 ? "Reanalizar estado" : "Analizar estado (RA/alineación)"}
              </button>
            </div>

            {/* Filtros por estado (aparecen tras analizar) */}
            {statusCounts.analyzed > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {[
                  { key: "all",        label: "Todas",       count: statusCounts.total },
                  { key: "sinRA",      label: "Sin RA",      count: statusCounts.sinRA },
                  { key: "sinAlinear", label: "Sin alinear", count: statusCounts.sinAlinear },
                  { key: "alineado",   label: "Alineadas",   count: statusCounts.alineado },
                  ...(statusCounts.error > 0 ? [{ key: "error", label: "Error", count: statusCounts.error }] : []),
                ].map(f => {
                  const on = statusFilter === f.key;
                  const meta = STATUS_META[f.key];
                  return (
                    <button
                      key={f.key}
                      onClick={() => setStatusFilter(f.key)}
                      aria-pressed={on}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        fontSize: 11.5, fontWeight: 800, padding: "5px 11px", borderRadius: 999,
                        cursor: "pointer", fontFamily: "var(--font)",
                        border: on ? `1.5px solid ${meta ? meta.color : "var(--brand)"}` : "1.5px solid var(--border)",
                        background: on ? (meta ? meta.bg : "var(--brand-light)") : "var(--card)",
                        color: on ? (meta ? meta.color : "var(--brand)") : "var(--muted)",
                      }}
                    >
                      {f.label}
                      <span style={{ fontSize: 10.5, opacity: 0.85 }}>({f.count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            <input
              type="text"
              placeholder="Filtrar cursos por nombre, código o id…"
              aria-label="Filtrar cursos por nombre, código o id"
              value={courseQuery}
              onChange={e => setCourseQuery(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none" }}
            />

            {/* Barra de selección múltiple: marca varios cursos → import masivo */}
            {coursesFiltered.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <button
                  onClick={toggleBulkVisible}
                  style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "var(--card)", color: "var(--text)", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <ListChecks size={13} strokeWidth={2.4} />
                  {coursesFiltered.every(c => bulkSel[c.id])
                    ? "Desmarcar visibles"
                    : `Marcar visibles (${coursesFiltered.length})`}
                </button>
                {bulkIds.length > 0 && (
                  <>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", border: "1px solid var(--brand)", padding: "4px 10px", borderRadius: 999 }}>
                      {bulkIds.length} curso(s) marcado(s)
                    </span>
                    <button
                      onClick={() => { setBulkSel({}); setBulkPanel(null); }}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--muted)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font)" }}
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={exportSelectedCsv}
                      title="Descargar los cursos marcados en CSV (se abre en Excel)"
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "var(--card)", color: "var(--text)", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Download size={13} strokeWidth={2.4} />
                      Descargar CSV
                    </button>
                    <button
                      onClick={openBulkPanel}
                      title="Importar los mismos conjuntos de RA a todos los cursos marcados"
                      style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, border: bulkPanel ? "1.5px solid var(--brand)" : "none", cursor: "pointer", background: bulkPanel ? "var(--brand-light)" : "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: bulkPanel ? "var(--brand)" : "var(--on-brand)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Upload size={13} strokeWidth={2.4} />
                      {bulkPanel ? "Cerrar panel masivo" : `Importar RA a ${bulkIds.length} curso(s)`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Panel de import masivo (conjuntos sugeridos para los marcados) */}
            {bulkPanel && (
              <BulkImportPanel
                bulk={bulkPanel}
                impCatalog={impCatalog}
                nCourses={bulkIds.length}
                onToggle={toggleBulkSet}
                onQuery={setBulkPanelQuery}
                onRun={runBulkImport}
              />
            )}

            <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {coursesFiltered.map(c => {
                const st = analysis[c.id];
                const meta = st ? STATUS_META[st.status] : null;
                const isEmpty = st?.status === "sinRA";
                const mOpen = matcher && matcher.courseId === c.id;
                return (
                <div key={c.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${mOpen || bulkSel[c.id] ? "var(--brand)" : "var(--border)"}`, borderRadius: 8, overflow: "hidden", background: bulkSel[c.id] ? "var(--brand-light)" : undefined }}>
                 <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px" }}>
                  <input
                    type="checkbox"
                    checked={!!bulkSel[c.id]}
                    onChange={() => toggleBulkCourse(c.id)}
                    title="Marcar para importar RA en lote"
                    aria-label={`Marcar ${c.name || `curso ${c.id}`} para importar RA en lote`}
                    style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.typeName} · #{c.id}{c.code ? ` · ${c.code}` : ""}</div>
                  </div>
                  {meta && (
                    <span
                      title={st.status === "error" ? (st.err || "Error") : (st.status === "sinRA" ? "Sin resultados de aprendizaje" : `${st.raCount} RA definidos`)}
                      style={{
                        flexShrink: 0, fontSize: 10.5, fontWeight: 800,
                        padding: "3px 9px", borderRadius: 999,
                        color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
                      }}
                    >
                      {meta.label}
                    </span>
                  )}
                  {(isEmpty || mOpen) && (
                    <button
                      onClick={() => openMatcher(c)}
                      title="Sugerir e importar el conjunto de RA que corresponde a esta asignatura"
                      style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: mOpen ? "1.5px solid var(--brand)" : "1.5px solid var(--border)", cursor: "pointer", background: mOpen ? "var(--brand-light)" : "var(--bg)", color: mOpen ? "var(--brand)" : "var(--text)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Target size={13} strokeWidth={2.4} /> {mOpen ? "Cerrar" : "Importar RA"}
                    </button>
                  )}
                  <button
                    onClick={() => fetchLO(c.id, c.name)}
                    style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <ListChecks size={13} strokeWidth={2.4} /> Ver RA
                  </button>
                 </div>

                 {mOpen && (
                  <MatcherPanel
                    matcher={matcher}
                    impCatalog={impCatalog}
                    onToggle={toggleMatcherSet}
                    onQuery={setMatcherQuery}
                    onRun={runMatcherImport}
                  />
                 )}
                </div>
                );
              })}
              {coursesFiltered.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "8px 2px", lineHeight: 1.5 }}>
                  {(semCourses.items || []).length > 0 && !courseQuery.trim()
                    ? `Esta unidad (#${semCourses.orgUnitId}) no contiene ofertas de curso, solo secciones/grupos. Si #${semCourses.orgUnitId} ya es una oferta de curso, usa "Consultar RA" con ese ID directamente.`
                    : "Sin ofertas de curso que coincidan."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
