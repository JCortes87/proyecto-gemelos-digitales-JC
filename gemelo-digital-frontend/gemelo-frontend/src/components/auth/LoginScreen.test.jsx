// @vitest-environment jsdom
// LoginScreen: abre el login OAuth en popup (con el curso si viene de LTI),
// fallback a redirect si el popup se bloquea, y solo acepta el postMessage
// "gemelo-auth" del mismo origen para guardar la sesión.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginScreen from "./LoginScreen";
import { getSessionId } from "../../utils/api";

const BOTON_LOGIN = /iniciar sesi[oó]n con microsoft/i;

let openSpy;
let popup;

beforeEach(() => {
  localStorage.clear();
  popup = { closed: false, close: vi.fn() };
  openSpy = vi.spyOn(window, "open").mockImplementation(() => popup);
  // jsdom no implementa navegación/reload: silenciar su aviso.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function enviarMensaje(data, origin = window.location.origin) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin }));
  });
}

describe("LoginScreen", () => {
  it("renderiza la bienvenida con el botón de login", () => {
    render(<LoginScreen />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BOTON_LOGIN })).toBeInTheDocument();
  });

  it("abre el popup de OAuth y pasa a 'Autenticando'", async () => {
    render(<LoginScreen />);
    await userEvent.click(screen.getByRole("button", { name: BOTON_LOGIN }));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, nombre] = openSpy.mock.calls[0];
    expect(url).toBe("/auth/brightspace/login");
    expect(nombre).toBe("gemelo-oauth");
    expect(screen.getByText(/Autenticando/)).toBeInTheDocument();
    expect(localStorage.getItem("gemelo_oauth_pending")).not.toBeNull();
  });

  it("incluye el curso (org_unit_id) cuando viene de LTI", async () => {
    render(<LoginScreen orgUnitId={777} />);
    await userEvent.click(screen.getByRole("button", { name: BOTON_LOGIN }));
    expect(openSpy.mock.calls[0][0]).toBe("/auth/brightspace/login?org_unit_id=777");
  });

  it("guarda el sid cuando el popup avisa desde el mismo origen", async () => {
    render(<LoginScreen />);
    await userEvent.click(screen.getByRole("button", { name: BOTON_LOGIN }));
    enviarMensaje({ type: "gemelo-auth", sid: "sid-popup" });
    expect(getSessionId()).toBe("sid-popup");
    expect(popup.close).toHaveBeenCalled();
    expect(localStorage.getItem("gemelo_oauth_pending")).toBeNull();
  });

  it("ignora mensajes de otro origen o de otro tipo", async () => {
    render(<LoginScreen />);
    await userEvent.click(screen.getByRole("button", { name: BOTON_LOGIN }));
    enviarMensaje({ type: "gemelo-auth", sid: "sid-atacante" }, "https://evil.example");
    enviarMensaje({ type: "otro", sid: "sid-x" });
    expect(getSessionId()).toBeNull();
    expect(screen.getByText(/Autenticando/)).toBeInTheDocument();
  });

  it("si el navegador bloquea el popup marca el OAuth pendiente (redirect)", async () => {
    openSpy.mockImplementation(() => null);
    render(<LoginScreen />);
    await userEvent.click(screen.getByRole("button", { name: BOTON_LOGIN }));
    expect(localStorage.getItem("gemelo_oauth_pending")).not.toBeNull();
    // Sigue mostrando la pantalla inicial mientras navega.
    expect(screen.getByRole("button", { name: BOTON_LOGIN })).toBeInTheDocument();
  });

  it("con un OAuth pendiente reciente arranca en 'completar acceso'", () => {
    localStorage.setItem("gemelo_oauth_pending", String(Date.now() - 10_000));
    render(<LoginScreen />);
    expect(screen.getByRole("button", { name: /completar acceso/i })).toBeInTheDocument();
  });

  it("una marca de OAuth pendiente vieja se descarta", () => {
    localStorage.setItem("gemelo_oauth_pending", String(Date.now() - 10 * 60_000));
    render(<LoginScreen />);
    expect(screen.getByRole("button", { name: BOTON_LOGIN })).toBeInTheDocument();
    expect(localStorage.getItem("gemelo_oauth_pending")).toBeNull();
  });
});
