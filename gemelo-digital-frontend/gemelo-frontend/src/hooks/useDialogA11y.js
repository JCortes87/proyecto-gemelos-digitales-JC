import { useEffect, useRef } from "react";

/**
 * useDialogA11y — comportamiento accesible compartido para modales y drawers.
 *
 * Mientras `open` sea true:
 *  - Mueve el foco dentro del contenedor (initialFocusRef → primer enfocable →
 *    el propio contenedor). Si el contenido ya enfocó algo (autoFocus), lo respeta.
 *  - Atrapa el foco: Tab / Shift+Tab ciclan dentro del contenedor.
 *  - Escape llama a onClose (solo el diálogo superior si hay varios apilados).
 *  - Bloquea el scroll del <body> (con contador, soporta diálogos anidados).
 *  - Al cerrar/desmontar, devuelve el foco al elemento que lo tenía antes.
 *
 * Uso:
 *   const dialogRef = useDialogA11y({ open, onClose });
 *   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
 *
 * El contenedor debería tener tabIndex={-1} para poder recibir el foco cuando
 * no tiene elementos enfocables.
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

// Pila de diálogos abiertos: solo el de arriba reacciona a Esc/Tab.
const dialogStack = [];

// El "de arriba" es el último abierto, salvo que contenga en su DOM a otro
// diálogo abierto (anidado): React ejecuta primero los efectos de los hijos,
// así que un diálogo anidado montado a la vez que su padre queda antes en la pila.
function topDialog() {
  for (let i = dialogStack.length - 1; i >= 0; i -= 1) {
    const node = dialogStack[i].ref.current;
    if (!node) continue;
    const containsOther = dialogStack.some(
      (o) => o !== dialogStack[i] && o.ref.current && o.ref.current !== node && node.contains(o.ref.current)
    );
    if (!containsOther) return dialogStack[i];
  }
  return dialogStack[dialogStack.length - 1];
}

// Bloqueo de scroll con contador para diálogos anidados.
let scrollLockCount = 0;
let savedBodyOverflow = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
  }
}

export function getFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("inert") && el.getAttribute("aria-hidden") !== "true"
  );
}

export default function useDialogA11y({
  open = true,
  onClose,
  initialFocusRef,
  dismissOnEscape = true,
  lockScroll = true,
  restoreFocus = true,
} = {}) {
  const containerRef = useRef(null);
  // onClose en ref: evita re-ejecutar el efecto (y robar el foco) en cada render
  const onCloseRef = useRef(onClose);
  const escRef = useRef(dismissOnEscape);
  useEffect(() => {
    onCloseRef.current = onClose;
    escRef.current = dismissOnEscape;
  });

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const token = { ref: containerRef };
    dialogStack.push(token);
    const previouslyFocused = document.activeElement;
    if (lockScroll) lockBodyScroll();

    // Foco inicial
    const root = containerRef.current;
    if (root && !root.contains(document.activeElement)) {
      const target = initialFocusRef?.current || getFocusable(root)[0] || root;
      try { target.focus({ preventScroll: true }); } catch (_e) { /* noop */ }
    }

    const handleKeyDown = (e) => {
      if (topDialog() !== token) return;
      const node = containerRef.current;
      if (!node) return;

      if (e.key === "Escape" || e.key === "Esc") {
        if (!escRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (e.key !== "Tab") return;
      const focusables = getFocusable(node);
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = node.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === node) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const idx = dialogStack.indexOf(token);
      if (idx !== -1) dialogStack.splice(idx, 1);
      if (lockScroll) unlockBodyScroll();
      if (
        restoreFocus &&
        previouslyFocused &&
        typeof previouslyFocused.focus === "function" &&
        document.contains(previouslyFocused)
      ) {
        try { previouslyFocused.focus({ preventScroll: true }); } catch (_e) { /* noop */ }
      }
    };
    // initialFocusRef es un ref estable; no se incluye a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockScroll, restoreFocus]);

  return containerRef;
}
