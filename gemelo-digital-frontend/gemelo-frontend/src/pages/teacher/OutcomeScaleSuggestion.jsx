// BETA — Escala de logro de Brightspace (lo/outcomeScales) como umbrales
// sugeridos dentro del modal de umbrales de riesgo. No guarda nada: solo
// rellena los controles del modal; el docente sigue pulsando "Guardar".
import React from "react";
import { apiGet } from "../../utils/api";

const fmtPct = (v) => (v == null || Number.isNaN(Number(v)) ? "" : `${Math.round(Number(v) * 10) / 10}%`);

// Agrupa los conjuntos de RA por escala para no repetir los mismos niveles.
function groupByScale(scales) {
  const out = [];
  const idx = new Map();
  for (const s of scales || []) {
    const key = String(s.scaleId);
    if (!idx.has(key)) {
      idx.set(key, out.length);
      out.push({ ...s, setNames: [] });
    }
    if (s.outcomeSetName) out[idx.get(key)].setNames.push(s.outcomeSetName);
  }
  return out;
}

function BetaBadge() {
  return (
    <span
      aria-label="Función en beta"
      style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
        padding: "2px 6px", borderRadius: 999,
        background: "var(--info-bg)", color: "var(--info-fg)",
        border: "1px solid var(--info-fg)",
      }}
    >
      BETA
    </span>
  );
}

function LevelChip({ level, showPct }) {
  return (
    <li
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px", borderRadius: 999, fontSize: 11,
        background: "var(--bg)", color: "var(--text)",
        border: level.isAchievementThreshold ? "1.5px solid var(--text)" : "1px solid var(--border)",
        fontWeight: level.isAchievementThreshold ? 800 : 600,
      }}
      title={level.isAchievementThreshold ? "Umbral de logro definido en Brightspace" : undefined}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
          // Color del nivel definido por el administrador en Brightspace (dato, no tema).
          background: level.color || "var(--muted)",
          border: "1px solid var(--border)",
        }}
      />
      <span>{level.name || "—"}</span>
      {showPct && level.percentThreshold != null && (
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
          ≥ {fmtPct(level.percentThreshold)}
        </span>
      )}
      {level.isAchievementThreshold && (
        <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)" }}>(umbral de logro)</span>
      )}
    </li>
  );
}

export function OutcomeScaleSuggestion({ orgUnitId, onApply }) {
  const [state, setState] = React.useState({ status: "idle", data: null });
  const titleId = React.useId();

  React.useEffect(() => {
    if (!orgUnitId) return undefined;
    const ctrl = new AbortController();
    setState({ status: "loading", data: null });
    apiGet(`/gemelo/course/${orgUnitId}/outcome-scales`, { signal: ctrl.signal })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setState({ status: data?.available ? "ready" : "unavailable", data });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", data: null });
      });
    return () => ctrl.abort();
  }, [orgUnitId]);

  if (!orgUnitId) return null;

  const { status, data } = state;
  const groups = status === "ready" ? groupByScale(data?.scales) : [];
  const sug = data?.suggestedThresholds;

  const note = (text) => (
    <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>{text}</div>
  );

  return (
    <section
      aria-labelledby={titleId}
      style={{
        marginTop: 16, padding: "12px 14px", borderRadius: 12,
        border: "1px solid var(--border)", background: "var(--pending-bg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 id={titleId} style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
          Escala de logro de Brightspace
        </h3>
        <BetaBadge />
      </div>

      <div aria-live="polite" aria-busy={status === "loading"}>
        {(status === "loading" || status === "idle") && note("Consultando la escala de logro del curso…")}
        {status === "error" && note("No se pudo consultar la escala de logro de Brightspace. Puedes seguir configurando los umbrales manualmente.")}
        {status === "unavailable" && note(data?.detail || "La escala de logro no está disponible para este curso.")}

        {status === "ready" && (
          <>
            {groups.map((g) => (
              <div key={String(g.scaleId)} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>
                  {g.scaleName || "Escala sin nombre"}
                </div>
                {g.setNames.length > 0 && (
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
                    Usada en: {g.setNames.join(" · ")}
                  </div>
                )}
                <ul
                  aria-label={`Niveles de la escala ${g.scaleName || ""}`.trim()}
                  style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}
                >
                  {(g.levels || []).map((lv, i) => (
                    <LevelChip key={lv.id ?? i} level={lv} showPct={g.usesPercentages} />
                  ))}
                </ul>
              </div>
            ))}

            {sug ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 700 }}>
                  Sugerido: crítico &lt; {fmtPct(sug.critical)} · observación &lt; {fmtPct(sug.watch)}
                </div>
                {sug.basis && note(sug.basis)}
                <button
                  type="button"
                  onClick={() => onApply?.({ critical: Math.round(sug.critical), watch: Math.round(sug.watch) })}
                  aria-label={`Usar como umbrales: crítico ${fmtPct(sug.critical)} y observación ${fmtPct(sug.watch)}`}
                  style={{
                    marginTop: 8, padding: "6px 12px", borderRadius: 8,
                    border: "1px solid var(--info-fg)", background: "var(--info-bg)",
                    color: "var(--info-fg)", fontSize: 11, fontWeight: 800,
                    cursor: "pointer", fontFamily: "var(--font)",
                  }}
                >
                  Usar como umbrales
                </button>
                {note("No se guarda automáticamente: revisa los valores y pulsa «Guardar».")}
              </div>
            ) : (
              note(data?.suggestionNote || "No se pudo derivar una sugerencia de umbrales a partir de la escala.")
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default OutcomeScaleSuggestion;
