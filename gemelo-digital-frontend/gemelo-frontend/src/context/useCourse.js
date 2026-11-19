import { createContext, useContext } from "react";

// Objeto de contexto + hook de consumo. Viven aparte de CourseContext.jsx
// (que solo exporta el Provider) para que Fast Refresh funcione: un archivo
// que mezcla componentes con hooks/constantes fuerza recarga completa.
export const CourseContext = createContext(null);

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used within CourseProvider");
  return ctx;
}
