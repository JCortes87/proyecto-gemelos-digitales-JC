import React from "react";
import useDialogA11y from "../../hooks/useDialogA11y";

/**
 * Dialog genérico — modal accesible con:
 *  - Backdrop dismiss (opcional vía dismissOnBackdrop)
 *  - Escape para cerrar (opcional vía dismissOnEscape)
 *  - Foco inicial dentro del diálogo + focus trap con Tab / Shift+Tab
 *  - Restauración del foco al elemento previo al cerrar
 *  - Bloqueo del scroll del body mientras está abierto
 *  - role="dialog" + aria-modal + aria-label / aria-labelledby (+ aria-describedby)
 *
 * El comportamiento vive en el hook `useDialogA11y`, que también usan los
 * modales/drawers con layout propio.
 *
 * Props:
 *  - open (bool): controla visibilidad
 *  - onClose (fn)
 *  - ariaLabel / ariaLabelledBy / ariaDescribedBy (string)
 *  - width (string|number): default "min(640px, 100%)"
 *  - maxHeight (string): default "70vh"
 *  - alignTop (bool): si true, top offset 12vh; si false, centrado vertical
 *  - dismissOnBackdrop (bool): default true
 *  - dismissOnEscape (bool): default true
 *  - initialFocusRef (ref opcional al elemento a enfocar al abrir)
 *  - panelStyle (obj opcional): estilos extra del panel
 *  - children
 */
export default function Dialog(props) {
  // El hook se monta solo cuando el diálogo está abierto: así el foco se
  // mueve/restaura exactamente al abrir/cerrar.
  if (!props.open) return null;
  return <DialogInner {...props} />;
}

function DialogInner({
  onClose,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  width = "min(640px, 100%)",
  maxHeight = "70vh",
  alignTop = true,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  initialFocusRef,
  panelStyle,
  children,
}) {
  const dialogRef = useDialogA11y({ open: true, onClose, initialFocusRef, dismissOnEscape });

  return (
    // Backdrop: el clic fuera cierra; no necesita ser enfocable porque el
    // diálogo ya se cierra con Esc y con sus propios controles.
    <div
      data-dialog-backdrop=""
      onClick={dismissOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(13,17,23,0.65)", // velo oscuro: válido en ambos temas
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: alignTop ? "flex-start" : "center",
        justifyContent: "center",
        paddingTop: alignTop ? "12vh" : 20,
        paddingBottom: 20,
        paddingLeft: 20,
        paddingRight: 20,
        animation: "fadeIn 0.15s ease both",
        cursor: dismissOnBackdrop ? "pointer" : "default",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxHeight,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          cursor: "default",
          outline: "none",
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
