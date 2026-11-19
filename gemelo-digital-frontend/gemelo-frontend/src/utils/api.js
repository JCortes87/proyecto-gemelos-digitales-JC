const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ||
  import.meta.env?.VITE_GEMELO_BASE_URL ||
  ""
).replace(/\/$/, "");

// En dev la URL vacía es lo esperado (el proxy de Vite apunta al backend
// local); solo en un build de producción es un error de configuración.
if (!API_BASE_URL && import.meta.env?.PROD) {
  console.error("⚠️ Falta definir VITE_API_BASE_URL (o VITE_GEMELO_BASE_URL) en el .env");
}

export function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

export { API_BASE_URL };

// ── Sesión (token) centralizada ──────────────────────────────────────────────
// Único punto de acceso al session id guardado en localStorage. Antes cada
// componente leía/escribía "gemelo_sid" a mano; ahora todos pasan por aquí.
export const SESSION_STORAGE_KEY = "gemelo_sid";

export function getSessionId() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function setSessionId(sid) {
  try {
    if (sid) localStorage.setItem(SESSION_STORAGE_KEY, sid);
  } catch { /* storage bloqueado: noop */ }
}

export function clearSessionId() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* storage bloqueado: noop */ }
}

/** Header Authorization (Bearer) si hay sesión; objeto vacío si no. */
export function authHeaders(sid = getSessionId()) {
  return sid ? { Authorization: `Bearer ${sid}` } : {};
}

// ── 401 global ───────────────────────────────────────────────────────────────
// Cuando una llamada AUTENTICADA (con sid) recibe 401, la sesión expiró o fue
// revocada: se borra el sid y se avisa a la app con un CustomEvent en window.
// AuthContext lo escucha y devuelve al usuario a la pantalla de login.
// (El probe /auth/me de AuthContext usa fetch directo y maneja su respuesta
// por su cuenta, así que no pasa por aquí ni puede provocar bucles.)
export const UNAUTHORIZED_EVENT = "gemelo:unauthorized";

function _notifyUnauthorized(detail) {
  clearSessionId();
  try {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail }));
  } catch { /* entorno sin window: noop */ }
}

/** Suscribe un callback al evento de 401. Devuelve la función para desuscribir. */
export function onUnauthorized(callback) {
  const handler = (e) => callback(e.detail);
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

/** Error HTTP de la API: conserva el formato de mensaje "HTTP <status> - <detalle>". */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function _isJsonResponse(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") || ct.includes("application/problem+json");
}

/**
 * Descarga un endpoint binario autenticando con el header Authorization.
 * El sid NUNCA viaja en la URL (antes iba como ?sid= y quedaba expuesto en
 * historial del navegador, logs del servidor y headers Referer).
 * Dispara la descarga en el navegador vía Blob + <a download>.
 */
export async function apiDownload(path, fallbackFilename = "descarga") {
  const sid = getSessionId();
  const res = await fetch(apiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: authHeaders(sid),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 401 && sid) _notifyUnauthorized({ path, status: 401 });
    throw new ApiError(`HTTP ${res.status} - ${String(txt).slice(0, 300)}`, res.status, txt);
  }
  // Nombre de archivo desde Content-Disposition, si el backend lo envía
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  const filename = match
    ? decodeURIComponent(match[1].replace(/"/g, "").trim())
    : fallbackFilename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Retry con backoff para GETs ──────────────────────────────────────────────
// Un fallo transitorio de red (WiFi parpadeando, cold start del backend, 502
// del balanceador) no debe romper la vista: se reintenta hasta 2 veces con
// espera creciente. Solo GET (idempotente); nunca se reintentan aborts ni 4xx.
const RETRY_STATUS = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1500];

function _sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

async function _fetchGetWithRetry(url, init) {
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await _sleep(RETRY_DELAYS_MS[attempt - 1], init.signal);
    try {
      const res = await fetch(url, init);
      if (RETRY_STATUS.has(res.status) && attempt < RETRY_DELAYS_MS.length) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue; // transitorio: reintentar
      }
      return res;
    } catch (err) {
      // AbortError: respetar la cancelación del llamador, no reintentar
      if (err?.name === "AbortError") throw err;
      // TypeError de fetch = fallo de red (DNS, conexión caída, CORS…)
      lastErr = err;
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
    }
  }
  throw lastErr || new Error("Fallo de red");
}

