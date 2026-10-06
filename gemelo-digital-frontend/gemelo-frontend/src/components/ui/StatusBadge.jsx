import React from "react";
import { getSeverityTokens, normalizeSeverity } from "./severity";

/**
 * StatusBadge — píldora compacta con icono opcional y etiqueta.
 *
 * Props:
 *   - severity: "info" | "success" | "warning" | "critical" | "pending" | "neutral"
 *   - children: label
 *   - icon: componente lucide (opcional, sobrescribe el default de la severidad)
 *   - hideIcon: bool — oculta el icono
 *   - size: "sm" (default) | "md" | "lg"
 *   - solid: bool — variante rellena (bg = severity.fg, text = white)
 *   - as: string tag (default "span")
 *
 * Accesibilidad: se aplica role="status" para severities no urgentes; los que
 * son críticos o warnings obtienen role="alert" para que lectores de pantalla
 * los anuncien inmediatamente cuando aparecen dinámicamente.
 */
export default function StatusBadge({
  severity = "neutral",
  children,
  icon,
  hideIcon = false,
  size = "sm",
  solid = false,
  as: Tag = "span",
  style: styleOverride,
  ...rest
}) {
  const sev = normalizeSeverity(severity);
  const t = getSeverityTokens(sev);
  const IconComp = icon || t.Icon;

  const sizeMap = {
    sm: { fontSize: 10, padY: 3, padX: 9, iconSize: 12, gap: 5, radius: 6 },
    md: { fontSize: 11, padY: 5, padX: 10, iconSize: 13, gap: 6, radius: 8 },
    lg: { fontSize: 12, padY: 7, padX: 12, iconSize: 14, gap: 6, radius: 10 },
  };
  const S = sizeMap[size] || sizeMap.sm;

  const role = sev === "critical" || sev === "warning" ? "alert" : "status";

  const baseStyle = solid
    ? {
        background: t.fg,
        color: "var(--on-status)", // blanco en claro; casi negro en oscuro (rellenos pastel)
        border: `1px solid ${t.fg}`,
      }
    : {
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
      };

  return (
    <Tag
      role={role}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: S.gap,
        padding: `${S.padY}px ${S.padX}px`,
        borderRadius: S.radius,
        fontSize: S.fontSize,
        fontWeight: 800,
        letterSpacing: "0.03em",
        fontFamily: "'Manrope', system-ui, sans-serif",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...baseStyle,
        ...styleOverride,
      }}
      {...rest}
    >
      {!hideIcon && IconComp && (
        <IconComp size={S.iconSize} strokeWidth={2.4} aria-hidden="true" />
      )}
      {children}
    </Tag>
  );
}
