import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Save, Search, Target } from "lucide-react";

// Paneles de la herramienta de RA (extraídos de LearningOutcomesAdmin.jsx sin
// cambios de comportamiento): emparejador por curso, importación masiva y
// fila recursiva del registro global de RA.

// Panel del emparejador (Opción A): sugerencias + búsqueda manual + dry-run/import.
// Reutilizable: se muestra tanto bajo un curso "Sin RA" en la Fase 2 como en la
// vista de detalle "Ver RA" cuando el curso no tiene RA. `matcher` es el estado
// compartido; `onToggle/onQuery/onRun` son los handlers del componente padre.
export function MatcherPanel({ matcher, impCatalog, onToggle, onQuery, onRun }) {
  if (!matcher) return null;
  const mSelIds = Object.keys(matcher.selected).filter(k => matcher.selected[k]);
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {matcher.loading ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>
          <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> Buscando la asignatura que coincide…
        </div>
      ) : (
      <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
          Conjuntos sugeridos {matcher.suggestions.length > 0 ? `(${matcher.suggestions.length})` : ""}
        </div>
        {matcher.suggestions.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            No hubo coincidencia automática con el nombre del curso. Busca abajo la asignatura por nombre o código y márcala.
          </div>
        )}
        {matcher.suggestions.map((s, i) => {
          const on = !!matcher.selected[s.importId];
          const pct = Math.min(100, Math.round((s.score / 1.5) * 100));
          const strong = s.score >= 0.9, mid = s.score >= 0.5;
          const badge = strong ? { t: "coincidencia muy alta", c: "var(--success-fg)" } : mid ? { t: "coincidencia alta", c: "var(--info-fg)" } : { t: "coincidencia parcial", c: "var(--warning-fg)" };
          return (
            <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i === 0 && <span style={{ color: "var(--brand)", fontWeight: 900 }}>★ </span>}{s.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span>{s.outcomeCount ?? "?"} RA</span>
                  <span style={{ color: badge.c, fontWeight: 800 }}>● {badge.t} ({pct}%)</span>
                </div>
              </div>
            </label>
          );
        })}

        <input
          type="text"
          placeholder="¿No es la correcta? Busca otra asignatura por nombre o código…"
          aria-label="Buscar otra asignatura por nombre o código"
          value={matcher.query}
          onChange={e => onQuery(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", outline: "none" }}
        />
        {matcher.query.trim() && (
          <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {(impCatalog?.summary || [])
              .filter(s => {
                const q = matcher.query.trim().toLowerCase();
                return (s.name || "").toLowerCase().includes(q) || (s.importId || "").toLowerCase().includes(q);
              })
              .slice(0, 40)
              .map(s => {
                const on = !!matcher.selected[s.importId];
                return (
                  <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 15, height: 15, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--muted)" }}>{s.outcomeCount ?? "?"} RA</span>
                  </label>
                );
              })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          <button
            onClick={() => onRun(true)}
            disabled={!!matcher.running || mSelIds.length === 0}
            style={{ padding: "7px 13px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: (matcher.running || mSelIds.length === 0) ? "not-allowed" : "pointer", opacity: (mSelIds.length === 0) ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {matcher.running === "dry" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={13} strokeWidth={2.4} />}
            Previsualizar
          </button>
          <button
            onClick={() => onRun(false)}
            disabled={!!matcher.running || mSelIds.length === 0}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: (matcher.running || mSelIds.length === 0) ? "not-allowed" : "pointer", opacity: (mSelIds.length === 0) ? 0.5 : 1, background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {matcher.running === "real" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={13} strokeWidth={2.4} />}
            Importar al curso
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
            {mSelIds.length} conjunto(s) marcado(s)
          </span>
        </div>

        {matcher.msg && (
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.5, padding: "8px 11px", borderRadius: 8,
            background: matcher.msg.type === "ok" ? "var(--success-bg)" : matcher.msg.type === "err" ? "var(--danger-bg)" : "var(--card)",
            color: matcher.msg.type === "ok" ? "var(--success-fg)" : matcher.msg.type === "err" ? "var(--danger-fg)" : "var(--text)",
            border: `1px solid ${matcher.msg.type === "ok" ? "var(--success-border)" : matcher.msg.type === "err" ? "var(--danger-border)" : "var(--border)"}`,
            display: "flex", alignItems: "flex-start", gap: 7,
          }}>
            {matcher.msg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : matcher.msg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{matcher.msg.text}</span>
          </div>
        )}
      </>
      )}
    </div>
  );
}

// Panel de import MASIVO: importa conjuntos del catálogo global a VARIOS cursos
// marcados con checkbox en la lista de la Fase 2 (p. ej. las 8 secciones de
// "Introducción al Derecho"). Las sugerencias se calculan agregando el mejor
// puntaje de cada conjunto frente a TODOS los cursos marcados.
export function BulkImportPanel({ bulk, impCatalog, nCourses, onToggle, onQuery, onRun }) {
  if (!bulk) return null;
  const selIds = Object.keys(bulk.selected).filter(k => bulk.selected[k]);
  return (
    <div style={{ border: "1.5px solid var(--brand)", borderRadius: 10, background: "var(--bg)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
        <Target size={14} strokeWidth={2.6} style={{ color: "var(--brand)", flexShrink: 0 }} />
        Importar RA a {nCourses} curso(s) seleccionados
      </div>
      {bulk.loading ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>
          <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> Buscando conjuntos que coinciden con los cursos marcados…
        </div>
      ) : (
      <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
          Conjuntos sugeridos {bulk.suggestions.length > 0 ? `(${bulk.suggestions.length})` : ""}
        </div>
        {bulk.suggestions.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            No hubo coincidencia automática con los nombres de los cursos. Busca abajo la asignatura por nombre o código y márcala.
          </div>
        )}
        {bulk.suggestions.map((s, i) => {
          const on = !!bulk.selected[s.importId];
          const pct = Math.min(100, Math.round((s.score / 1.5) * 100));
          const strong = s.score >= 0.9, mid = s.score >= 0.5;
          const badge = strong ? { t: "coincidencia muy alta", c: "var(--success-fg)" } : mid ? { t: "coincidencia alta", c: "var(--info-fg)" } : { t: "coincidencia parcial", c: "var(--warning-fg)" };
          return (
            <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i === 0 && <span style={{ color: "var(--brand)", fontWeight: 900 }}>★ </span>}{s.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span>{s.outcomeCount ?? "?"} RA</span>
                  <span style={{ color: badge.c, fontWeight: 800 }}>● {badge.t} ({pct}%)</span>
                </div>
              </div>
            </label>
          );
        })}

        <input
          type="text"
          placeholder="¿No es la correcta? Busca otra asignatura por nombre o código…"
          aria-label="Buscar otra asignatura por nombre o código"
          value={bulk.query}
          onChange={e => onQuery(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", outline: "none" }}
        />
        {bulk.query.trim() && (
          <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {(impCatalog?.summary || [])
              .filter(s => {
                const q = bulk.query.trim().toLowerCase();
                return (s.name || "").toLowerCase().includes(q) || (s.importId || "").toLowerCase().includes(q);
              })
              .slice(0, 40)
              .map(s => {
                const on = !!bulk.selected[s.importId];
                return (
                  <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 15, height: 15, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--muted)" }}>{s.outcomeCount ?? "?"} RA</span>
                  </label>
                );
              })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          <button
            onClick={() => onRun(true)}
            disabled={!!bulk.running || selIds.length === 0}
            style={{ padding: "7px 13px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: (bulk.running || selIds.length === 0) ? "not-allowed" : "pointer", opacity: (selIds.length === 0) ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {bulk.running === "dry" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={13} strokeWidth={2.4} />}
            Previsualizar
          </button>
          <button
            onClick={() => onRun(false)}
            disabled={!!bulk.running || selIds.length === 0}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: (bulk.running || selIds.length === 0) ? "not-allowed" : "pointer", opacity: (selIds.length === 0) ? 0.5 : 1, background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {bulk.running === "real" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={13} strokeWidth={2.4} />}
            Importar a {nCourses} curso(s)
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
            {selIds.length} conjunto(s) marcado(s)
          </span>
          {bulk.running && bulk.progress && (
            <span style={{ fontSize: 11.5, color: "var(--brand)", fontWeight: 800 }}>
              {bulk.progress.done}/{bulk.progress.total} cursos…
            </span>
          )}
        </div>

        {bulk.msg && (
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.5, padding: "8px 11px", borderRadius: 8,
            background: bulk.msg.type === "ok" ? "var(--success-bg)" : bulk.msg.type === "err" ? "var(--danger-bg)" : "var(--card)",
            color: bulk.msg.type === "ok" ? "var(--success-fg)" : bulk.msg.type === "err" ? "var(--danger-fg)" : "var(--text)",
            border: `1px solid ${bulk.msg.type === "ok" ? "var(--success-border)" : bulk.msg.type === "err" ? "var(--danger-border)" : "var(--border)"}`,
            display: "flex", alignItems: "flex-start", gap: 7,
          }}>
            {bulk.msg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : bulk.msg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{bulk.msg.text}</span>
          </div>
        )}

        {Array.isArray(bulk.results) && bulk.results.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {bulk.results.map(r => (
              <div key={r.ou} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.4, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card)" }}>
                {r.ok
                  ? <CheckCircle2 size={13} strokeWidth={2.6} style={{ color: "var(--success-fg)", flexShrink: 0, marginTop: 2 }} />
                  : <AlertTriangle size={13} strokeWidth={2.6} style={{ color: "var(--danger-fg)", flexShrink: 0, marginTop: 2 }} />}
                <span style={{ flex: 1, minWidth: 0, color: "var(--text)", fontWeight: 600 }}>
                  {r.name} <span style={{ color: "var(--muted)", fontWeight: 500 }}>#{r.ou}</span>
                  {r.ok
                    ? (r.after != null ? <span style={{ color: "var(--success-fg)", fontWeight: 700 }}> · {r.after} RA</span> : null)
                    : <span style={{ color: "var(--danger-fg)", fontWeight: 500 }}> · {r.err}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
      )}
    </div>
  );
}

// Fila de un RA dentro del visor de registro global (recursiva por Children).
// `edit` (opcional) habilita la edición de descripciones: { setId, state, onStart,
// onCancel, onChange, onSave } donde state = { id, value, saving, mode }.
export function RegistryOutcome({ o, depth = 0, edit }) {
  const editing = edit && edit.state?.id === o.id;
  return (
    <div style={{ paddingLeft: depth * 14 }}>
      <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5, lineHeight: 1.45, alignItems: "flex-start" }}>
        {o.shortCode ? <span style={{ fontWeight: 800, color: "var(--brand)", flexShrink: 0 }}>{o.shortCode}</span> : null}
        {editing ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              value={edit.state.value}
              onChange={e => edit.onChange(e.target.value)}
              rows={3}
              aria-label="Descripción del RA"
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--brand)", background: "var(--card)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", lineHeight: 1.45, outline: "none", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => edit.onSave(o, true)}
                disabled={!!edit.state.saving}
                title="Previsualiza el cambio SIN escribir en Brightspace"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: edit.state.saving ? "not-allowed" : "pointer", background: "var(--bg)", color: "var(--text)", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)" }}
              >
                {edit.state.saving === "dry" ? <Loader2 size={12} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={12} strokeWidth={2.6} />}
                Previsualizar
              </button>
              <button
                onClick={() => edit.onSave(o, false)}
                disabled={!!edit.state.saving}
                title="Escribe el cambio en Brightspace (scope outcomes:sets:manage)"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, border: "none", cursor: edit.state.saving ? "not-allowed" : "pointer", background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)" }}
              >
                {edit.state.saving === "real" ? <Loader2 size={12} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Save size={12} strokeWidth={2.6} />}
                Guardar
              </button>
              <button
                onClick={edit.onCancel}
                disabled={!!edit.state.saving}
                style={{ padding: "5px 11px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--muted)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font)" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <span style={{ color: "var(--text)", flex: 1, minWidth: 0 }}>
            {o.description || <em style={{ color: "var(--muted)" }}>(sin descripción)</em>}
          </span>
        )}
        {edit && !editing && (
          <button
            onClick={() => edit.onStart(o)}
            title="Editar descripción del RA"
            aria-label="Editar descripción del RA"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--brand)", cursor: "pointer" }}
          >
            <Pencil size={12} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </div>
      {(o.children || []).map(c => <RegistryOutcome key={c.id} o={c} depth={depth + 1} edit={edit} />)}
    </div>
  );
}
