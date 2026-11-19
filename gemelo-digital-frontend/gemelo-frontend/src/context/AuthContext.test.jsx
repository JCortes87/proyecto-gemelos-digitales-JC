// @vitest-environment jsdom
// Tests del AuthProvider con React Testing Library: arranque desde el hash del
// callback OAuth (#gemelo:{sid}:{ou}:1), detección de roles (incluido doble
// rol y admins), logout, manejo del evento global de 401 y ausencia de bucles
// cuando /auth/me responde 401. fetch está mockeado: nunca sale a la red.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";
import { getSessionId, setSessionId, UNAUTHORIZED_EVENT } from "../utils/api";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Respuestas por ruta: cada test ajusta `rutas`.
let rutas;
let fetchMock;

function instalarFetch() {
  fetchMock = vi.fn(async (url) => {
    const u = String(url);
    for (const [prefijo, resp] of Object.entries(rutas)) {
      if (u.includes(prefijo)) {
        if (resp instanceof Error) throw resp;
        return typeof resp === "function" ? resp() : jsonResponse(200, resp);
      }
    }
    return jsonResponse(404, { detail: "no mock" });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function llamadasA(prefijo) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(prefijo));
}

function Sonda() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="checked">{String(a.authChecked)}</span>
      <span data-testid="user">{a.authUser ? a.authUser.user_name : "anon"}</span>
      <span data-testid="role">{a.role}</span>
      <span data-testid="roles">{a.allRoles.join(",")}</span>
      <span data-testid="dual">{String(a.isDualRole)}</span>
      <span data-testid="instructor">{String(a.isInstructor)}</span>
      <span data-testid="student">{String(a.isStudent)}</span>
      <span data-testid="superadmin">{String(a.isSuperAdmin)}</span>
      <span data-testid="ou">{String(a.initialOrgUnitId)}</span>
      <span data-testid="tutorial">{String(a.showTutorial)}</span>
      <button onClick={() => a.logout()}>salir</button>
    </div>
  );
}

function montar() {
  return render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  );
}

const txt = (id) => screen.getByTestId(id).textContent;

async function esperarChequeo() {
  await waitFor(() => expect(txt("checked")).toBe("true"));
}

const ME_OK = {
  authenticated: true, user_id: "42", user_name: "Ana", role: null, all_roles: [],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  rutas = { "/auth/me": ME_OK, "/brightspace/courses/enrolled": { items: [] }, "/auth/logout": { ok: true } };
  instalarFetch();
  // jsdom no implementa navegación (location.href = ...): silenciar su aviso.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("arranque desde el hash del callback OAuth", () => {
  it("guarda el sid, limpia el hash y llama /auth/me con Bearer", async () => {
    window.history.replaceState(null, "", "/dashboard#gemelo:sid-hash:777:1");
    montar();
    await esperarChequeo();

    expect(getSessionId()).toBe("sid-hash");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/dashboard");

    const [[url, init]] = llamadasA("/auth/me");
    expect(String(url)).not.toContain("sid-hash"); // el sid nunca va en la URL
    expect(init.headers).toEqual({ Authorization: "Bearer sid-hash" });
    expect(init.credentials).toBe("include");

    expect(txt("user")).toBe("Ana");
    expect(txt("ou")).toBe("777");
    expect(sessionStorage.getItem("gemelo_lti_org")).toBe("777");
    expect(sessionStorage.getItem("gemelo_pending_org")).toBe("777");
  });

  it("el hash con orgUnit vacío o inválido no fija curso", async () => {
    window.history.replaceState(null, "", "/#gemelo:sid-2::1");
    montar();
    await esperarChequeo();
    expect(getSessionId()).toBe("sid-2");
    expect(txt("ou")).toBe("null");
    expect(sessionStorage.getItem("gemelo_lti_org")).toBeNull();
  });

  it("sin hash usa el sid ya guardado", async () => {
    setSessionId("sid-guardado");
    montar();
    await esperarChequeo();
    expect(llamadasA("/auth/me")[0][1].headers).toEqual({ Authorization: "Bearer sid-guardado" });
  });

  it("sin sesión llama /auth/me sin Authorization y queda anónimo", async () => {
    rutas["/auth/me"] = { authenticated: false };
    montar();
    await esperarChequeo();
    expect(llamadasA("/auth/me")[0][1].headers).toEqual({});
    expect(txt("user")).toBe("anon");
    expect(txt("role")).toBe("student"); // fail-closed
    expect(llamadasA("/brightspace/courses/enrolled")).toHaveLength(0);
  });

  it("en la ventana popup avisa al opener y no inicializa el contexto", async () => {
    const opener = { closed: false, postMessage: vi.fn() };
    Object.defineProperty(window, "opener", { value: opener, configurable: true });
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    try {
      window.history.replaceState(null, "", "/#gemelo:sid-pop:55:1");
      montar();
      await waitFor(() => expect(opener.postMessage).toHaveBeenCalledTimes(1));
      expect(opener.postMessage).toHaveBeenCalledWith(
        { type: "gemelo-auth", sid: "sid-pop", orgUnitId: 55, firstLogin: true },
        window.location.origin,
      );
      expect(llamadasA("/auth/me")).toHaveLength(0);
      await waitFor(() => expect(close).toHaveBeenCalled(), { timeout: 1500 });
    } finally {
      Object.defineProperty(window, "opener", { value: null, configurable: true });
    }
  });
});

