// @vitest-environment jsdom
// BETA — Generador de rúbricas por RA: render, selección de RA, vista previa
// (dry run) y diálogo de confirmación que condiciona la creación real.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../utils/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { apiGet, apiPost } from "../../utils/api";
import { RubricsTab } from "./RubricsTab";
import { validateRubricDraft, DEFAULT_RUBRIC_LEVELS } from "./useRubricBuilder";

const G1 = "guid-1";
const G2 = "guid-2";
const LEVELS = DEFAULT_RUBRIC_LEVELS;

const OUTCOMES = {
  orgUnitId: 10,
  outcomes: [
    { id: G1, code: "RA1", title: "Analiza estados financieros", description: "RA1 - Analiza estados financieros", setName: "Finanzas" },
    { id: G2, code: "RA2", title: "Formula presupuestos", description: "RA2 - Formula presupuestos", setName: "Finanzas" },
  ],
  defaultLevels: LEVELS,
};

function previewFor(ids) {
  const crit = ids.map(id => {
    const o = OUTCOMES.outcomes.find(x => x.id === id);
    return {
      Name: `${o.code} – ${o.title}`,
      Cells: LEVELS.map(l => ({ Feedback: null, Points: null, Description: { Content: `${l.name}: ${o.description}`, Type: "Text" } })),
    };
  });
  return {
    dryRun: true,
    state: "draft",
    levels: LEVELS,
    warnings: [],
    rubricInput: { Name: "Rúbrica por RA – curso 10", RubricStateId: 2, CriteriaGroups: [{ Name: "g", Levels: [], Criteria: crit }] },
    mapping: ids.map((id, i) => ({ criterionIndex: i, criterionName: crit[i].Name, outcomeId: id })),
  };
}

async function loadCourse() {
  render(<RubricsTab initialOrgId="10" />);
  fireEvent.click(screen.getByRole("button", { name: /Cargar RA/ }));
  await screen.findByText("Curso 10 · 2 RA");
}

describe("RubricsTab (beta)", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue(OUTCOMES);
  });

  it("muestra el badge BETA y la advertencia de escritura real", () => {
    render(<RubricsTab />);
    expect(screen.getByLabelText("Función en fase beta")).toHaveTextContent("BETA");
    expect(screen.getByRole("note")).toHaveTextContent(/rúbrica real/);
  });

  it("carga los RA del curso y permite seleccionarlos", async () => {
    await loadCourse();
    expect(apiGet).toHaveBeenCalledWith("/gemelo/course/10/rubrics/outcomes");
    const cb = screen.getByRole("checkbox", { name: /RA1/ });
    expect(screen.getByRole("button", { name: "Vista previa" })).toBeDisabled();
    fireEvent.click(cb);
    expect(cb).toBeChecked();
    expect(screen.getByRole("button", { name: "Vista previa" })).toBeEnabled();
  });

  it("la vista previa pinta la tabla criterios × niveles y no crea nada", async () => {
    apiPost.mockResolvedValueOnce(previewFor([G1]));
    await loadCourse();
    fireEvent.click(screen.getByRole("checkbox", { name: /RA1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));
    await screen.findByRole("rowheader", { name: /RA1 – Analiza/ });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0][0]).toBe("/gemelo/course/10/rubrics/preview");
    expect(apiPost.mock.calls[0][1]).toMatchObject({ outcomeIds: [G1], publish: false });
    for (const l of LEVELS) expect(screen.getByRole("columnheader", { name: new RegExp(l.name) })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Descripción:/ })).toHaveLength(4);
  });

  it("crear exige confirmar en el diálogo y envía las celdas editadas", async () => {
    apiPost.mockResolvedValueOnce(previewFor([G1]));
    await loadCourse();
    fireEvent.click(screen.getByRole("checkbox", { name: /RA1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));
    const cell = await screen.findByRole("textbox", { name: /Descripción: RA1 – Analiza estados financieros — Destacado/ });
    fireEvent.change(cell, { target: { value: "Texto editado" } });

    fireEvent.click(screen.getByRole("button", { name: /Crear en Brightspace/ }));
    const dialog = await screen.findByRole("dialog");
    expect(apiPost).toHaveBeenCalledTimes(1); // abrir el diálogo no crea nada

    // Cancelar no llama al API
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiPost).toHaveBeenCalledTimes(1);

    apiPost.mockResolvedValueOnce({
      rubricId: "55", name: "R", state: "draft", partial: true, alignedCount: 0, totalCriteria: 1,
      criteria: [{ criterionId: "101", criterionName: "RA1 – Analiza estados financieros", outcomeId: G1, aligned: false, error: "403: la rúbrica está bloqueada" }],
      brightspaceUrl: "https://bs.test/d2l/lp/rubrics/list.d2l?ou=10", brightspaceUrlBestEffort: true,
      nextStep: "Asóciala desde la tarea en Brightspace.",
    });
    fireEvent.click(screen.getByRole("button", { name: /Crear en Brightspace/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Sí, crear rúbrica/ }));

    await screen.findByText(/solo 0\/1 criterios quedaron alineados/);
    expect(apiPost).toHaveBeenCalledTimes(2);
    const [url, body] = apiPost.mock.calls[1];
    expect(url).toBe("/gemelo/course/10/rubrics");
    expect(body).toMatchObject({ confirm: true, outcomeIds: [G1], publish: false });
    expect(body.cells).toEqual([{ outcomeId: G1, levelIndex: 3, description: "Texto editado" }]);
    expect(screen.getByText(/bloqueada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /herramienta Rúbricas/ })).toHaveAttribute("href", "https://bs.test/d2l/lp/rubrics/list.d2l?ou=10");
  });

  it("muestra el mensaje de scope faltante (403 missing_scope)", async () => {
    apiPost.mockResolvedValueOnce(previewFor([G1]));
    await loadCourse();
    fireEvent.click(screen.getByRole("checkbox", { name: /RA1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vista previa" }));
    await screen.findByRole("rowheader", { name: /RA1/ });
    apiPost.mockRejectedValueOnce(Object.assign(new Error("HTTP 403"), {
      status: 403, body: { detail: { reason: "missing_scope", message: "Falta el scope rubrics:objects:write." } },
    }));
    fireEvent.click(screen.getByRole("button", { name: /Crear en Brightspace/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Sí, crear rúbrica/ }));
    const alert = await screen.findByText(/No se pudo crear la rúbrica/);
    expect(alert.closest("[role=alert]")).toHaveTextContent("outcomes:alignments:manage");
  });
});

describe("validateRubricDraft", () => {
  it("valida nombre, RA y niveles", () => {
    const ok = { name: "R", selected: [G1], levels: LEVELS };
    expect(validateRubricDraft(ok)).toBeNull();
    expect(validateRubricDraft({ ...ok, selected: [] })).toMatch(/entre 1 y 30/);
    expect(validateRubricDraft({ ...ok, levels: LEVELS.slice(0, 1) })).toMatch(/entre 2 y 6/);
    expect(validateRubricDraft({ ...ok, levels: [{ name: "A", points: 2 }, { name: "B", points: 1 }] })).toMatch(/no pueden disminuir/);
    expect(validateRubricDraft({ ...ok, levels: [{ name: "A", points: 1 }, { name: "a", points: 2 }] })).toMatch(/únicos/);
    expect(validateRubricDraft({ ...ok, levels: [{ name: "A", points: "" }, { name: "B", points: 2 }] })).toMatch(/puntaje/);
  });
});
