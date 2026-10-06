import { AlertTriangle, BookOpen, CheckCircle2, Download, Loader2, Plus, Search, Upload } from "lucide-react";

// Pestaña "Plantilla": creación masiva de RA desde un CSV (descarga de
// plantilla, carga, validación y ejecución). Extraído de LearningOutcomesAdmin.jsx
// sin cambios de comportamiento.
export function TemplateTab({
  downloadRaTemplate,
  onTplFile,
  runBulkCreate,
  setTplTargets,
  tplErrors,
  tplFileName,
  tplFileRef,
  tplMsg,
  tplRaCount,
  tplResult,
  tplRunning,
  tplSets,
  tplTargets,
}) {
  return (
    <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
          <Upload size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Crear RA masivos desde plantilla (CSV)
        </div>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Redacta los RA en Excel con la plantilla, cárgala aquí y créalos de una sola vez en el curso. Es un <b>merge</b>: nunca borra RA existentes.</span>
      </div>
      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
        {/* Paso 1: plantilla */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>1 · Plantilla — descárgala, complétala en Excel (una fila por RA) y cárgala</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={downloadRaTemplate}
            style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--brand)", cursor: "pointer", background: "var(--bg)", color: "var(--brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <Download size={15} strokeWidth={2.4} /> Descargar plantilla CSV
          </button>
          <input ref={tplFileRef} type="file" aria-label="Archivo de plantilla CSV" accept=".csv,.txt,text/csv" onChange={onTplFile} style={{ display: "none" }} />
          <button
            onClick={() => tplFileRef.current?.click()}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <Upload size={15} strokeWidth={2.4} /> Cargar plantilla…
          </button>
          {tplFileName && (
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
              {tplFileName} · {tplRaCount} RA en {(tplSets || []).length} conjunto(s)
            </span>
          )}
        </div>

        {tplErrors.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11.5, borderRadius: 8, padding: "8px 12px", lineHeight: 1.6, color: "var(--warning-fg)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
            <b>{tplErrors.length} fila(s) descartada(s):</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {tplErrors.slice(0, 8).map((er, i) => <li key={i}>{er}</li>)}
              {tplErrors.length > 8 && <li>… y {tplErrors.length - 8} más.</li>}
            </ul>
          </div>
        )}

        {tplSets && tplSets.length > 0 && (
          <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "var(--card)", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
              Vista previa de la plantilla — revisa códigos y títulos antes de crear
            </div>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {tplSets.map((s, si) => (
                <div key={si} style={{ borderTop: "1px solid var(--border)" }}>
                  <div style={{ padding: "7px 12px", fontSize: 12, fontWeight: 800, color: "var(--text)", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen size={13} strokeWidth={2.4} style={{ color: "var(--brand)", flexShrink: 0 }} />
                    {s.name}
                    <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 700, fontSize: 11 }}>{s.rows.length} RA</span>
                  </div>
                  {s.rows.map((r, ri) => (
                    <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "6px 12px 6px 24px", borderTop: "1px solid var(--border)", fontSize: 12 }}>
                      <span style={{ flexShrink: 0, fontFamily: "var(--font-mono, monospace)", fontWeight: 800, color: "var(--brand)", fontSize: 11.5 }}>{r.code}</span>
                      <span style={{ color: "var(--text)", lineHeight: 1.4 }}>{r.title}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Paso 2: cursos destino (opcional, múltiples) */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>
          2 · Cursos destino <span style={{ fontWeight: 600, textTransform: "none" }}>(opcional — vacío = solo catálogo global)</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {tplTargets.map((t, i) => (
            <div key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <input
                type="text"
                placeholder={i === 0 ? "ID del curso (ej: 6762)" : "ID de otro curso"}
                aria-label={i === 0 ? "ID del curso destino" : `ID del curso destino ${i + 1}`}
                value={t}
                onChange={e => setTplTargets(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ width: 190, maxWidth: "100%", boxSizing: "border-box", padding: "9px 34px 9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
              />
              {tplTargets.length > 1 && (
                <button
                  onClick={() => setTplTargets(prev => prev.filter((_, j) => j !== i))}
                  title="Quitar este curso"
                  aria-label={`Quitar curso destino ${i + 1}`}
                  style={{ position: "absolute", right: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, fontWeight: 800, lineHeight: 1, padding: 4, fontFamily: "var(--font)" }}
                >×</button>
              )}
            </div>
          ))}
          <button
            onClick={() => setTplTargets(prev => [...prev, ""])}
            title="Agregar otro curso destino"
            style={{ padding: "8px 13px", borderRadius: 10, border: "1.5px dashed var(--border)", background: "var(--card)", color: "var(--brand)", fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Plus size={14} strokeWidth={2.6} /> Agregar curso
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
          Los RA se crean en el <b>catálogo global</b> y se vinculan a cada curso indicado. Si no indicas ninguno, se crean solo en el catálogo (se te pedirá confirmación) y podrás importarlos a cursos después.
        </div>

        {/* Paso 3: crear */}
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>
          3 · Crear {tplRaCount > 0 ? `(${tplRaCount} RA listos)` : "— carga la plantilla arriba"}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => runBulkCreate(true)}
            disabled={!!tplRunning || tplRaCount === 0}
            style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--border)", cursor: (tplRunning || tplRaCount === 0) ? "not-allowed" : "pointer", opacity: tplRaCount === 0 ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            {tplRunning === "dry" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
            Previsualizar (dry-run)
          </button>
          <button
            onClick={() => runBulkCreate(false)}
            disabled={!!tplRunning || tplRaCount === 0}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: (tplRunning || tplRaCount === 0) ? "not-allowed" : "pointer", opacity: tplRaCount === 0 ? 0.5 : 1, background: "linear-gradient(135deg, var(--success-fg) 0%, color-mix(in srgb, var(--success-fg) 80%, black) 100%)", color: "var(--on-status)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            {tplRunning === "real" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={15} strokeWidth={2.4} />}
            {(() => {
              const n = tplTargets.filter(t => String(t || "").trim()).length;
              return n === 0 ? "Crear RA (catálogo global)" : n === 1 ? "Crear RA en el curso" : `Crear RA en ${n} cursos`;
            })()}
          </button>
        </div>

        {tplMsg && (
          <div style={{
            marginTop: 10, fontSize: 12, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
            color: tplMsg.type === "err" ? "var(--danger-fg)" : tplMsg.type === "ok" ? "var(--success-fg)" : "var(--info-fg)",
            background: tplMsg.type === "err" ? "var(--danger-bg)" : tplMsg.type === "ok" ? "var(--success-bg)" : "var(--info-bg)",
            border: `1px solid ${tplMsg.type === "err" ? "var(--danger-border)" : tplMsg.type === "ok" ? "var(--success-border)" : "var(--info-border)"}`,
            display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
          }}>
            {tplMsg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : tplMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{tplMsg.text}</span>
          </div>
        )}
        {(tplResult?.results || []).filter(r => r.courseSetsBefore || r.courseSetsAfter).map((r) => (
          <div key={String(r.orgUnitId ?? "org")} style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)" }}>
            <div style={{ fontWeight: 800 }}>Curso {r.orgUnitId}:</div>
            <div><b>Antes:</b> {Array.isArray(r.courseSetsBefore) ? r.courseSetsBefore.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
            {r.courseSetsAfter && (
              <div><b>Después:</b> {Array.isArray(r.courseSetsAfter) ? r.courseSetsAfter.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
