// @vitest-environment jsdom
// Casos de utils/api.js que no cubre api.test.js: reintentos con backoff de
// los GET (502/503/504 y fallos de red), respeto del AbortSignal, descarga
// autenticada (apiDownload), caché SWR-lite (apiGetCached) y mapLimit.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiGet, apiPost, apiDownload, apiGetCached, invalidateApiCache, mapLimit,
  ApiError, getSessionId, setSessionId, UNAUTHORIZED_EVENT,
} from "./api";

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

let fetchMock;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("reintentos de apiGet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("reintenta 503 con espera y devuelve el JSON del intento exitoso", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const p = apiGet("/gemelo/x");
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1); // aún esperando el backoff de 500 ms
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tras agotar los reintentos devuelve el último error transitorio como ApiError", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(504, { detail: "Gateway Timeout" }));
    const p = apiGet("/x").catch((e) => e);
    await vi.advanceTimersByTimeAsync(500 + 1500);
    const err = await p;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(504);
    expect(err.message).toBe("HTTP 504 - Gateway Timeout");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reintenta fallos de red (TypeError) y se recupera", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, [1]));
    const p = apiGet("/x");
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toEqual([1]);
  });

  it("si la red falla en todos los intentos propaga el error de red", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const p = apiGet("/x").catch((e) => e);
    await vi.advanceTimersByTimeAsync(2000);
    const err = await p;
    expect(err).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404, 500])("no reintenta el status %s", async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { detail: "x" }));
    const err = await apiGet("/x").catch((e) => e);
    expect(err.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no reintenta un AbortError del fetch", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    const err = await apiGet("/x").catch((e) => e);
    expect(err.name).toBe("AbortError");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("abortar durante la espera del backoff cancela sin reintentar", async () => {
    const ctrl = new AbortController();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, {}));
    const p = apiGet("/x", { signal: ctrl.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    ctrl.abort();
    const err = await p;
    expect(err.name).toBe("AbortError");
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("los POST nunca se reintentan", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "caído" }));
    const err = await apiPost("/x", { a: 1 }).catch((e) => e);
    expect(err.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("formatos de respuesta", () => {
  it("application/problem+json se trata como JSON en errores", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Inválido" }), {
      status: 422, headers: { "content-type": "application/problem+json" },
    }));
    const err = await apiGet("/x").catch((e) => e);
    expect(err.message).toBe("HTTP 422 - Inválido");
    expect(err.body).toEqual({ detail: "Inválido" });
  });

  it("usa message/error o el JSON completo cuando no hay detail", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "malo" }));
    expect((await apiGet("/x").catch((e) => e)).message).toBe("HTTP 400 - malo");
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "peor" }));
    expect((await apiGet("/x").catch((e) => e)).message).toBe("HTTP 400 - peor");
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { otro: 1 }));
    expect((await apiGet("/x").catch((e) => e)).message).toBe('HTTP 400 - {"otro":1}');
  });

  it("GET 200 sin content-type JSON lanza error aunque el cuerpo parezca JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"a":1}', { status: 200, headers: { "content-type": "text/html" } }));
    await expect(apiGet("/x")).rejects.toThrow(/Respuesta no JSON \(text\/html\)/);
  });
});

