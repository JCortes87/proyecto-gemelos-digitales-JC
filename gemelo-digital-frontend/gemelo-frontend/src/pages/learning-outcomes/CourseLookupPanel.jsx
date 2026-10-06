import { AlertTriangle, BookOpen, CheckCircle2, ListChecks, Loader2, Pencil, Plus, Save, Search, Target, Trash2, TrendingUp, Unlink } from "lucide-react";
import { ACTIVITY_TYPE_LABELS, ALIGN_ACTIVITY_TYPES, chipStyle, raParts } from "./utils";
import { MatcherPanel } from "./panels";

// Pestaña "Cursos" — consulta directa de un curso por ID: RA del curso,
// conjuntos vinculados (desvincular) y edición de alineaciones por actividad.
// Extraído de LearningOutcomesAdmin.jsx sin cambios de comportamiento.
export function CourseLookupPanel({
  activityCount,
  allOutcomes,
  canEdit,
  courseSets,
  courseSetsLoading,
  data,
  deleteMsg,
  deletingSetId,
  editMode,
  fetchLO,
  hasAlignments,
  hasOutcomes,
  impCatalog,
  loadedCourseName,
  loadedOrg,
  loading,
  matcher,
  newId,
  newSel,
  newType,
  openMatcher,
  orgId,
  outcomes,
  rubricCount,
  runMatcherImport,
  saveActivity,
  saveNew,
  savingKey,
  sel,
  setEditMode,
  setMatcherQuery,
  setNewId,
  setNewType,
  setOrgId,
  setWriteMsg,
  toggleMatcherSet,
  toggleNewSel,
  toggleSel,
  unlinkSet,
  writeMsg,
}) {
  return (
    <>
      {/* Consulta directa de un curso por ID */}
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "2px 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <ListChecks size={14} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Consultar un curso por ID
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          type="number"
          placeholder="ID del curso (orgUnitId)"
          aria-label="ID del curso (orgUnitId)"
          value={orgId}
          onChange={e => setOrgId(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") fetchLO(); }}
          style={{ flex: "1 1 160px", minWidth: 0, maxWidth: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
        />
        <button
          onClick={() => fetchLO()}
          disabled={loading || !orgId}
          style={{
            flex: "0 0 auto", padding: "10px 18px", borderRadius: 10, border: "none",
            cursor: loading || !orgId ? "not-allowed" : "pointer",
            background: orgId && !loading ? "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)" : "var(--bg)",
            color: orgId && !loading ? "var(--on-brand)" : "var(--muted)",
            fontSize: 14, fontWeight: 800, fontFamily: "var(--font)",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}
        >
          {loading ? <Loader2 size={16} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={16} strokeWidth={2.4} />}
          {loading ? "Consultando…" : "Consultar RA"}
        </button>
      </div>

      {data && !loading && (
        <div>
          {/* Resumen: chips */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={chipStyle}><ListChecks size={13} strokeWidth={2.4} /> {outcomes.length} RA definidos</span>
            <span style={chipStyle}><TrendingUp size={13} strokeWidth={2.4} /> {rubricCount} rúbricas alineadas</span>
            <span style={chipStyle}><BookOpen size={13} strokeWidth={2.4} /> {activityCount} actividades alineadas</span>
            <span style={{
              ...chipStyle,
              background: hasAlignments ? "var(--success-bg)" : "var(--warning-bg)",
              color: hasAlignments ? "var(--success-fg)" : "var(--warning-fg)",
              borderColor: hasAlignments ? "var(--success-border)" : "var(--warning-border)",
            }}>
              {hasAlignments ? <CheckCircle2 size={13} strokeWidth={2.4} /> : <AlertTriangle size={13} strokeWidth={2.4} />}
              {hasAlignments ? "Alineado" : "Sin alinear"}
            </span>
            {canEdit && (
              <button
                onClick={() => { setEditMode(m => !m); setWriteMsg(null); }}
                style={{
                  ...chipStyle, cursor: "pointer",
                  background: editMode ? "var(--brand)" : "var(--bg)",
                  color: editMode ? "var(--on-brand)" : "var(--brand)",
                  borderColor: "var(--brand)",
                }}
              >
                <Pencil size={13} strokeWidth={2.4} /> {editMode ? "Cerrar edición" : "Editar alineaciones"}
              </button>
            )}
          </div>

          {!hasOutcomes ? (
            <div style={{ background: "var(--bg)", borderRadius: 10, border: "1px dashed var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "18px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                <AlertTriangle size={20} strokeWidth={2} style={{ color: "var(--warning-fg)", marginBottom: 6 }} />
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Este curso (#{loadedOrg}) no tiene resultados de aprendizaje.</div>
                <div style={{ fontSize: 12, marginBottom: 12 }}>Debe importarse o registrarse el conjunto de RA en Brightspace.</div>
                <button
                  onClick={() => openMatcher({ id: loadedOrg, name: loadedCourseName })}
                  title="Sugerir e importar el conjunto de RA que corresponde a esta asignatura"
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: matcher && matcher.courseId === loadedOrg ? "var(--brand-light)" : "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: matcher && matcher.courseId === loadedOrg ? "var(--brand)" : "var(--on-brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7, ...(matcher && matcher.courseId === loadedOrg ? { border: "1.5px solid var(--brand)" } : {}) }}
                >
                  <Target size={15} strokeWidth={2.4} /> {matcher && matcher.courseId === loadedOrg ? "Cerrar" : "Importar RA a este curso"}
                </button>
              </div>
              {matcher && matcher.courseId === loadedOrg && (
                <MatcherPanel
                  matcher={matcher}
                  impCatalog={impCatalog}
                  onToggle={toggleMatcherSet}
                  onQuery={setMatcherQuery}
                  onRun={runMatcherImport}
                />
              )}
            </div>
          ) : editMode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Aviso: esto escribe en Brightspace */}
              <div style={{
                fontSize: 12, color: "var(--watch-fg)", background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)", borderRadius: 10,
                padding: "9px 12px", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
              }}>
                <AlertTriangle size={15} strokeWidth={2.3} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Los cambios se escriben directamente en Brightspace (curso #{loadedOrg}). Guardar reemplaza la lista de RA alineados de esa actividad.</span>
              </div>

              {writeMsg && (
                <div style={{
                  fontSize: 12.5, borderRadius: 8, padding: "8px 12px",
                  display: "flex", alignItems: "center", gap: 6,
                  color: writeMsg.type === "ok" ? "var(--success-fg)" : "var(--danger-fg)",
                  background: writeMsg.type === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
                }}>
                  {writeMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} /> : <AlertTriangle size={14} strokeWidth={2.4} />}
                  {writeMsg.text}
                </div>
              )}

              {/* Actividades ya alineadas: editar (replace) */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Actividades alineadas ({activityCount})
                </div>
                {activityCount === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 12px", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 10 }}>
                    Aún no hay actividades alineadas. Usa el formulario de abajo para crear la primera alineación.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto" }}>
                    {Object.keys(data.activityToOutcomes || {}).map(key => {
                      const idx = key.indexOf(":");
                      const type = key.slice(0, idx);
                      const objectId = key.slice(idx + 1);
                      const chosen = sel[key] || [];
                      const actName = (data.activityNames || {})[key];
                      const typeLabel = ACTIVITY_TYPE_LABELS[type] || type;
                      return (
                        <div key={key} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <span style={{ flex: "0 0 auto", fontSize: 10.5, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{typeLabel}</span>
                              {actName
                                ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actName}</span>
                                : <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>#{objectId}</span>}
                            </span>
                            <button
                              onClick={() => saveActivity(key)}
                              disabled={savingKey === key}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "6px 12px", borderRadius: 8, border: "none",
                                cursor: savingKey === key ? "not-allowed" : "pointer",
                                background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
                                color: "var(--on-brand)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                              }}
                            >
                              {savingKey === key ? <Loader2 size={13} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Save size={13} strokeWidth={2.6} />}
                              {savingKey === key ? "Guardando…" : "Guardar"}
                            </button>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {allOutcomes.map(o => {
                              const on = chosen.includes(o.guid);
                              const p = raParts(o);
                              return (
                                <button
                                  key={o.guid}
                                  onClick={() => toggleSel(key, o.guid)}
                                  aria-pressed={on}
                                  title={p.full}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 5,
                                    fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
                                    cursor: "pointer", fontFamily: "var(--font-mono)",
                                    border: on ? "1.5px solid var(--brand)" : "1.5px solid var(--border)",
                                    background: on ? "var(--brand-light)" : "transparent",
                                    color: on ? "var(--brand)" : "var(--muted)",
                                  }}
                                >
                                  {on ? <CheckCircle2 size={11} strokeWidth={2.6} /> : <span style={{ width: 11 }} />}
                                  {p.code || (p.title.length > 22 ? p.title.slice(0, 22) + "…" : p.title)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Nueva alineación (add) */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Alinear una actividad nueva
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    aria-label="Tipo de actividad"
                    style={{ flex: "1 1 150px", minWidth: 0, maxWidth: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font)" }}
                  >
                    {ALIGN_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="ID de la actividad (objectId)"
                    aria-label="ID de la actividad (objectId)"
                    value={newId}
                    onChange={e => setNewId(e.target.value)}
                    style={{ flex: "1 1 180px", minWidth: 0, maxWidth: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font)", outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {allOutcomes.map(o => {
                    const on = newSel.includes(o.guid);
                    const p = raParts(o);
                    return (
                      <button
                        key={o.guid}
                        onClick={() => toggleNewSel(o.guid)}
                        aria-pressed={on}
                        title={p.full}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
                          cursor: "pointer", fontFamily: "var(--font-mono)",
                          border: on ? "1.5px solid var(--brand)" : "1.5px solid var(--border)",
                          background: on ? "var(--brand-light)" : "transparent",
                          color: on ? "var(--brand)" : "var(--muted)",
                        }}
                      >
                        {on ? <CheckCircle2 size={11} strokeWidth={2.6} /> : <span style={{ width: 11 }} />}
                        {p.code || (p.title.length > 22 ? p.title.slice(0, 22) + "…" : p.title)}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={saveNew}
                  disabled={savingKey === "__new__" || !newId.trim() || newSel.length === 0}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "9px 16px", borderRadius: 10, border: "none",
                    cursor: (savingKey === "__new__" || !newId.trim() || newSel.length === 0) ? "not-allowed" : "pointer",
                    background: (!newId.trim() || newSel.length === 0) ? "var(--bg)" : "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
                    color: (!newId.trim() || newSel.length === 0) ? "var(--muted)" : "var(--on-brand)",
                    fontSize: 13, fontWeight: 800, fontFamily: "var(--font)",
                  }}
                >
                  {savingKey === "__new__" ? <Loader2 size={14} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={14} strokeWidth={2.6} />}
                  {savingKey === "__new__" ? "Alineando…" : "Agregar alineación"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
              {outcomes.map(o => {
                const p = raParts(o);
                return (
                <div key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  {p.code && (
                    <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                      {p.code}
                    </span>
                  )}
                  <span style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.4, fontWeight: 500 }}>
                    {p.title || "(sin título)"}
                  </span>
                </div>
                );
              })}
            </div>
          )}

          {/* Conjuntos de RA vinculados al curso: desvincular / eliminar */}
          {(courseSetsLoading || (Array.isArray(courseSets) && courseSets.length > 0)) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
                <Unlink size={13} strokeWidth={2.4} />
                Conjuntos de RA vinculados a este curso
                {Array.isArray(courseSets) && <span style={{ color: "var(--muted)", fontWeight: 700 }}>({courseSets.length})</span>}
              </div>

              {deleteMsg && (
                <div style={{
                  fontSize: 12.5, borderRadius: 8, padding: "8px 12px", marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 6,
                  color: deleteMsg.type === "ok" ? "var(--success-fg)" : "var(--danger-fg)",
                  background: deleteMsg.type === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
                }}>
                  {deleteMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} /> : <AlertTriangle size={14} strokeWidth={2.4} />}
                  {deleteMsg.text}
                </div>
              )}

              {courseSetsLoading ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 10 }}>
                  <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} />
                  Cargando conjuntos del curso…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {courseSets.map(s => (
                    <div key={String(s.setId)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name || "(sin nombre)"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                          set #{String(s.setId)} · {s.outcomeCount ?? 0} RA
                        </div>
                      </div>
                      <button
                        onClick={() => unlinkSet(s)}
                        disabled={deletingSetId != null}
                        title="Eliminar este conjunto del registro del curso (el catálogo global no se toca)"
                        style={{
                          flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "7px 13px", borderRadius: 9,
                          border: "1.5px solid var(--danger-border)",
                          cursor: deletingSetId != null ? "not-allowed" : "pointer",
                          background: deletingSetId === s.setId ? "var(--danger-bg)" : "transparent",
                          color: "var(--danger-fg)", fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font)",
                        }}
                      >
                        {deletingSetId === s.setId
                          ? <Loader2 size={13} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} />
                          : <Trash2 size={13} strokeWidth={2.6} />}
                        {deletingSetId === s.setId ? "Desvinculando…" : "Desvincular del curso"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                Desvincular elimina el conjunto solo del registro de este curso en Brightspace.
                El catálogo global de la organización no se modifica y el conjunto puede volver a importarse.
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
