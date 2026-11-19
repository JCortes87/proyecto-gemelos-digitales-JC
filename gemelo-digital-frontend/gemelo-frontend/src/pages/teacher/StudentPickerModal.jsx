import React from "react";
import useDialogA11y from "../../hooks/useDialogA11y";

// Selector de estudiante para "Vista estudiante" (profesores y superadmin).
// Extraído de TeacherDashboard.jsx sin cambios de comportamiento: el padre
// decide cuándo montarlo (studentPickerOpen) y conserva todo el estado.
// React.memo: todas sus props son estado/setters del padre (identidad estable),
// así no se re-renderiza la lista cuando el tablero cambia por otras razones.
export const StudentPickerModal = React.memo(function StudentPickerModal({
  pickerSearch,
  setImpersonateStudent,
  setPickerSearch,
  setStudentPickerOpen,
  studentRows,
}) {
  const close = () => { setStudentPickerOpen(false); setPickerSearch(""); };
  // Foco inicial (respeta el autoFocus del buscador), focus trap, Esc,
  // bloqueo de scroll y restauración del foco al cerrar.
  const dialogRef = useDialogA11y({ onClose: close });
  const titleId = React.useId();
  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 320,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: "min(480px, 92vw)", maxHeight: "70vh",
          background: "var(--card)", borderRadius: 16,
          border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          outline: "none",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div id={titleId} style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
            🎓 Vista estudiante — elige un estudiante
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar selector de estudiante"
            style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            placeholder="Buscar por nombre o ID…"
            aria-label="Buscar estudiante por nombre o ID"
            autoFocus
            style={{
              width: "100%", padding: "9px 12px", fontSize: 13,
              border: "1px solid var(--border)", borderRadius: 10,
              background: "var(--bg)", color: "var(--text)",
              fontFamily: "var(--font)", outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {(Array.isArray(studentRows) ? studentRows : [])
            .filter((s) => {
              if (!pickerSearch.trim()) return true;
              const q = pickerSearch.toLowerCase();
              return (s.displayName || "").toLowerCase().includes(q) || String(s.userId).includes(q);
            })
            .slice(0, 50)
            .map((s) => (
              <button
                type="button"
                key={s.userId}
                onClick={() => {
                  setImpersonateStudent({ userId: s.userId, name: s.displayName });
                  setStudentPickerOpen(false);
                  setPickerSearch("");
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "9px 16px", border: "none",
                  background: "transparent", cursor: "pointer",
                  fontSize: 13, fontFamily: "var(--font)",
                  color: "var(--text)", textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-light)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "var(--brand-light)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: "var(--brand)", flexShrink: 0,
                }}>{(s.displayName || "?").charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.displayName}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>ID {s.userId}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand)" }}>Ver portal →</span>
              </button>
            ))}
          {(Array.isArray(studentRows) ? studentRows : []).length === 0 && (
            <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
              Carga un curso primero para ver sus estudiantes.
            </div>
          )}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
          Verás el portal exactamente como lo ve el estudiante elegido
        </div>
      </div>
    </div>
  );
});
