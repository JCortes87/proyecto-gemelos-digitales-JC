// @vitest-environment jsdom
// Tests de accesibilidad del Dialog genérico: roles ARIA, foco inicial,
// focus trap (Tab / Shift+Tab), Esc, restauración del foco y scroll lock.
// Se usa react-dom/client + act directamente (sin Testing Library).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import Dialog from "./Dialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = "";
});

function pressKey(key, opts = {}) {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
  (document.activeElement || document.body).dispatchEvent(ev);
  return ev;
}

// Arnés: un botón disparador que abre el diálogo con tres botones dentro.
function Harness({ onCloseSpy }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>Abrir</button>
      <Dialog
        open={open}
        onClose={() => { onCloseSpy?.(); setOpen(false); }}
        ariaLabelledBy="dlg-title"
      >
        <h2 id="dlg-title">Título del diálogo</h2>
        <button type="button" data-testid="first">Primero</button>
        <button type="button" data-testid="middle">Medio</button>
        <button type="button" data-testid="last" onClick={() => setOpen(false)}>Cerrar</button>
      </Dialog>
    </>
  );
}

function openDialog(onCloseSpy) {
  act(() => root.render(<Harness onCloseSpy={onCloseSpy} />));
  const trigger = container.querySelector('[data-testid="trigger"]');
  trigger.focus();
  act(() => trigger.click());
  return trigger;
}

const byId = (id) => container.querySelector(`[data-testid="${id}"]`);

describe("Dialog (a11y)", () => {
  it("expone role=dialog, aria-modal y aria-labelledby", () => {
    openDialog();
    const dlg = container.querySelector('[role="dialog"]');
    expect(dlg).not.toBeNull();
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-labelledby")).toBe("dlg-title");
  });

  it("mueve el foco al primer elemento enfocable al abrir", () => {
    openDialog();
    expect(document.activeElement).toBe(byId("first"));
  });

  it("Esc cierra el diálogo", () => {
    const spy = vi.fn();
    openDialog(spy);
    act(() => { pressKey("Escape"); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Tab en el último elemento vuelve al primero (focus trap)", () => {
    openDialog();
    byId("last").focus();
    let ev;
    act(() => { ev = pressKey("Tab"); });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId("first"));
  });

  it("Shift+Tab en el primer elemento va al último (focus trap)", () => {
    openDialog();
    byId("first").focus();
    let ev;
    act(() => { ev = pressKey("Tab", { shiftKey: true }); });
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId("last"));
  });

  it("Tab en un elemento intermedio no se intercepta", () => {
    openDialog();
    byId("middle").focus();
    let ev;
    act(() => { ev = pressKey("Tab"); });
    expect(ev.defaultPrevented).toBe(false);
  });

  it("restaura el foco al disparador al cerrar (Esc)", () => {
    const trigger = openDialog();
    expect(document.activeElement).not.toBe(trigger);
    act(() => { pressKey("Escape"); });
    expect(document.activeElement).toBe(trigger);
  });

  it("restaura el foco al disparador al cerrar con un botón", () => {
    const trigger = openDialog();
    act(() => byId("last").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("bloquea el scroll del body mientras está abierto", () => {
    document.body.style.overflow = "auto";
    openDialog();
    expect(document.body.style.overflow).toBe("hidden");
    act(() => { pressKey("Escape"); });
    expect(document.body.style.overflow).toBe("auto");
  });

  it("con diálogos anidados, Esc cierra solo el de arriba", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    act(() => root.render(
      <Dialog open onClose={outer} ariaLabel="Exterior">
        <button type="button">A</button>
        <Dialog open onClose={inner} ariaLabel="Interior">
          <button type="button">B</button>
        </Dialog>
      </Dialog>
    ));
    act(() => { pressKey("Escape"); });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("dismissOnEscape=false ignora Esc", () => {
    const spy = vi.fn();
    act(() => root.render(
      <Dialog open onClose={spy} ariaLabel="Fijo" dismissOnEscape={false}>
        <button type="button">OK</button>
      </Dialog>
    ));
    act(() => { pressKey("Escape"); });
    expect(spy).not.toHaveBeenCalled();
  });
});
