import { createContext, useContext } from "react";

// Objeto de contexto + hook de consumo. Viven aparte de ToastContext.jsx
// (que solo exporta el Provider) para que Fast Refresh funcione: un archivo
// que mezcla componentes con hooks/constantes fuerza recarga completa.
export const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
