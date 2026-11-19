import React from "react";
import { KNOWN_CATEGORIES } from "./coordinatorUtils";

const fieldLabel = { fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" };
const control = {
  padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font)",
};

/** Filtros del catálogo (período / categoría / nombre) + Buscar / Limpiar. */
export default function FiltersCard({
  catalogLoading, busyLabel, semesterError, semesters, semester, setSemester, category, setCategory,
  search, setSearch, onSearch, onClear, hasSearched, matchCount,
}) {
  return (
    <div className="kpi-card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
          <span style={fieldLabel}>Período / Semestre</span>
          <select value={semester} onChange={(e) => setSemester(e.target.value)} disabled={catalogLoading} style={control}>
            <option value="">{catalogLoading && semesters.length === 0 ? "Cargando períodos…" : "Todos mis cursos (sin período)"}</option>
            {semesters.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
          <span style={fieldLabel}>Tipo / Categoría</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={control}>
            {KNOWN_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 220px" }}>
          <span style={fieldLabel}>Buscar por nombre o código</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder="Ej: Finanzas, Mercadeo…"
            style={control}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onSearch}
          disabled={catalogLoading}
          style={{ padding: "9px 20px", alignSelf: "flex-end" }}
        >
          {busyLabel || (catalogLoading ? "Cargando catálogo…" : "Buscar cursos")}
        </button>
        {hasSearched && (
          <button type="button" className="btn" onClick={onClear} style={{ padding: "9px 14px", alignSelf: "flex-end" }}>
            ✕ Limpiar
          </button>
        )}
      </div>
      {semesterError && (
        <div role="alert" style={{ fontSize: 12, color: "var(--danger-fg)", marginTop: 10 }}>{semesterError}</div>
      )}
      {!catalogLoading && !semesterError && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }} aria-live="polite">
          {matchCount == null
            ? "Se consultarán en Brightspace los cursos del período seleccionado."
            : <>
                {matchCount} curso{matchCount !== 1 ? "s" : ""} coinciden con los filtros.
                {matchCount > 120 && " Analizar muchos cursos puede tardar varios minutos; considera acotar el período o la categoría."}
              </>}
        </div>
      )}
    </div>
  );
}
