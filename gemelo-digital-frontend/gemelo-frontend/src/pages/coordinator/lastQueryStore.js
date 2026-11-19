/**
 * Persistencia de la ÚLTIMA consulta del Panel Coordinador en el navegador.
 *
 * Analizar un semestre completo (cientos de cursos) tarda muchos minutos; si
 * el coordinador recarga o sale de la página no debe perder lo ya cargado.
 * Se guarda un único registro por usuario (clave = id de usuario) en
 * IndexedDB (BD "gemelo-coordinator", almacén "lastQuery").
 *
 * El almacenamiento real se inyecta como "backend" ({get, put, delete} con
 * promesas) para poder probarlo con un backend en memoria. Si IndexedDB no
 * existe o falla (tests, modo privado, cuota), todas las operaciones degradan
 * a no-op: nunca lanzan.
 */

export const DB_NAME = "gemelo-coordinator";
export const STORE_NAME = "lastQuery";
export const RECORD_VERSION = 1;

function openDb(idb) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = idb.open(DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB bloqueada"));
  });
}

/**
 * Backend sobre IndexedDB, o null si el navegador no lo ofrece. La BD se abre
 * de forma perezosa (en la primera operación) y se reintenta si falla.
 */
export function createIndexedDbBackend(idb = globalThis.indexedDB) {
  if (!idb || typeof idb.open !== "function") return null;
  let dbPromise = null;
  const getDb = () => {
    if (!dbPromise) {
      dbPromise = openDb(idb).catch((e) => {
        dbPromise = null;
        throw e;
      });
    }
    return dbPromise;
  };
  const run = async (mode, op) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const req = op(tx.objectStore(STORE_NAME));
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || new Error("Transacción abortada"));
    });
  };
  return {
    get: (key) => run("readonly", (s) => s.get(key)),
    put: (key, value) => run("readwrite", (s) => s.put(value, key)),
    delete: (key) => run("readwrite", (s) => s.delete(key)),
  };
}

/** Backend en memoria (tests). Clona los valores para simular IndexedDB. */
export function createMemoryBackend() {
  const map = new Map();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    map,
    get: async (key) => clone(map.get(key)),
    put: async (key, value) => { map.set(key, clone(value)); },
    delete: async (key) => { map.delete(key); },
  };
}

function keyFor(userId) {
  if (userId == null || String(userId).trim() === "") return null;
  return `user:${String(userId)}`;
}

/** true si el resumen falta o quedó con error (cuenta como "faltante"). */
export function isMissingSummary(summary) {
  return !summary || typeof summary !== "object" || Boolean(summary.error);
}

/** Ids (string) de los cursos sin resumen válido. */
export function missingSummaryIds(courses, summaries) {
  const s = summaries || {};
  return (courses || []).map((c) => String(c.id)).filter((id) => isMissingSummary(s[id]));
}

/**
 * Arma el registro a guardar. Solo conserva los resúmenes de los cursos de la
 * consulta; los `{error}` se guardan pero no cuentan como completos.
 */
export function buildRecord({ userId, filters, courses, summaries, now = Date.now() }) {
  const list = Array.isArray(courses) ? courses : [];
  const src = summaries || {};
  const kept = {};
  for (const c of list) {
    const id = String(c.id);
    if (src[id] !== undefined) kept[id] = src[id];
  }
  const f = filters || {};
  return {
    version: RECORD_VERSION,
    userId: String(userId),
    savedAt: new Date(now).toISOString(),
    filters: {
      semester: f.semester ?? "",
      semesterLabel: f.semesterLabel ?? "",
      category: f.category ?? "all",
      search: f.search ?? "",
    },
    courses: list,
    summaries: kept,
    complete: list.length > 0 && missingSummaryIds(list, kept).length === 0,
  };
}

/** Valida un registro leído; null si no sirve (otra versión, otro usuario…). */
export function normalizeRecord(rec, userId) {
  if (!rec || typeof rec !== "object") return null;
  if (rec.version !== RECORD_VERSION) return null;
  if (String(rec.userId) !== String(userId)) return null;
  if (!Array.isArray(rec.courses) || rec.courses.length === 0) return null;
  const summaries = rec.summaries && typeof rec.summaries === "object" ? rec.summaries : {};
  return {
    ...rec,
    filters: { semester: "", semesterLabel: "", category: "all", search: "", ...(rec.filters || {}) },
    summaries,
    complete: rec.courses.length > 0 && missingSummaryIds(rec.courses, summaries).length === 0,
  };
}

/** Almacén de la última consulta sobre un backend inyectable (puede ser null). */
export function createLastQueryStore(backend) {
  return {
    available: Boolean(backend),
    async load(userId) {
      const key = keyFor(userId);
      if (!backend || !key) return null;
      try {
        return normalizeRecord(await backend.get(key), userId);
      } catch {
        return null;
      }
    },
    async save(record) {
      const key = keyFor(record?.userId);
      if (!backend || !key) return false;
      try {
        await backend.put(key, record);
        return true;
      } catch {
        return false;
      }
    },
    async clear(userId) {
      const key = keyFor(userId);
      if (!backend || !key) return false;
      try {
        await backend.delete(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Instancia usada por el panel (IndexedDB del navegador, o no-op). */
export const lastQueryStore = createLastQueryStore(createIndexedDbBackend());
