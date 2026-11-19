// @vitest-environment jsdom
// Tests del helper de peticiones de utils/api.js: headers con Bearer desde la
// sesión, ApiError (status/body/mensaje histórico) y manejo global de 401.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiGet, apiPost, apiPut, ApiError,
  getSessionId, setSessionId, clearSessionId, authHeaders,
  UNAUTHORIZED_EVENT, onUnauthorized,
} from "./api";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(status, text) {
  return new Response(text, { status, headers: { "content-type": "text/plain" } });
}

let fetchMock;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("helpers de sesión", () => {
  it("get/set/clear usan la clave gemelo_sid", () => {
    expect(getSessionId()).toBeNull();
    setSessionId("abc");
    expect(localStorage.getItem("gemelo_sid")).toBe("abc");
    expect(getSessionId()).toBe("abc");
    clearSessionId();
    expect(localStorage.getItem("gemelo_sid")).toBeNull();
  });

  it("authHeaders devuelve Bearer solo si hay sesión", () => {
    expect(authHeaders()).toEqual({});
    setSessionId("tok");
    expect(authHeaders()).toEqual({ Authorization: "Bearer tok" });
    expect(authHeaders("otro")).toEqual({ Authorization: "Bearer otro" });
  });
});

describe("request (apiGet/apiPost/apiPut)", () => {
  it("apiGet envía el Bearer de la sesión y devuelve el JSON", async () => {
    setSessionId("sid-123");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: 1 }));
    const data = await apiGet("/gemelo/x", { headers: { "X-Extra": "1" } });
    expect(data).toEqual({ ok: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer sid-123",
      "X-Extra": "1",
    });
    expect("body" in init).toBe(false);
  });

  it("sin sesión no envía Authorization", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiGet("/x");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("apiPost serializa el body y devuelve texto si la respuesta no es JSON", async () => {
    setSessionId("s");
    fetchMock.mockResolvedValueOnce(textResponse(200, "hecho"));
    const out = await apiPost("/y", { a: 1 });
    expect(out).toBe("hecho");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer s");
  });

  it("apiPut sin body envía body undefined", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { v: 2 }));
    expect(await apiPut("/z")).toEqual({ v: 2 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(init.body).toBeUndefined();
  });

  it("apiGet con respuesta no JSON lanza el error histórico", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, "<html>"));
    await expect(apiGet("/x")).rejects.toThrow(/^Respuesta no JSON \(text\/plain\): <html>/);
  });

  it("errores HTTP lanzan ApiError con status, body y mensaje histórico", async () => {
    setSessionId("s");
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { detail: "Prohibido" }));
    const err = await apiPost("/y", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.body).toEqual({ detail: "Prohibido" });
    expect(err.message).toBe("HTTP 403 - Prohibido");
  });

  it("error con cuerpo de texto conserva el texto en el mensaje", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(404, "no existe"));
    const err = await apiGet("/x").catch((e) => e);
    expect(err.status).toBe(404);
    expect(err.body).toBe("no existe");
    expect(err.message).toBe("HTTP 404 - no existe");
  });
});

describe("manejo global de 401", () => {
  it("401 en llamada autenticada borra la sesión y emite el evento", async () => {
    setSessionId("vencido");
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: "Sesión expirada" }));

    const err = await apiGet("/gemelo/x").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("HTTP 401 - Sesión expirada");
    expect(getSessionId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ path: "/gemelo/x", status: 401 });
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("onUnauthorized suscribe y desuscribe", async () => {
    setSessionId("vencido");
    const cb = vi.fn();
    const off = onUnauthorized(cb);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    await apiPost("/a", {}).catch(() => {});
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSessionId("vencido2");
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    await apiPost("/a", {}).catch(() => {});
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("401 sin sesión (llamada anónima) no emite el evento", async () => {
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    await apiGet("/x").catch(() => {});
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("errores distintos de 401 no borran la sesión ni emiten el evento", async () => {
    setSessionId("vigente");
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    for (const status of [400, 403, 404, 500]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { detail: "x" }));
      const err = await apiPut("/x", {}).catch((e) => e);
      expect(err.status).toBe(status);
    }
    expect(getSessionId()).toBe("vigente");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
});
