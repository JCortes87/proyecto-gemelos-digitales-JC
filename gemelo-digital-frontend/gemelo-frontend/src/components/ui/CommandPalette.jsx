import React, { useState, useRef, useMemo, useId } from "react";
import { Search, ChevronRight } from "lucide-react";
import Dialog from "./Dialog";

/**
 * Command palette modal (like Ctrl+K in VSCode/Linear).
 *
 * Refactorizado sobre <Dialog> genérico: focus trap, ESC y restauración de
 * foco quedan delegados al contenedor. Aquí sólo vive la lógica de búsqueda
 * y navegación con flechas.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   commands: [{ id, label, hint, icon, group, action }]
 */
export default function CommandPalette({ open, onClose, commands = [] }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  // Patrón combobox + listbox: el foco se queda en el input y las flechas
  // mueven la opción activa (aria-activedescendant).
  const listId = useId();
  const optionId = (idx) => `${listId}-opt-${idx}`;

  // Al abrir, limpiar búsqueda y selección. Se ajusta durante el render
  // comparando con el valor previo de `open` (patrón recomendado por React en
  // lugar de un efecto que hace setState y provoca un render extra).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setActiveIdx(0);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.hint || ""} ${c.group || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, commands]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) {
        cmd.action?.();
        onClose?.();
      }
    }
  };

  // Group commands by `group` field
  const grouped = {};
  filtered.forEach((c) => {
    const g = c.group || "General";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push({ ...c, _originalIdx: filtered.indexOf(c) });
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel="Paleta de comandos"
      initialFocusRef={inputRef}
    >
      {/* Search input */}
      <div
        onKeyDown={handleKeyDown}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Search size={18} strokeWidth={2.2} style={{ color: "var(--muted)" }} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            // Cada cambio de búsqueda reinicia la selección al primer resultado
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          placeholder="Escribe un comando o busca un estudiante..."
          aria-label="Buscar comando"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={filtered[activeIdx] ? optionId(activeIdx) : undefined}
          style={{
            flex: 1, border: "none", outline: "none",
            background: "transparent", color: "var(--text)",
            fontSize: 15, fontWeight: 500,
            fontFamily: "var(--font)",
          }}
        />
        <span style={{
          fontSize: 9, fontWeight: 800, color: "var(--muted)",
          padding: "3px 7px", borderRadius: 5,
          background: "var(--bg)", border: "1px solid var(--border)",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>ESC</span>
      </div>

      {/* Results list */}
      <div id={listId} role="listbox" aria-label="Comandos" style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            Sin resultados para "{query}"
          </div>
        ) : (
          Object.entries(grouped).map(([groupName, items]) => (
            <div key={groupName} role="group" aria-label={groupName}>
              <div aria-hidden="true" style={{
                padding: "8px 18px 4px",
                fontSize: 10, fontWeight: 800, color: "var(--muted)",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {groupName}
              </div>
              {items.map((cmd) => {
                const isActive = cmd._originalIdx === activeIdx;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    id={optionId(cmd._originalIdx)}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    onClick={() => {
                      cmd.action?.();
                      onClose?.();
                    }}
                    onMouseEnter={() => setActiveIdx(cmd._originalIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "10px 18px",
                      background: isActive ? "var(--brand-light)" : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      fontSize: 13, fontFamily: "var(--font)",
                      color: isActive ? "var(--brand)" : "var(--text)",
                    }}
                  >
                    <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center" }}>
                      {cmd.icon
                        ? (typeof cmd.icon === "function"
                            ? <cmd.icon size={16} strokeWidth={2.2} />
                            : cmd.icon)
                        : <ChevronRight size={16} strokeWidth={2.4} />}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{cmd.label}</span>
                    {cmd.hint && (
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                        {cmd.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: "8px 18px",
        borderTop: "1px solid var(--border)",
        fontSize: 10, color: "var(--muted)", fontWeight: 600,
        display: "flex", gap: 14,
      }}>
        <span>↑↓ Navegar</span>
        <span>↵ Seleccionar</span>
        <span>Esc Cerrar</span>
        <span style={{ marginLeft: "auto" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
      </div>
    </Dialog>
  );
}
