import { createContext, useContext } from "react";

// Objeto de contexto + hook de consumo. Viven aparte de I18nContext.jsx
// (que solo exporta el Provider) para que Fast Refresh funcione: un archivo
// que mezcla componentes con hooks/constantes fuerza recarga completa.
export const I18nContext = createContext(null);

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback: return a no-op t() so the app still works if provider missing
    return {
      locale: "es",
      t: (k, fb) => fb || k,
      setLocale: () => {},
      toggleLocale: () => {},
    };
  }
  return ctx;
}