describe("detección de roles", () => {
  it("doble rol (docente + estudiante) desde las matrículas", async () => {
    rutas["/brightspace/courses/enrolled"] = {
      items: [{ roleName: "Instructor" }, { roleName: "Estudiante EF" }, { roleName: "Instructor" }],
    };
    montar();
    await esperarChequeo();
    expect(txt("dual")).toBe("true");
    expect(txt("roles")).toBe("instructor,student");
    expect(txt("role")).toBe("instructor");
    expect(txt("instructor")).toBe("true");
    expect(txt("student")).toBe("true");
    expect(txt("superadmin")).toBe("false");
    // La consulta de cursos también va autenticada.
    expect(llamadasA("/brightspace/courses/enrolled")[0][0]).toContain("active_only=false");
  });

  it("solo estudiante", async () => {
    rutas["/brightspace/courses/enrolled"] = { items: [{ roleName: "Student" }] };
    montar();
    await esperarChequeo();
    expect(txt("role")).toBe("student");
    expect(txt("dual")).toBe("false");
    expect(txt("instructor")).toBe("false");
  });

  it("rol de sistema Administrator → docente y superadmin", async () => {
    rutas["/auth/me"] = { ...ME_OK, role: "Administrator", all_roles: ["Administrator"] };
    montar();
    await esperarChequeo();
    expect(txt("role")).toBe("instructor");
    expect(txt("superadmin")).toBe("true");
  });

  it("Super Administrator del backend aunque no tenga matrículas", async () => {
    rutas["/auth/me"] = { ...ME_OK, role: "Super Administrator", all_roles: [] };
    montar();
    await esperarChequeo();
    expect(txt("superadmin")).toBe("true");
    expect(txt("role")).toBe("instructor");
  });

  it("'Coordinador Administrativo' es docente pero NO superadmin", async () => {
    rutas["/brightspace/courses/enrolled"] = { items: [{ roleName: "Coordinador Administrativo" }] };
    montar();
    await esperarChequeo();
    expect(txt("role")).toBe("instructor");
    expect(txt("superadmin")).toBe("false");
  });

  it("rol desconocido → estudiante (fail-closed)", async () => {
    rutas["/brightspace/courses/enrolled"] = { items: [{ roleName: "Invitado" }] };
    montar();
    await esperarChequeo();
    expect(txt("roles")).toBe("student");
    expect(txt("instructor")).toBe("false");
  });

  it("si falla la consulta de cursos usa los roles de /auth/me", async () => {
    rutas["/auth/me"] = { ...ME_OK, all_roles: ["Instructor"] };
    rutas["/brightspace/courses/enrolled"] = new TypeError("Failed to fetch");
    montar();
    await esperarChequeo();
    expect(txt("role")).toBe("instructor");
    expect(txt("user")).toBe("Ana");
  });

  it("muestra el tutorial solo si el usuario no lo ha visto", async () => {
    const primera = montar();
    await esperarChequeo();
    expect(txt("tutorial")).toBe("true");
    primera.unmount();

    localStorage.setItem("gemelo_onboarded", "1");
    montar();
    await esperarChequeo();
    expect(txt("tutorial")).toBe("false");
  });
});

describe("logout y 401", () => {
  it("logout llama /auth/logout con Bearer y limpia la sesión", async () => {
    window.history.replaceState(null, "", "/#gemelo:sid-x:9:1");
    montar();
    await esperarChequeo();
    expect(sessionStorage.getItem("gemelo_pending_org")).toBe("9");

    await userEvent.click(screen.getByRole("button", { name: "salir" }));

    await waitFor(() => expect(llamadasA("/auth/logout")).toHaveLength(1));
    const [, init] = llamadasA("/auth/logout")[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer sid-x" });
    expect(getSessionId()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("logout limpia la sesión aunque el backend no responda", async () => {
    setSessionId("sid-y");
    rutas["/auth/logout"] = new TypeError("offline");
    montar();
    await esperarChequeo();
    await userEvent.click(screen.getByRole("button", { name: "salir" }));
    await waitFor(() => expect(getSessionId()).toBeNull());
  });

  it("el evento gemelo:unauthorized vuelve al login SIN llamar al backend", async () => {
    setSessionId("sid-z");
    montar();
    await esperarChequeo();
    sessionStorage.setItem("gemelo_pending_org", "5");

    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { path: "/x", status: 401 } }));
    });

    expect(getSessionId()).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(llamadasA("/auth/logout")).toHaveLength(0);
  });

  it("401 en /auth/me no genera bucles ni dispara el 401 global", async () => {
    setSessionId("sid-vencido");
    rutas["/auth/me"] = () => jsonResponse(401, { detail: "Sesión expirada" });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    try {
      montar();
      await esperarChequeo();
      // Damos margen a cualquier reintento/efecto encadenado.
      await new Promise((r) => setTimeout(r, 50));
      expect(llamadasA("/auth/me")).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();
      expect(txt("user")).toBe("anon");
      expect(txt("role")).toBe("student");
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    }
  });

  it("si /auth/me no responde (offline) igual termina el chequeo", async () => {
    rutas["/auth/me"] = new TypeError("Failed to fetch");
    montar();
    await esperarChequeo();
    expect(txt("user")).toBe("anon");
  });
});

describe("useAuth", () => {
  it("fuera del provider lanza un error claro", () => {
    function Suelta() {
      useAuth();
      return null;
    }
    expect(() => render(<Suelta />)).toThrow(/within AuthProvider/);
  });
});
