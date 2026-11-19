import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, RefreshCw, Search, Target } from "lucide-react";
import { RegistryOutcome } from "./panels";
import { chipStyle } from "./utils";

// Pestaña "Catálogo": registro global de conjuntos de RA del tenant, con
// búsqueda y edición de la descripción de cada RA. Extraído de
// LearningOutcomesAdmin.jsx sin cambios de comportamiento.
export function CatalogTab({
  loadRegistry,
  raEdit,
  raEditCancel,
  raEditChange,
  raEditMsg,
  raEditSave,
  raEditStart,
  regExpanded,
  regFiltered,
  regLoading,
  regQuery,
  registry,
  setRegExpanded,
  setRegQuery,
}) {
  return (
    <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", background: "var(--bg)" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
          <Target size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Registro global de RA
        </div>
        {registry && (
          <span style={chipStyle}>{registry.setCount} conjuntos · {registry.outcomeTotal} RA</span>
        )}
        <button
          onClick={loadRegistry}
          disabled={regLoading}
          style={{
            marginLeft: "auto", padding: "8px 16px", borderRadius: 10, border: "none",
            cursor: regLoading ? "not-allowed" : "pointer",
            background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
            color: "var(--on-brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)",
            display: "inline-flex", alignItems: "center", gap: 7,
          }}
        >
          {regLoading ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2.4} />}
          {regLoading ? "Cargando…" : registry ? "Recargar" : "Cargar registro"}
        </button>
      </div>
      {registry && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <input
            type="text"
            placeholder="Buscar por nombre del conjunto, código o descripción…"
            aria-label="Buscar en el registro global de RA"
            value={regQuery}
            onChange={e => setRegQuery(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
          />
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Pencil size={12} strokeWidth={2.4} style={{ color: "var(--brand)" }} />
            Usa el lápiz para editar una descripción. Previsualiza primero; “Guardar” escribe en Brightspace.
          </div>
          {raEditMsg && (
            <div style={{
              marginTop: 8, fontSize: 12, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
              color: raEditMsg.type === "err" ? "var(--danger-fg)" : raEditMsg.type === "ok" ? "var(--success-fg)" : "var(--info-fg)",
              background: raEditMsg.type === "err" ? "var(--danger-bg)" : raEditMsg.type === "ok" ? "var(--success-bg)" : "var(--info-bg)",
              border: `1px solid ${raEditMsg.type === "err" ? "var(--danger-border)" : raEditMsg.type === "ok" ? "var(--success-border)" : "var(--info-border)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
                {raEditMsg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.4} /> : raEditMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} /> : <Search size={14} strokeWidth={2.4} />}
                {raEditMsg.text}
              </div>
              {(raEditMsg.before != null || raEditMsg.after != null) && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--font)" }}>
                  <div><span style={{ fontWeight: 700, color: "var(--muted)" }}>Antes:</span> {String(raEditMsg.before || "(vacío)")}</div>
                  <div><span style={{ fontWeight: 700, color: "var(--muted)" }}>Después:</span> {String(raEditMsg.after || "(vacío)")}</div>
                </div>
              )}
            </div>
          )}
          <div style={{ maxHeight: 460, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {regFiltered.map(s => {
              const open = !!regExpanded[s.setId] || !!regQuery.trim();
              return (
                <div key={s.setId} style={{ flexShrink: 0, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <button
                    onClick={() => setRegExpanded(p => ({ ...p, [s.setId]: !p[s.setId] }))}
                    aria-expanded={open}
                    style={{ width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "var(--card)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font)" }}
                  >
                    {open ? <ChevronUp size={15} strokeWidth={2.4} style={{ color: "var(--muted)", flexShrink: 0 }} /> : <ChevronDown size={15} strokeWidth={2.4} style={{ color: "var(--muted)", flexShrink: 0 }} />}
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)" }}>{s.name || <em style={{ color: "var(--muted)" }}>(sin nombre)</em>}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", flexShrink: 0 }}>{s.outcomeCount} RA · #{s.setId}</span>
                  </button>
                  {open && (
                    <div style={{ padding: "4px 12px 10px", background: "var(--bg)" }}>
                      {(s.outcomes || []).map(o => (
                        <RegistryOutcome
                          key={o.id}
                          o={o}
                          edit={{
                            setId: s.setId,
                            state: raEdit,
                            onStart: raEditStart,
                            onCancel: raEditCancel,
                            onChange: raEditChange,
                            onSave: (out, dryRun) => raEditSave(out, dryRun, s.setId),
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {regFiltered.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "10px 4px" }}>Sin coincidencias.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
