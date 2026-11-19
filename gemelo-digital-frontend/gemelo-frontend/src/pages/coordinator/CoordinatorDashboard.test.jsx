// @vitest-environment jsdom
// Integración del Panel Coordinador con la API simulada: catálogo → Buscar →
// carga batch en bloques → pestañas → drawer → "Abrir en vista docente" sin
// recargar la página.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../../utils/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { apiGet, apiPost } from "../../utils/api";
import { AuthContext } from "../../context/useAuth";
import CoordinatorDashboard from "../CoordinatorDashboard";

const CATALOG = Array.from({ length: 12 }, (_, i) => ({
  id: 100 + i, name: `202610 PREGRADO Curso ${i}`, code: `C${i}`, roleName: "Instructor",
}));

function summaryFor(ou) {
  if (ou === 105) return { error: "forbidden" };
  return {
    orgUnitId: ou,
    teachers: [{ userId: ou % 2 ? 1 : 2, name: ou % 2 ? "Ana Pérez" : "Beto Ruiz", email: null, roleName: "Instructor", lastAccess: null }],
    gradeReporting: {
      usesCortes: true, gradeItemsTotal: 5, missingCortes: [3],
      cortes: [
        { period: 1, itemId: 1, name: "Corte 1", status: "publicado", pct: 100, studentsTotal: 10, studentsWithGrade: 10, dueDate: null },
        { period: 2, itemId: 2, name: "Corte 2", status: "vencido_sin_reporte", pct: 0, studentsTotal: 10, studentsWithGrade: 0, dueDate: "2026-09-01T00:00:00Z" },
      ],
    },
    content: { modules: 2, topics: 3, hiddenTopics: 0, topicsByType: { file: 3, link: 0, lti: 0, other: 0 }, lastModified: null },
    activities: { assignments: 1, quizzes: 0, discussions: 1, notes: [] },
    gradingBacklog: { pending: 2, foldersWithPending: 1, oldestPendingDays: 9 },
    risk: { studentsCount: 10, avgCurrentPerformancePct: 65, avgCoveragePct: 70, riskDistribution: { alto: 1, medio: 1, bajo: 8 },
      studentsAtRisk: [{ userId: 7, displayName: "Eva Gómez", risk: "alto", currentPerformancePct: 30 }] },
    generatedAt: "2026-10-06T12:00:00Z",
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="dashboard">dashboard {loc.state?.orgUnitId}</div>;
}

function renderPage() {
  const auth = { logout: vi.fn() };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/coordinator"]}>
        <Routes>
          <Route path="/coordinator" element={<CoordinatorDashboard />} />
          <Route path="/dashboard" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

// Integración con varias fases (semestres → cursos → lotes): más lenta en frío.
describe("CoordinatorDashboard", { timeout: 30_000 }, () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ items: CATALOG });
    apiPost.mockImplementation(async (_path, body) => ({
      items: Object.fromEntries(body.orgUnitIds.map((ou) => [String(ou), summaryFor(ou)])),
    }));
    sessionStorage.clear();
  });

  it("carga en bloques de 10, agrega por profesor y abre el curso sin recargar", async () => {
    const user = userEvent.setup();
    renderPage();
    const buscar = await screen.findByRole("button", { name: "Buscar cursos" });
    await waitFor(() => expect(buscar).not.toBeDisabled());
    await user.click(buscar);

    await screen.findByRole("heading", { name: "Ana Pérez" });
    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(apiPost.mock.calls[0][0]).toBe("/gemelo/coordinator/summary/batch");
    expect(apiPost.mock.calls[0][1].orgUnitIds).toHaveLength(10);
    expect(apiPost.mock.calls[1][1].orgUnitIds).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Beto Ruiz" })).toBeInTheDocument();

    // Curso con error: se informa (no queda "..." para siempre)
    await user.click(screen.getByRole("tab", { name: /Cursos/ }));
    expect(await screen.findByText(/Sin permiso para ver este curso/)).toBeInTheDocument();

    // Riesgo en varios cursos: Eva aparece en 11 cursos
    await user.click(screen.getByRole("tab", { name: /Estudiantes en riesgo/ }));
    const row = screen.getByRole("rowheader", { name: /Eva Gómez/ }).closest("tr");
    expect(within(row).getByText("11")).toBeInTheDocument();

    // Drawer + navegación interna
    await user.click(within(row).getAllByRole("button")[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Reporte de notas por corte")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Abrir en vista docente/ }));
    expect(await screen.findByTestId("dashboard")).toHaveTextContent("dashboard 100");
    expect(sessionStorage.getItem("gemelo_pending_org")).toBe("100");
  });

  it("marca con error los cursos de un bloque que falla", async () => {
    apiPost.mockRejectedValue(Object.assign(new Error("x"), { status: 500 }));
    const user = userEvent.setup();
    renderPage();
    const buscar = await screen.findByRole("button", { name: "Buscar cursos" });
    await waitFor(() => expect(buscar).not.toBeDisabled());
    await user.click(buscar);
    await user.click(screen.getByRole("tab", { name: /Cursos/ }));
    const errors = await screen.findAllByText(/No se pudo cargar el resumen \(HTTP 500\)/);
    expect(errors).toHaveLength(12);
    expect(screen.getByRole("button", { name: /Reintentar 12 con error/ })).toBeInTheDocument();
  });
});
