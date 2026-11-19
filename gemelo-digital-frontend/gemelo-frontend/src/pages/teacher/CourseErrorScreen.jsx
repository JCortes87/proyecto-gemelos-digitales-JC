// Pantalla de error al cargar el curso (sin acceso / no encontrado / genérico).
// Extraída de TeacherDashboard.jsx sin cambios de comportamiento.
export function CourseErrorScreen({
  err,
  orgUnitId,
  setCourseListLoaded,
  setErr,
  setOrgUnitId,
  setOrgUnitInput,
  setOverview,
  setStudentRows,
  setStudentsList,
}) {
  // Detectar tipo de error para mostrar mensaje apropiado
  const isNoAccess  = err.includes("401") || err.includes("403") || err.includes("autenticado") || err.includes("No tiene acceso");
  const isNotFound  = err.includes("404") || err.includes("not found") || err.includes("no encontrado");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 20 }}>
      <div style={{ background: "var(--card)", border: `1.5px solid ${isNoAccess ? "var(--watch)" : isNotFound ? "var(--muted)" : "var(--critical)"}`, borderRadius: 18, padding: "40px 44px", maxWidth: 460, width: "100%", boxShadow: "var(--shadow-lg)", textAlign: "center" }}>
        {/* Icon */}
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {isNoAccess ? "🔒" : isNotFound ? "🔍" : "⚠️"}
        </div>
        {/* Title */}
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
          {isNoAccess
            ? "Sin acceso a este curso"
            : isNotFound
            ? "Curso no encontrado"
            : "Error al cargar el curso"
          }
        </h2>
        {/* Description */}
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 24px" }}>
          {isNoAccess
            ? `No tienes rol de instructor o coordinador en el curso ${orgUnitId}. Solo los docentes asignados pueden ver el Visor de desempeño estudiantil de un curso.`
            : isNotFound
            ? `El curso con ID ${orgUnitId} no existe en Brightspace o fue eliminado.`
            : err
          }
        </p>
        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => {
              setErr("");
              setOverview(null);
              setStudentsList(null);
              setStudentRows([]);
              setOrgUnitId(0);
              setOrgUnitInput("");
              setCourseListLoaded(false);
            }}
            style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
          >
            ← Ver mis cursos
          </button>
          {!isNoAccess && !isNotFound && (
            <button
              onClick={() => { setErr(""); setOverview(null); }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--brand)", color: "var(--on-brand)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Reintentar
            </button>
          )}
        </div>
        {/* Course ID hint */}
        <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          Curso ID: {orgUnitId}
        </div>
      </div>
    </div>
  );
}