describe("apiDownload", () => {
  let clicks;
  let creados;

  beforeEach(() => {
    clicks = [];
    creados = [];
    vi.stubGlobal("URL", Object.assign(Object.create(URL), URL, {
      createObjectURL: vi.fn((blob) => { creados.push(blob); return "blob:fake/1"; }),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicks.push({ href: this.getAttribute("href"), download: this.download });
    });
  });

  it("descarga con Bearer (sin sid en la URL) y nombre desde Content-Disposition", async () => {
    setSessionId("sid-dl");
    fetchMock.mockResolvedValueOnce(new Response("a,b\n1,2", {
      status: 200,
      headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="reporte.csv"' },
    }));
    await apiDownload("/gemelo/export?ou=1", "fallback.csv");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/gemelo/export?ou=1");
    expect(url).not.toContain("sid");
    expect(init.headers).toEqual({ Authorization: "Bearer sid-dl" });
    expect(init.credentials).toBe("include");
    expect(clicks).toEqual([{ href: "blob:fake/1", download: "reporte.csv" }]);
    expect(await creados[0].text()).toBe("a,b\n1,2");
    // El <a> temporal se retira del DOM.
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("decodifica filename* (RFC 5987)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", {
      status: 200, headers: { "content-disposition": "attachment; filename*=UTF-8''informe%20final%C3%B1.pdf" },
    }));
    await apiDownload("/x");
    expect(clicks[0].download).toBe("informe finalñ.pdf");
  });

  it("sin Content-Disposition usa el nombre por defecto", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }));
    await apiDownload("/x", "mi-archivo.xlsx");
    expect(clicks[0].download).toBe("mi-archivo.xlsx");
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }));
    await apiDownload("/x");
    expect(clicks[1].download).toBe("descarga");
  });

  it("error HTTP lanza ApiError y no descarga", async () => {
    fetchMock.mockResolvedValueOnce(new Response("fallo interno", { status: 500 }));
    const err = await apiDownload("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("HTTP 500 - fallo interno");
    expect(clicks).toEqual([]);
  });

  it("401 autenticado borra la sesión y emite el evento global", async () => {
    setSessionId("sid-vencido");
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    const err = await apiDownload("/x").catch((e) => e);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(err.status).toBe(401);
    expect(getSessionId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("apiGetCached", () => {
  it("deduplica peticiones en vuelo y cachea por TTL", async () => {
    let resolver;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
    const a = apiGetCached("/cache/dedup");
    const b = apiGetCached("/cache/dedup");
    resolver(jsonResponse(200, { v: 1 }));
    expect(await a).toEqual({ v: 1 });
    expect(await b).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Dentro del TTL se sirve desde caché.
    expect(await apiGetCached("/cache/dedup")).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force y ttl:0 vuelven a pedir", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { t: fetchMock.mock.calls.length }));
    expect(await apiGetCached("/cache/force")).toEqual({ t: 1 });
    expect(await apiGetCached("/cache/force", { force: true })).toEqual({ t: 2 });
    expect(await apiGetCached("/cache/force", { ttl: 0 })).toEqual({ t: 3 });
  });

  it("invalidateApiCache borra por prefijo", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { n: fetchMock.mock.calls.length }));
    await apiGetCached("/cache/inv/a");
    await apiGetCached("/otro/b");
    invalidateApiCache("/cache/inv");
    expect(await apiGetCached("/cache/inv/a")).toEqual({ n: 3 });
    expect(await apiGetCached("/otro/b")).toEqual({ n: 2 }); // sigue en caché
  });

  it("el abort de un consumidor no cancela la petición compartida", async () => {
    let resolver;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolver = r; }));
    const ctrl = new AbortController();
    const abortado = apiGetCached("/cache/abort", { signal: ctrl.signal }).catch((e) => e);
    const otro = apiGetCached("/cache/abort");
    ctrl.abort();
    expect((await abortado).name).toBe("AbortError");
    resolver(jsonResponse(200, { ok: true }));
    expect(await otro).toEqual({ ok: true });
    // El fetch compartido nunca recibió el signal del llamador.
    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });

  it("un signal ya abortado rechaza de inmediato", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const ctrl = new AbortController();
    ctrl.abort();
    const err = await apiGetCached("/cache/pre-abort", { signal: ctrl.signal }).catch((e) => e);
    expect(err.name).toBe("AbortError");
  });

  it("un error no queda cacheado", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { detail: "no" }));
    await expect(apiGetCached("/cache/err")).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ya: 1 }));
    expect(await apiGetCached("/cache/err")).toEqual({ ya: 1 });
  });
});

describe("mapLimit", () => {
  it("conserva el orden y respeta el límite de concurrencia", async () => {
    let activos = 0;
    let maximo = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n, idx) => {
      activos += 1;
      maximo = Math.max(maximo, activos);
      await new Promise((r) => setTimeout(r, n));
      activos -= 1;
      return `${idx}:${n * 10}`;
    });
    expect(out).toEqual(["0:50", "1:10", "2:40", "3:20", "4:30"]);
    expect(maximo).toBe(2);
  });

  it("entradas vacías o que no son arreglo devuelven []", async () => {
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
    expect(await mapLimit(null, 3, async (x) => x)).toEqual([]);
  });

  it("propaga el error del mapper", async () => {
    await expect(mapLimit([1, 2], 2, async (x) => {
      if (x === 2) throw new Error("falló 2");
      return x;
    })).rejects.toThrow("falló 2");
  });
});
