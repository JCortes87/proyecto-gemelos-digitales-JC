const API_BASE = import.meta.env.VITE_API_BASE ?? ""; 
// En prod: "" => mismo dominio (https://gemelo.cesa.edu.co)
// En local: "http://localhost:8000" o tu tunnel

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept": "application/json",
    },
  });

  // Diagnóstico claro
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText} @ ${path}\n${text.slice(0, 400)}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(`Respuesta no JSON @ ${path}\n${text.slice(0, 400)}`);
  }

  return res.json() as Promise<T>;
}