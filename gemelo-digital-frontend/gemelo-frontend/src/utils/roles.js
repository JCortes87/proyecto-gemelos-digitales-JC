export const STUDENT_ROLES = ["estudiante ef", "student", "estudiante"];

export const isStudentRole = (rn) =>
  STUDENT_ROLES.some((sr) => String(rn || "").toLowerCase().includes(sr));

export const isInstructorRole = (rn) => {
  const s = String(rn || "").toLowerCase();
  if (!s) return false;
  return !isStudentRole(s);
};
