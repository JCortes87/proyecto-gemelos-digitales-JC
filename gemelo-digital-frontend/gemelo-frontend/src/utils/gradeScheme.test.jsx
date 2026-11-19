// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { rangeForPct, schemeLabel } from "./gradeScheme";
import SchemeGradeChip from "../components/ui/SchemeGradeChip";

const scheme = {
  name: "Escala 0-5",
  ranges: [
    { start: 0, symbol: "Reprobado", assignedValue: 0, color: "#CC0000" },
    { start: 60, symbol: "Aprobado", assignedValue: 3, color: "#00AA00" },
    { start: 90, symbol: "Excelente", assignedValue: 4.5, color: "#0055FF" },
  ],
};

describe("rangeForPct", () => {
  it.each([
    [0, "Reprobado"], [59.9, "Reprobado"], [60, "Aprobado"], [89.9, "Aprobado"], [90, "Excelente"], [100, "Excelente"],
  ])("%s %% → %s", (pct, symbol) => {
    expect(rangeForPct(scheme, pct).symbol).toBe(symbol);
  });

  it("sin esquema o sin dato devuelve null", () => {
    expect(rangeForPct(null, 50)).toBeNull();
    expect(rangeForPct(scheme, null)).toBeNull();
    expect(rangeForPct(scheme, "")).toBeNull();
    expect(rangeForPct(scheme, "x")).toBeNull();
  });
});

describe("schemeLabel", () => {
  it("combina símbolo y valor asignado", () => {
    expect(schemeLabel(scheme.ranges[1])).toBe("Aprobado · 3.0");
  });
  it("solo símbolo si no hay valor", () => {
    expect(schemeLabel({ symbol: "A", assignedValue: null })).toBe("A");
  });
  it("vacío sin rango", () => {
    expect(schemeLabel(null)).toBe("");
  });
});

describe("SchemeGradeChip", () => {
  it("muestra la nota en la escala del curso", () => {
    render(<SchemeGradeChip scheme={scheme} pct={72} />);
    expect(screen.getByText("Aprobado · 3.0")).toBeInTheDocument();
  });
  it("no renderiza nada sin esquema", () => {
    const { container } = render(<SchemeGradeChip scheme={null} pct={72} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SchemeGradeChip con esquema genérico", () => {
  it("no renderiza un esquema porcentual sin información", () => {
    const { container } = render(<SchemeGradeChip scheme={{ ...scheme, informative: false }} pct={72} />);
    expect(container).toBeEmptyDOMElement();
  });
});
