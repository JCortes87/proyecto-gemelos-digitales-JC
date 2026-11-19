import { ArrowRight, GraduationCap, LogOut, Presentation } from "lucide-react";
import { isStudentRole } from "../../utils/roles";

// Tarjeta de curso y encabezado de sección: a nivel de módulo (antes se
// recreaban en cada render). onOpen recibe el curso a abrir.
const CourseCardV2 = ({ c, role, onOpen }) => {
  const isActive = c.isActive !== false;
  const RoleIcon = role === "student" ? GraduationCap : Presentation;
  return (
    <button
      onClick={() => onOpen(c)}
      className={`course-card-v2 role-${role} ${!isActive ? "inactive" : ""}`}
      aria-label={`Abrir curso ${c.name}`}
    >
      <div className="course-card-icon">
        <RoleIcon size={22} strokeWidth={2} />
      </div>
      <div className="course-card-title">{c.name || `Curso ${c.id}`}</div>
      <div className="course-card-meta">
        <span className="course-card-id">
          #{c.id}{c.code ? ` · ${c.code}` : ""}
        </span>
        {!isActive && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: "var(--muted)",
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 99, padding: "1px 8px", textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            Inactivo
          </span>
        )}
      </div>
      <span className="course-card-arrow"><ArrowRight size={18} strokeWidth={2.5} /></span>
    </button>
  );
};

const SectionHeaderV2 = ({ icon, title, count, variant = "instructor" }) => (
  <div className="section-header-v2">
    <div className={`section-header-icon-wrap ${variant === "student" ? "student" : ""}`}>
      {icon}
    </div>
    <div>
      <div className="section-header-title">{title}</div>
      <div className="section-header-count">{count} curso{count !== 1 ? "s" : ""}</div>
    </div>
  </div>
);

// Selector de curso (pantalla mostrada cuando no hay curso seleccionado), con
// tarjetas "Como Profesor" / "Como Estudiante" y búsqueda con debounce.
// Extraído de TeacherDashboard.jsx sin cambios de comportamiento.
export function CourseSelectScreen({
  authUser,
  courseList,
  courseSearch,
  loadingCourses,
  logout,
  searchCourses,
  setCourseListLoaded,
  setCourseSearch,
  switchCourse,
}) {
  const instructorCourses = courseList.filter(c => !isStudentRole(c.roleName));
  const studentCourses = courseList.filter(c => isStudentRole(c.roleName));

  const openCourse = (c) => {
    if (isStudentRole(c.roleName)) {
      sessionStorage.setItem("gemelo_pending_org", String(c.id));
      window.location.href = window.location.origin + "/portal";
    } else {
      switchCourse(c.id);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--card)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 60,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-brand)", fontSize: 11, fontWeight: 900, letterSpacing: "0.02em" }}>CESA</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)", lineHeight: 1.15, letterSpacing: "-0.01em" }}>Gemelo Digital</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              Hola, {authUser?.user_name?.split(" ")[0] || "docente"} — selecciona tu curso
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font)" }}
        >
          <LogOut size={14} strokeWidth={2.2} /> Cerrar sesión
        </button>
      </header>

      {/* ── Contenido ───────────────────────────────────────────── */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
        {/* Buscador + contador */}
        {!loadingCourses && (courseList.length > 0 || courseSearch) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 440 }}>
              <input
                type="text"
                aria-label="Buscar curso por nombre, código o ID"
                placeholder="Buscar por nombre, código o ID…"
                value={courseSearch}
                onChange={e => {
                  const val = e.target.value;
                  setCourseSearch(val);
                  // Debounce: esperar 400ms antes de buscar en backend
                  clearTimeout(window._courseSearchTimer);
                  window._courseSearchTimer = setTimeout(() => {
                    setCourseListLoaded(false);
                    searchCourses(val);
                  }, 400);
                }}
                style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", boxSizing: "border-box", boxShadow: "var(--shadow-sm)" }}
                onFocus={e => e.target.style.borderColor = "var(--brand)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--muted)" }}>🔍</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              {courseSearch
                ? `${courseList.length} resultado${courseList.length !== 1 ? "s" : ""} para "${courseSearch}"`
                : `${courseList.length} cursos recientes · ${courseList.filter(c => c.isActive).length} activos`
              }
            </div>
          </div>
        )}

        {loadingCourses ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", fontSize: 13 }}>
            Cargando tus cursos…
          </div>
        ) : courseList.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
              {courseSearch ? `Sin resultados para "${courseSearch}"` : "No se encontraron cursos."}
            </div>
            {courseSearch && (
              <button
                onClick={() => {
                  setCourseSearch("");
                  setCourseListLoaded(false);
                  searchCourses("");
                }}
                style={{ background: "var(--brand)", color: "var(--on-brand)", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {instructorCourses.length > 0 && (
              <section>
                <SectionHeaderV2 icon={<Presentation size={22} strokeWidth={2.2} />} title="Como Profesor" count={instructorCourses.length} />
                <div className="course-grid stagger-children">
                  {instructorCourses.map(c => <CourseCardV2 key={`i-${c.id}`} c={c} role="instructor" onOpen={openCourse} />)}
                </div>
              </section>
            )}
            {studentCourses.length > 0 && (
              <section>
                <SectionHeaderV2 icon={<GraduationCap size={22} strokeWidth={2.2} />} title="Como Estudiante" count={studentCourses.length} variant="student" />
                <div className="course-grid stagger-children">
                  {studentCourses.map(c => <CourseCardV2 key={`s-${c.id}`} c={c} role="student" onOpen={openCourse} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
