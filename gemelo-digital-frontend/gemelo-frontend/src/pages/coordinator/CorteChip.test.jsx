// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import CorteChip, { CorteChips } from "./CorteChip";

const base = { studentsTotal: 40, studentsWithGrade: 38, dueDate: null };

describe("CorteChip", () => {
  it.each([
    ["publicado", 95, "Publicado", "var(--ok-bg)"],
    ["parcial", 50, "Parcial", "var(--watch-bg)"],
    ["pendiente", 0, "Pendiente", "var(--pending-bg)"],
    ["vencido_sin_reporte", 20, "Vencido sin reporte", "var(--critical-bg)"],
  ])("estado %s: color, % y tooltip", (status, pct, label, bg) => {
    render(<CorteChip period={2} corte={{ ...base, period: 2, status, pct }} />);
    const chip = screen.getByRole("img");
    expect(chip).toHaveAttribute("data-status", status);
    expect(chip).toHaveTextContent(`C2${pct}%`);
    expect(chip.getAttribute("title")).toContain(`Corte 2 · ${label}`);
    expect(chip.getAttribute("aria-label")).toContain(`${pct}% con nota`);
    expect(chip.style.background).toBe(bg);
  });

  it("incluye la fecha en el tooltip cuando existe", () => {
    render(<CorteChip period={1} corte={{ ...base, period: 1, status: "vencido_sin_reporte", pct: 10, dueDate: "2026-09-15T00:00:00Z" }} />);
    expect(screen.getByRole("img").getAttribute("title")).toMatch(/Fecha: /);
  });

  it("muestra — cuando el corte no existe", () => {
    render(<CorteChip period={3} corte={null} />);
    const chip = screen.getByRole("img");
    expect(chip).toHaveAttribute("data-status", "ausente");
    expect(chip).toHaveTextContent("C3—");
    expect(chip).toHaveAccessibleName("Corte 3: no existe en el libro de calificaciones");
  });

  it("estado de error de lectura", () => {
    render(<CorteChip period={1} corte={{ period: 1, status: "error", error: "No se pudo leer" }} />);
    expect(screen.getByRole("img")).toHaveTextContent("C1!");
  });
});

describe("CorteChips", () => {
  it("pinta los tres cortes", () => {
    render(<CorteChips cortes={{ 1: { ...base, period: 1, status: "publicado", pct: 100 }, 2: null, 3: null }} usesCortes />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("indica cuando el curso no usa cortes", () => {
    render(<CorteChips cortes={{}} usesCortes={false} />);
    expect(screen.getByText("Sin cortes")).toBeInTheDocument();
  });
});
