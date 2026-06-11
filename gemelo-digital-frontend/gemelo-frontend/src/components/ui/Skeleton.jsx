import React from "react";

/**
 * Skeleton — shimmer placeholder while content is loading.
 *
 * Variants:
 *   - "text"   short text line
 *   - "title"  larger heading line
 *   - "rect"   block (custom width/height)
 *   - "circle" circular (use size)
 *   - "card"   bordered card with header + lines
 *   - "row"    table row
 */
export default function Skeleton({
  variant = "text",
  width,
  height,
  size,
  lines = 3,
  style = {},
  ...rest
}) {
  const base = {
    background: "linear-gradient(90deg, var(--border) 0%, rgba(148,163,184,0.25) 50%, var(--border) 100%)",
    backgroundSize: "200% 100%",
    animation: "skeletonShimmer 1.4s ease-in-out infinite",
    borderRadius: 6,
    display: "block",
  };

  if (variant === "circle") {
    const s = size || 40;
    return <span aria-hidden="true" style={{ ...base, width: s, height: s, borderRadius: "50%", ...style }} {...rest} />;
  }

  if (variant === "title") {
    return <span aria-hidden="true" style={{ ...base, height: 18, width: width || "60%", ...style }} {...rest} />;
  }

  if (variant === "rect") {
    return <span aria-hidden="true" style={{ ...base, width: width || "100%", height: height || 80, borderRadius: 10, ...style }} {...rest} />;
  }

  if (variant === "card") {
    return (
      <div
        role="status"
        aria-label="Cargando"
        style={{
          padding: 16, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          background: "var(--card)", display: "flex", flexDirection: "column", gap: 10, ...style,
        }}
        {...rest}
      >
        <span aria-hidden="true" style={{ ...base, height: 16, width: "45%" }} />
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} aria-hidden="true" style={{ ...base, height: 11, width: i === lines - 1 ? "70%" : "100%" }} />
        ))}
      </div>
    );
  }

  if (variant === "row") {
    return (
      <div role="status" aria-label="Cargando fila" style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)", ...style }} {...rest}>
        <span aria-hidden="true" style={{ ...base, width: 32, height: 32, borderRadius: "50%" }} />
        <span aria-hidden="true" style={{ ...base, height: 12, flex: 1 }} />
        <span aria-hidden="true" style={{ ...base, height: 12, width: 60 }} />
      </div>
    );
  }

  // default: text
  return <span aria-hidden="true" style={{ ...base, height: 12, width: width || "100%", ...style }} {...rest} />;
}

export function SkeletonList({ count = 4, variant = "row", style = {}, itemStyle = {} }) {
  return (
    <div role="status" aria-label="Cargando lista" style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant={variant} style={itemStyle} />
      ))}
    </div>
  );
}
