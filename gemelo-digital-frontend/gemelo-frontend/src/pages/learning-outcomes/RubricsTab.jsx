import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, Eye, Loader2, Plus, RotateCcw, Search, Send, Trash2, XCircle } from "lucide-react";
import Dialog from "../../components/ui/Dialog";
import { RUBRIC_LIMITS, useRubricBuilder } from "./useRubricBuilder";

// ────────────────────────────────────────────────────────────────
// Pestaña "Rúbricas (beta)": genera una rúbrica analítica a partir de los RA
// del curso, con un criterio por RA alineado a su resultado de aprendizaje.
// Flujo seguro: vista previa (sin escribir) → confirmación → creación.
// ────────────────────────────────────────────────────────────────

const btnPrimary = {
  padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)",
  fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7,
};
const btnSecondary = {
  padding: "8px 14px", borderRadius: 10, border: "1.5px solid var(--border)", cursor: "pointer",
  background: "var(--card)", color: "var(--text)", fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font)",
  display: "inline-flex", alignItems: "center", gap: 6,
};
const inputStyle = {
  padding: "8px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)",
  color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
};
const stepTitle = { fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" };
const disabledStyle = (disabled) => (disabled ? { opacity: 0.55, cursor: "not-allowed" } : null);

export function BetaBadge() {
  return (
    <span
      aria-label="Función en fase beta"
      title="Función en fase beta"
      style={{
        display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999,
        background: "var(--info-bg)", color: "var(--info-fg)", border: "1px solid currentColor",
        fontSize: 10.5, fontWeight: 900, letterSpacing: 0.6,
      }}
    >
      BETA
    </span>
  );
}

export function RubricsTab({ initialOrgId = "" }) {
  const rb = useRubricBuilder({ initialOrgId });
  const {
    courseId, setCourseId, loadedOrg, outcomes, loading, error, loadOutcomes,
    name, setName, selected, toggleOutcome, selectAll, clearSelection,
    levels, updateLevel, addLevel, removeLevel, resetLevels, publish, setPublish,
    clientError, preview, previewing, runPreview, editCell, cellValue, hasEmptyCell,
    confirmOpen, openConfirm, closeConfirm, creating, createRubric, result, createError,
  } = rb;

  const crits = preview?.rubricInput?.CriteriaGroups?.[0]?.Criteria || [];
  const previewLevels = preview?.levels || [];
  const canPreview = Boolean(loadedOrg) && !clientError && !previewing;
  const canCreate = Boolean(preview) && !hasEmptyCell && !creating;

  return (
    <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} aria-hidden="true" />
          Generador de rúbricas por RA
        </h2>
        <BetaBadge />
      </div>

      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
        <div role="note" style={{
          fontSize: 12, borderRadius: 8, padding: "8px 12px", lineHeight: 1.55, display: "flex", gap: 8,
          color: "var(--warning-fg)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
        }}>
          <AlertTriangle size={15} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>
            <b>Función en beta.</b> Al confirmar se crea una <b>rúbrica real</b> en el curso de Brightspace
            (por defecto como <b>borrador</b>) y se alinea cada criterio a su RA. Revisa siempre la vista previa;
            prueba primero en un curso sandbox.
          </span>
        </div>

        {/* Paso 1: curso */}
        <div style={stepTitle}>1 · Curso</div>
        <form
          onSubmit={(e) => { e.preventDefault(); loadOutcomes(); }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <label htmlFor="rubric-course-id" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>ID del curso (OrgUnitId)</label>
          <input
            id="rubric-course-id"
            inputMode="numeric"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            placeholder="Ej. 45559"
            style={{ ...inputStyle, width: 140 }}
          />
          <button type="submit" disabled={loading} style={{ ...btnSecondary, ...disabledStyle(loading) }}>
            {loading ? <Loader2 size={14} style={{ animation: "rotateGlow 1s linear infinite" }} aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
            Cargar RA
          </button>
          {loadedOrg && !loading && (
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
              Curso {loadedOrg} · {outcomes.length} RA
            </span>
          )}
        </form>

        {error && (
          <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger-fg)", background: "var(--danger-bg)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} strokeWidth={2.4} aria-hidden="true" /> {error}
          </div>
        )}

        {loadedOrg && outcomes.length > 0 && (<>
          {/* Paso 2: RA */}
          <div style={stepTitle}>2 · Resultados de aprendizaje ({selected.length}/{RUBRIC_LIMITS.maxOutcomes})</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={selectAll} style={btnSecondary}>Seleccionar todos</button>
            <button type="button" onClick={clearSelection} style={btnSecondary}>Ninguno</button>
          </div>
          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px", margin: 0, maxHeight: 260, overflowY: "auto" }}>
            <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Resultados de aprendizaje del curso</legend>
            {outcomes.map(o => (
              <label key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", fontSize: 12.5, color: "var(--text)", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOutcome(o.id)} style={{ marginTop: 2 }} />
                <span>
                  {o.code && <b>{o.code}</b>}{o.code ? " · " : ""}{o.title || o.description}
                  {o.setName && <span style={{ color: "var(--muted)", fontSize: 11 }}> — {o.setName}</span>}
                </span>
              </label>
            ))}
          </fieldset>

          {/* Paso 3: configuración */}
          <div style={stepTitle}>3 · Nombre, niveles de desempeño y estado</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <label htmlFor="rubric-name" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Nombre de la rúbrica</label>
            <input id="rubric-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={256} style={{ ...inputStyle, flex: "1 1 260px" }} />
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, marginBottom: 8 }}>
            <caption style={{ textAlign: "left", fontSize: 11.5, color: "var(--muted)", paddingBottom: 4 }}>
              Ordena los niveles del menor al mayor desempeño (entre {RUBRIC_LIMITS.minLevels} y {RUBRIC_LIMITS.maxLevels}).
            </caption>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th scope="col" style={{ padding: "4px 6px" }}>Nivel</th>
                <th scope="col" style={{ padding: "4px 6px" }}>Puntos</th>
                <th scope="col" style={{ padding: "4px 6px" }}><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((lv, i) => (
                <tr key={i}>
                  <td style={{ padding: "3px 6px" }}>
                    <input aria-label={`Nombre del nivel ${i + 1}`} value={lv.name} onChange={(e) => updateLevel(i, { name: e.target.value })} style={{ ...inputStyle, width: 180 }} />
                  </td>
                  <td style={{ padding: "3px 6px" }}>
                    <input aria-label={`Puntos del nivel ${i + 1}`} type="number" min={0} step="any" value={lv.points} onChange={(e) => updateLevel(i, { points: e.target.value })} style={{ ...inputStyle, width: 80 }} />
                  </td>
                  <td style={{ padding: "3px 6px" }}>
                    <button
                      type="button" onClick={() => removeLevel(i)} disabled={levels.length <= RUBRIC_LIMITS.minLevels}
                      aria-label={`Quitar nivel ${lv.name || i + 1}`}
                      style={{ ...btnSecondary, padding: "6px 8px", ...disabledStyle(levels.length <= RUBRIC_LIMITS.minLevels) }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button type="button" onClick={addLevel} disabled={levels.length >= RUBRIC_LIMITS.maxLevels} style={{ ...btnSecondary, ...disabledStyle(levels.length >= RUBRIC_LIMITS.maxLevels) }}>
              <Plus size={13} aria-hidden="true" /> Agregar nivel
            </button>
            <button type="button" onClick={resetLevels} style={btnSecondary}>
              <RotateCcw size={13} aria-hidden="true" /> Niveles por defecto
            </button>
          </div>
          <fieldset style={{ border: "none", padding: 0, margin: "0 0 4px", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: "var(--text)" }}>
            <legend style={{ fontWeight: 700, marginBottom: 4, padding: 0 }}>Estado al crear</legend>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name="rubric-state" checked={!publish} onChange={() => setPublish(false)} />
              Borrador (recomendado: revísala en Brightspace antes de publicar)
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name="rubric-state" checked={publish} onChange={() => setPublish(true)} />
              Publicada
            </label>
          </fieldset>

          {/* Paso 4: vista previa */}
          <div style={stepTitle}>4 · Vista previa (no escribe en Brightspace)</div>
          {clientError && <div style={{ fontSize: 12, color: "var(--warning-fg)", marginBottom: 8 }}>{clientError}</div>}
          <button type="button" onClick={runPreview} disabled={!canPreview} style={{ ...btnSecondary, ...disabledStyle(!canPreview) }}>
            {previewing ? <Loader2 size={14} style={{ animation: "rotateGlow 1s linear infinite" }} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            Vista previa
          </button>

          {preview && (
            <div style={{ marginTop: 12 }}>
              {(preview.warnings || []).map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--warning-fg)", marginBottom: 6 }}>{w}</div>
              ))}
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, minWidth: 560 }}>
                  <caption style={{ textAlign: "left", padding: "8px 10px", fontSize: 12.5, fontWeight: 800, color: "var(--text)" }}>
                    {preview.rubricInput?.Name} · {preview.state === "published" ? "Publicada" : "Borrador"} · puedes editar cada descripción antes de crear
                  </caption>
                  <thead>
                    <tr style={{ background: "var(--bg)" }}>
                      <th scope="col" style={{ textAlign: "left", padding: "8px 10px", borderTop: "1px solid var(--border)", color: "var(--muted)" }}>Criterio (RA)</th>
                      {previewLevels.map((lv, i) => (
                        <th key={i} scope="col" style={{ textAlign: "left", padding: "8px 10px", borderTop: "1px solid var(--border)", color: "var(--text)" }}>
                          {lv.name} <span style={{ color: "var(--muted)", fontWeight: 600 }}>({lv.points} pts)</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.mapping || []).map((m, ci) => (
                      <tr key={m.outcomeId}>
                        <th scope="row" style={{ textAlign: "left", verticalAlign: "top", padding: "8px 10px", borderTop: "1px solid var(--border)", color: "var(--text)", minWidth: 160 }}>
                          {m.criterionName}
                        </th>
                        {(crits[ci]?.Cells || []).map((cell, li) => {
                          const value = cellValue(m.outcomeId, li, cell?.Description?.Content || "");
                          return (
                            <td key={li} style={{ verticalAlign: "top", padding: "6px 8px", borderTop: "1px solid var(--border)" }}>
                              <textarea
                                aria-label={`Descripción: ${m.criterionName} — ${previewLevels[li]?.name || `nivel ${li + 1}`}`}
                                value={value}
                                onChange={(e) => editCell(m.outcomeId, li, e.target.value)}
                                rows={4}
                                maxLength={2000}
                                style={{ ...inputStyle, width: "100%", minWidth: 130, fontSize: 12, resize: "vertical", borderColor: value.trim() ? "var(--border)" : "var(--danger-fg)" }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasEmptyCell && <div style={{ fontSize: 12, color: "var(--danger-fg)", marginTop: 6 }}>Hay descripciones vacías: complétalas antes de crear.</div>}

              <div style={stepTitle}>5 · Crear en Brightspace</div>
              <button type="button" onClick={openConfirm} disabled={!canCreate} style={{ ...btnPrimary, ...disabledStyle(!canCreate) }}>
                <Send size={14} aria-hidden="true" /> Crear en Brightspace
              </button>
            </div>
          )}
        </>)}

        {createError && (
          <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger-fg)", background: "var(--danger-bg)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.55 }}>
            <b>No se pudo crear la rúbrica.</b> {createError.message}
            {createError.reason === "missing_scope" && (
              <div style={{ marginTop: 4 }}>Scopes requeridos: <code>rubrics:objects:write</code>, <code>rubrics:objects:read</code> y <code>outcomes:alignments:manage</code>.</div>
            )}
          </div>
        )}

        {result && <RubricResult result={result} />}
      </div>

      <Dialog open={confirmOpen} onClose={closeConfirm} ariaLabelledBy="rubric-confirm-title" ariaDescribedBy="rubric-confirm-desc" dismissOnBackdrop={!creating} dismissOnEscape={!creating}>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 id="rubric-confirm-title" style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--text)" }}>¿Crear la rúbrica en Brightspace?</h3>
            <BetaBadge />
          </div>
          <div id="rubric-confirm-desc" style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
            Se creará la rúbrica <b>«{preview?.rubricInput?.Name}»</b> en el curso <b>{loadedOrg}</b> como{" "}
            <b>{preview?.state === "published" ? "publicada" : "borrador"}</b>, con {preview?.mapping?.length || 0} criterio(s)
            y {previewLevels.length} nivel(es), y se alineará cada criterio a su RA. Esta acción escribe en Brightspace;
            la rúbrica no se borra automáticamente.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={closeConfirm} disabled={creating} style={{ ...btnSecondary, ...disabledStyle(creating) }}>Cancelar</button>
            <button type="button" onClick={createRubric} disabled={creating} style={{ ...btnPrimary, ...disabledStyle(creating) }}>
              {creating ? <Loader2 size={14} style={{ animation: "rotateGlow 1s linear infinite" }} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              {creating ? "Creando…" : "Sí, crear rúbrica"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function RubricResult({ result }) {
  const criteria = result.criteria || [];
  const ok = !result.partial;
  return (
    <div role="status" style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", background: ok ? "var(--success-bg)" : "var(--warning-bg)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: ok ? "var(--success-fg)" : "var(--warning-fg)", display: "flex", alignItems: "center", gap: 6 }}>
        {ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
        {ok
          ? `Rúbrica creada (id ${result.rubricId}) y ${result.alignedCount}/${result.totalCriteria} criterios alineados.`
          : `Rúbrica creada (id ${result.rubricId}), pero solo ${result.alignedCount}/${result.totalCriteria} criterios quedaron alineados.`}
      </div>
      <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>
        Estado: <b>{result.state === "published" ? "Publicada" : "Borrador"}</b>
      </div>
      <ul style={{ margin: "8px 0", paddingLeft: 0, listStyle: "none", fontSize: 12, color: "var(--text)" }}>
        {criteria.map((c, i) => (
          <li key={c.criterionId || i} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "3px 0" }}>
            {c.aligned
              ? <CheckCircle2 size={14} style={{ color: "var(--success-fg)", flexShrink: 0, marginTop: 1 }} aria-label="Alineado" />
              : <XCircle size={14} style={{ color: "var(--danger-fg)", flexShrink: 0, marginTop: 1 }} aria-label="Sin alinear" />}
            <span>
              {c.criterionName}
              {c.error && <span style={{ color: "var(--danger-fg)" }}> — {c.error}</span>}
            </span>
          </li>
        ))}
      </ul>
      {result.manualAlignment && (
        <p
          role="note"
          style={{
            fontSize: 12, margin: "6px 0", lineHeight: 1.55, padding: "8px 10px", borderRadius: 8,
            color: "var(--warning-fg)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
          }}
        >
          {result.manualAlignment}
        </p>
      )}
      <p style={{ fontSize: 12, color: "var(--text)", margin: "6px 0", lineHeight: 1.55 }}>{result.nextStep}</p>
      {result.brightspaceUrl && (
        <a href={result.brightspaceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--brand)", display: "inline-flex", alignItems: "center", gap: 5 }}>
          Abrir la herramienta Rúbricas del curso <ExternalLink size={13} aria-hidden="true" />
        </a>
      )}
      {result.brightspaceUrlBestEffort && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>El enlace es aproximado; si no abre, entra al curso → Rúbricas.</div>
      )}
    </div>
  );
}
