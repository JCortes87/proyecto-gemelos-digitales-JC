import { AlertTriangle, BookOpen, CheckCircle2, ListChecks, Loader2, Plus, RefreshCw, Search, Target } from "lucide-react";

// Pestaña "Manual": importa conjuntos del catálogo global a un curso por ID
// (dry-run / real) y sondeo de programas. Extraído de LearningOutcomesAdmin.jsx
// sin cambios de comportamiento.
export function ManualImportTab({
  impCatFiltered,
  impCatQuery,
  impCatalog,
  impCatalogLoading,
  impCourse,
  impCourseLoading,
  impMsg,
  impResult,
  impRunning,
  impSelected,
  impSelectedIds,
  impTarget,
  loadCourseSets,
  loadGlobalCatalog,
  orgId,
  probeData,
  probeProgram,
  probing,
  runImport,
  runProbe,
  setImpCatQuery,
  setImpSelected,
  setImpTarget,
  setOrgId,
  setProbeData,
  setProbeProgram,
  toggleImpSet,
}) {
  return (
    <>
      <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
            <BookOpen size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Importar RA — modo manual (avanzado)
          </div>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Elige a mano cualquier conjunto (o varios) e impórtalo a cualquier curso por ID, incluso si ya tiene RA. Es un <b>merge</b>: nunca borra lo existente.</span>
        </div>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, padding: "8px 11px", background: "var(--brand-light)", borderRadius: 8, borderLeft: "3px solid var(--brand)", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 7 }}>
            <Target size={14} strokeWidth={2.4} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
            <span>¿Solo quieres poblar un curso vacío? Es más rápido con el botón <b>"Importar RA"</b> que aparece en cada curso (pestaña <b>Cursos y alineaciones</b>, filtro "Sin RA") o al abrir <b>"Ver RA"</b>: te sugiere el conjunto de la asignatura automáticamente. Usa este modo manual para casos especiales.</span>
          </div>
          {/* Paso 1: descubrir el catálogo global */}
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>1 · Catálogo global (fuente) — marca el conjunto de la asignatura</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={loadGlobalCatalog}
              disabled={impCatalogLoading}
              style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: impCatalogLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)", color: "var(--on-brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              {impCatalogLoading ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2.4} />}
              {impCatalog ? "Recargar catálogo global" : "Ver catálogo global"}
            </button>
          </div>
          {impCatalog && (
            <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--card)", fontSize: 11.5, color: "var(--muted)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{(impCatalog.summary || []).length} conjunto(s) org-level {impCatalog.ok ? "" : `· export HTTP ${impCatalog.status}`}</span>
                {impSelectedIds.length > 0 && (
                  <span style={{ color: "var(--brand)" }}>· {impSelectedIds.length} seleccionado(s)</span>
                )}
                {impSelectedIds.length > 0 && (
                  <button onClick={() => setImpSelected({})} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "var(--font)", textDecoration: "underline" }}>Limpiar</button>
                )}
              </div>
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
                <input
                  type="text"
                  placeholder="Filtrar conjunto por nombre o ImportId…"
                  aria-label="Filtrar conjunto por nombre o ImportId"
                  value={impCatQuery}
                  onChange={e => setImpCatQuery(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none" }}
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {impCatFiltered.map((s, i) => {
                  const checked = !!impSelected[s.importId];
                  return (
                    <label key={s.importId || i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 12, cursor: s.importId ? "pointer" : "default", background: checked ? "var(--brand-light)" : "transparent" }}>
                      <input type="checkbox" checked={checked} disabled={!s.importId} onChange={() => toggleImpSet(s.importId)} style={{ flexShrink: 0, accentColor: "var(--brand)" }} />
                      <span style={{ fontWeight: 700, color: "var(--text)" }}>{s.name || <em style={{ color: "var(--muted)" }}>(primario / My Learning Outcomes)</em>}</span>
                      <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>{s.outcomeCount} RA</span>
                    </label>
                  );
                })}
                {impCatFiltered.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>
                    {(impCatalog.summary || []).length === 0 ? "Sin conjuntos (revisa el scope outcomes:sets:export)." : "Sin coincidencias con el filtro."}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Paso 2: curso destino */}
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>2 · Curso destino</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="ID del curso (ej: 6762)"
              aria-label="ID del curso destino"
              value={impTarget}
              onChange={e => setImpTarget(e.target.value)}
              style={{ flex: "0 1 180px", minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
            />
            <button
              onClick={loadCourseSets}
              disabled={impCourseLoading}
              style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid var(--brand)", cursor: impCourseLoading ? "not-allowed" : "pointer", background: "var(--bg)", color: "var(--brand)", fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {impCourseLoading ? <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <ListChecks size={14} strokeWidth={2.4} />}
              Ver RA del curso
            </button>
          </div>
          {impCourse && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
              Curso #{impCourse.orgUnitId}: <b style={{ color: impCourse.outcomeTotal === 0 ? "var(--danger-fg)" : "var(--success-fg)" }}>{impCourse.outcomeTotal} RA</b> en {impCourse.setCount} conjunto(s)
              {impCourse.outcomeTotal === 0 ? " — vacío, ideal para importar." : " — ya tiene RA (el import hará merge)."}
            </div>
          )}

          {/* Paso 3: importar */}
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>
            3 · Importar {impSelectedIds.length > 0 ? `(${impSelectedIds.length} conjunto[s] seleccionado[s])` : "— selecciona un conjunto arriba"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => runImport(true)}
              disabled={!!impRunning || impSelectedIds.length === 0}
              style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--border)", cursor: (impRunning || impSelectedIds.length === 0) ? "not-allowed" : "pointer", opacity: impSelectedIds.length === 0 ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              {impRunning === "dry" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
              Previsualizar (dry-run)
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={!!impRunning || impSelectedIds.length === 0}
              style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: (impRunning || impSelectedIds.length === 0) ? "not-allowed" : "pointer", opacity: impSelectedIds.length === 0 ? 0.5 : 1, background: "linear-gradient(135deg, var(--success-fg) 0%, color-mix(in srgb, var(--success-fg) 80%, black) 100%)", color: "var(--on-status)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              {impRunning === "real" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={15} strokeWidth={2.4} />}
              Importar al curso
            </button>
          </div>

          {impMsg && (
            <div style={{
              marginTop: 10, fontSize: 12, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
              color: impMsg.type === "err" ? "var(--danger-fg)" : impMsg.type === "ok" ? "var(--success-fg)" : "var(--info-fg)",
              background: impMsg.type === "err" ? "var(--danger-bg)" : impMsg.type === "ok" ? "var(--success-bg)" : "var(--info-bg)",
              border: `1px solid ${impMsg.type === "err" ? "var(--danger-border)" : impMsg.type === "ok" ? "var(--success-border)" : "var(--info-border)"}`,
              display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
            }}>
              {impMsg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : impMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span>{impMsg.text}</span>
            </div>
          )}
          {impResult && (impResult.courseSetsBefore || impResult.courseSetsAfter) && (
            <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)" }}>
              <div><b>Antes:</b> {Array.isArray(impResult.courseSetsBefore) ? impResult.courseSetsBefore.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
              {impResult.courseSetsAfter && (
                <div><b>Después:</b> {Array.isArray(impResult.courseSetsAfter) ? impResult.courseSetsAfter.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sondeo del registro (diagnóstico, avanzado) */}
      <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
            <Search size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Sondeo del registro (diagnóstico)
          </div>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Prueba varios endpoints del registro global de RA para un ID (curso u organización). Solo lectura.</span>
        </div>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="number"
              placeholder="ID (curso u organización)"
              aria-label="ID (curso u organización)"
              value={orgId}
              onChange={e => setOrgId(e.target.value)}
              style={{ flex: "1 1 180px", minWidth: 0, maxWidth: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
            />
            <input
              type="number"
              placeholder="Programa # (ej: 24, opcional)"
              aria-label="Número de programa (opcional)"
              value={probeProgram}
              onChange={e => setProbeProgram(e.target.value)}
              title="ID del programa que edita la coordinadora en /d2l/le/6606/lo/programs/{ID}"
              style={{ flex: "0 1 190px", minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
            />
            <button
              onClick={runProbe}
              disabled={probing || !orgId}
              style={{
                flex: "0 0 auto", padding: "9px 16px", borderRadius: 10, border: "none",
                cursor: probing || !orgId ? "not-allowed" : "pointer",
                background: orgId && !probing ? "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)" : "var(--bg)",
                color: orgId && !probing ? "var(--on-brand)" : "var(--muted)",
                fontSize: 13, fontWeight: 800, fontFamily: "var(--font)",
                display: "inline-flex", alignItems: "center", gap: 7,
              }}
            >
              {probing ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
              {probing ? "Sondeando…" : "Sondear registro"}
            </button>
          </div>

          {probeData && (
            <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 12, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Sondeo registro · org #{probeData.orgUnitId} · versiones lo={probeData?.versions?.lo} align={probeData?.versions?.align} lp={probeData?.versions?.lp}</span>
                <button onClick={() => setProbeData(null)} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cerrar</button>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {(probeData.results || []).map((r, i) => {
                  const ok = r.status === 200;
                  return (
                    <div key={i} style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{
                          flex: "0 0 auto", padding: "1px 7px", borderRadius: 6, fontWeight: 800, fontSize: 11,
                          color: ok ? "var(--success-fg)" : "var(--danger-fg)",
                          background: ok ? "var(--success-bg)" : "var(--danger-bg)",
                        }}>{r.status ?? "ERR"}</span>
                        <span style={{ fontWeight: 800, color: "var(--text)" }}>{r.label}</span>
                        {typeof r.count === "number" && <span style={{ color: "var(--muted)" }}>· {r.count} items</span>}
                      </div>
                      <div style={{ color: "var(--muted)", wordBreak: "break-all" }}>{r.url}</div>
                      {r.sample != null && (
                        <pre style={{ margin: "4px 0 0", padding: "6px 8px", background: "var(--bg)", borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, color: "var(--text)", maxHeight: 140, overflowY: "auto" }}>
                          {typeof r.sample === "string" ? r.sample : JSON.stringify(r.sample, null, 2)}
                        </pre>
                      )}
                      {r.error && <div style={{ color: "var(--danger-fg)" }}>{String(r.error)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
