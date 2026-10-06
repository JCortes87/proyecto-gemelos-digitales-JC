import { createContext, useContext } from "react";

// Objeto de contexto + hook de consumo. Viven aparte de ThemeContext.jsx
// (que solo exporta el Provider) para que Fast Refresh funcione: un archivo
// que mezcla componentes con hooks/constantes fuerza recarga completa.
export const ThemeContext = createContext(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
