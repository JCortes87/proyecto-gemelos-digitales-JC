import { createContext, useContext } from "react";

// Objeto de contexto + hook de consumo. Viven aparte de AuthContext.jsx
// (que solo exporta el Provider) para que Fast Refresh funcione: un archivo
// que mezcla componentes con hooks/constantes fuerza recarga completa.
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
