// @vitest-environment jsdom
// BETA — Escala de logro de Brightspace en el modal de umbrales: muestra los
// niveles, la sugerencia y "Usar como umbrales" rellena los controles sin guardar.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../utils/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiGet: vi.fn(),
}));

import { apiGet } from "../../utils/api";
import { ThresholdsModal } from "./primitives";

const OK = {
  available: true,
  beta: true,
  scales: [
    {
      outcomeSetId: "s1", outcomeSetName: "RA del programa", scaleId: 7,
      scaleName: "Escala CESA", usesPercentages: true,
      levels: [
        { id: 1, name: "Inicial", color: "#D32F2F", percentThreshold: 0, isAchievementThreshold: false },
        { id: 2, name: "En desarrollo", color: "#F9A825", percentThreshold: 55, isAchievementThreshold: false },
        { id: 3, name: "Logrado", color: "#388E3C", percentThreshold: 75, isAchievementThreshold: true },
      ],
    },
  ],
  suggestedThresholds: { critical: 55, watch: 75, basis: "Escala «Escala CESA»: observación = «Logrado»." },
};

function renderModal(props = {}) {
  const onSave = vi.fn();
  render(
    <ThresholdsModal
      current={{ critical: 50, watch: 70 }}
      base={{ critical: 50, watch: 70 }}
      isOverridden={false}
      onSave={onSave}
      onReset={vi.fn()}
      onClose={vi.fn()}
      orgUnitId={123}
      {...props}
    />,
  );
  return { onSave };
}

beforeEach(() => { apiGet.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("ThresholdsModal — escala de logro (beta)", () => {
  it("muestra los niveles y rellena los umbrales sin guardar", async () => {
    apiGet.mockResolvedValue(OK);
    const { onSave } = renderModal();

    expect(screen.getByText("Escala de logro de Brightspace")).toBeInTheDocument();
    expect(screen.getByText("BETA")).toBeInTheDocument();
    expect(await screen.findByText("Logrado")).toBeInTheDocument();
    expect(screen.getByText("En desarrollo")).toBeInTheDocument();
    expect(screen.getByText("≥ 75%")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/gemelo/course/123/outcome-scales", expect.anything());

    const crit = screen.getByLabelText("Umbral crítico (%)");
    const watch = screen.getByLabelText("Umbral de observación (%)");
    expect(crit).toHaveValue("50");
    expect(watch).toHaveValue("70");

    await userEvent.click(screen.getByRole("button", { name: /usar como umbrales/i }));
    expect(crit).toHaveValue("55");
    expect(watch).toHaveValue("75");
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ critical: 55, watch: 75 });
  });

  it("si no está disponible muestra el detalle en español, sin botón", async () => {
    apiGet.mockResolvedValue({
      available: false, reason: "missing_scope",
      detail: "Un administrador debe agregar el scope 'outcomes:scales:read'.",
    });
    renderModal();
    expect(await screen.findByText(/outcomes:scales:read/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /usar como umbrales/i })).toBeNull();
  });

  it("ante error de red muestra una nota y no rompe el modal", async () => {
    apiGet.mockImplementation(() => Promise.reject(new Error("HTTP 500")));
    renderModal();
    expect(await screen.findByText(/no se pudo consultar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("sin orgUnitId no consulta la API", () => {
    renderModal({ orgUnitId: undefined });
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("Escala de logro de Brightspace")).toBeNull();
  });
});