/**
 * Helper interno común a apiGet/apiPost/apiPut: arma headers (Accept, JSON,
 * Bearer), parsea errores en un ApiError con el formato histórico
 * "HTTP <status> - <detalle>" y dispara el manejo global de 401.
 *  - GET: reintenta fallos transitorios y exige respuesta JSON.
 *  - POST/PUT: serializa `body` como JSON y devuelve JSON o texto.
 */
async function request(method, path, { body, headers, signal } = {}) {
  const isGet = method === "GET";
  const sid = getSessionId();
  const init = {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(isGet ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(sid),
      ...(headers || {}),
    },
    signal,
  };
  if (!isGet) init.body = body != null ? JSON.stringify(body) : undefined;

  const res = isGet
    ? await _fetchGetWithRetry(apiUrl(path), init)
    : await fetch(apiUrl(path), init);

  const isJson = _isJsonResponse(res);

  if (!res.ok) {
    const errBody = isJson
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => "");
    const msg =
      typeof errBody === "string"
        ? errBody
        : errBody?.detail || errBody?.message || errBody?.error || JSON.stringify(errBody);
    // Solo si la llamada iba autenticada: sin sid no hay sesión que invalidar
    if (res.status === 401 && sid) _notifyUnauthorized({ path, status: 401 });
    throw new ApiError(`HTTP ${res.status} - ${String(msg).slice(0, 600)}`, res.status, errBody);
  }

  if (isGet) {
    if (!isJson) {
      const ct = res.headers.get("content-type") || "";
      const txt = await res.text().catch(() => "");
      throw new Error(`Respuesta no JSON (${ct}): ${txt.slice(0, 300)}`);
    }
    return res.json();
  }

  return isJson ? res.json() : res.text();
}

export async function apiGet(path, opts = {}) {
  return request("GET", path, { headers: opts.headers, signal: opts.signal });
}

export async function apiPost(path, body, opts = {}) {
  return request("POST", path, { body, headers: opts.headers, signal: opts.signal });
}

export async function apiPut(path, body, opts = {}) {
  return request("PUT", path, { body, headers: opts.headers, signal: opts.signal });
}

// ── Cache SWR-lite: TTL + dedup de requests en vuelo ─────────────────────────
// Evita que CourseContext y TeacherDashboard dupliquen las mismas llamadas GET.
const _apiCache = new Map(); // path -> { ts, data }
const _inflight = new Map(); // path -> Promise
const DEFAULT_CACHE_TTL_MS = 60_000;

export async function apiGetCached(path, opts = {}) {
  const { signal, ...fetchOpts } = opts;
  const ttl = opts.ttl ?? DEFAULT_CACHE_TTL_MS;
  const now = Date.now();

  let promise = null;
  if (!opts.force) {
    const hit = _apiCache.get(path);
    if (hit && now - hit.ts < ttl) return hit.data;
    promise = _inflight.get(path) || null;
  }

  if (!promise) {
    // OJO: la petición compartida NO recibe el `signal` del llamador. Si un
    // componente se desmonta (p.ej. el doble montaje de StrictMode en dev)
    // y aborta su controller, ese abort NO debe tumbar la promesa que otros
    // consumidores están compartiendo — antes esto hacía que el segundo
    // montaje recibiera "signal is aborted without reason" de un abort ajeno.
    promise = apiGet(path, fetchOpts)
      .then((data) => {
        _apiCache.set(path, { ts: Date.now(), data });
        return data;
      })
      .finally(() => {
        _inflight.delete(path);
      });
    _inflight.set(path, promise);
  }

  if (!signal) return promise;

  // Respetar el abort del llamador sin cancelar la petición compartida:
  // solo SU promesa envolvente rechaza con AbortError (la compartida sigue
  // y deja el resultado en caché para el resto).
  return new Promise((resolve, reject) => {
    const makeAbortErr = () => {
      try { return new DOMException("Aborted", "AbortError"); }
      catch { return Object.assign(new Error("Aborted"), { name: "AbortError" }); }
    };
    if (signal.aborted) { reject(makeAbortErr()); return; }
    const onAbort = () => reject(makeAbortErr());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

export function invalidateApiCache(prefix = "") {
  for (const key of _apiCache.keys()) {
    if (key.startsWith(prefix)) _apiCache.delete(key);
  }
}

export async function mapLimit(arr, limit, mapper) {
  const list = Array.isArray(arr) ? arr : [];
  const results = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(null).map(async () => {
    while (i < list.length) {
      const idx = i++;
      results[idx] = await mapper(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
