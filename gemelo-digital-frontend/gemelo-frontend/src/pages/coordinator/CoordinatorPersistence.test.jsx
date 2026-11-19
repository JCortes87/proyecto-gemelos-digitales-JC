// @vitest-environment jsdom
// Persistencia de la última consulta del Panel Coordinador: restaurar al
// entrar (sin red), "Completar faltantes", "Actualizar todo" (refresh sin
// vaciar la vista), "Descartar" y guardado de una búsqueda nueva. El almacén
// (IndexedDB) se simula.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const store = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), clear: vi.fn(), available: true }));

vi.mock("../../utils/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));
vi.mock("./lastQueryStore", async (importOriginal) => ({
  ...(await importOriginal()),
  lastQueryStore: store,
}));

import { apiGet, apiPost } from "../../utils/api";
import { AuthContext } from "../../context/useAuth";
import CoordinatorDashboard from "../CoordinatorDashboard";
import { buildRecord } from "./lastQueryStore";

const CATALOG = Array.from({ length: 12 }, (_, i) => ({
  id: 100 + i, name: `202610 PREGRADO Curso ${i}`, code: `C${i}`, roleName: "Instructor",
}));

function summaryFor(ou, teacher = ou % 2 ? "Ana Pérez" : "Beto Ruiz") {
  return {
    orgUnitId: ou,
    teachers: [{ userId: teacher === "Carla Díaz" ? 3 : ou % 2 ? 1 : 2, name: teacher, email: null, roleName: "Instructor", lastAccess: null }],
    gradeReporting: { usesCortes: true, gradeItemsTotal: 3, missingCortes: [], cortes: [] },
    content: { modules: 2, topics: 8, hiddenTopics: 0, topicsByType: { file: 8, link: 0, lti: 0, other: 0 }, lastModified: null },
    activities: { assignments: 1, quizzes: 0, discussions: 1, notes: [] },
    gradingBacklog: { pending: 0, foldersWithPending: 0, oldestPendingDays: null },
    risk: { studentsCount: 10, avgCurrentPerformancePct: 70, avgCoveragePct: 80, riskDistribution: { alto: 0, medio: 1, bajo: 9 }, studentsAtRisk: [] },
    generatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  };
}

// Consulta guardada: 12 cursos, 105 con error y 111 sin resumen (2 faltantes).
function savedRecord() {
  const summaries = {};
  for (const c of CATALOG) {
    if (c.id === 111) continue;
    summaries[String(c.id)] = c.id === 105 ? { error: "No se pudo cargar el resumen (HTTP 500)" } : summaryFor(c.id);
  }
  return buildRecord({
    userId: 42,
    filters: { semester: "", semesterLabel: "202610 Pregrado", category: "all", search: "" },
    courses: CATALOG, summaries, now: Date.now() - 2 * 3_600_000,
  });
}

function renderPage() {
  const auth = { logout: vi.fn(), authUser: { user_id: 42 } };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/coordinator"]}>
        <Routes>
          <Route path="/coordinator" element={<CoordinatorDashboard />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function batchReply(body, teacher) {
  return { items: Object.fromEntries(body.orgUnitIds.map((ou) => [String(ou), summaryFor(ou, teacher)])) };
}

describe("CoordinatorDashboard · última consulta guardada", { timeout: 30_000 }, () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    store.load.mockReset();
    store.save.mockReset();
    store.clear.mockReset();
    apiGet.mockResolvedValue({ items: CATALOG });
    apiPost.mockImplementation(async (_path, body) => batchReply(body));
    store.save.mockResolvedValue(true);
    store.clear.mockResolvedValue(true);
    sessionStorage.clear();
  });

  it("restaura la consulta al entrar sin pedir resúmenes y muestra el aviso", async () => {
    store.load.mockResolvedValue(savedRecord());
    const user = userEvent.setup();
    renderPage();

    const banner = (await screen.findByText(/Mostrando la última consulta/)).closest("[role=status]");
    expect(store.load).toHaveBeenCalledWith(42);
    expect(banner).toHaveTextContent("202610 Pregrado");
    expect(banner).toHaveTextContent("12 cursos");
    expect(banner).toHaveTextContent("guardada hace 2 h");
    expect(within(banner).getByRole("button", { name: "Completar faltantes (2)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();

    // Frescura por curso en el drawer.
    await user.click(screen.getByRole("tab", { name: /Cursos/ }));
    await user.click(screen.getByRole("button", { name: /Curso 0/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Actualizado hace 3 h/)).toBeInTheDocument();
  });

  it("'Completar faltantes' solo pide los cursos sin resumen o con error y guarda", async () => {
    store.load.mockResolvedValue(savedRecord());
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Completar faltantes (2)" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /Completar faltantes/ })).not.toBeInTheDocument());
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0][1]).toEqual({ orgUnitIds: [105, 111] });

    await waitFor(() => expect(store.save).toHaveBeenCalled(), { timeout: 3000 });
    const rec = store.save.mock.calls.at(-1)[0];
    expect(rec.userId).toBe("42");
    expect(rec.complete).toBe(true);
    expect(Object.keys(rec.summaries)).toHaveLength(12);
  });

  it("'Actualizar todo' envía refresh:true y no vacía las filas mientras carga", async () => {
    store.load.mockResolvedValue(savedRecord());
    const pending = [];
    apiPost.mockImplementation((_path, body) => new Promise((resolve) => { pending.push({ body, resolve }); }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Actualizar todo" }));

    await waitFor(() => expect(pending.length).toBe(2));
    expect(pending.every((p) => p.body.refresh === true)).toBe(true);
    expect(pending.flatMap((p) => p.body.orgUnitIds)).toHaveLength(12);
    // Se siguen viendo los datos anteriores y la barra de progreso.
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar todo" })).toBeDisabled();

    // Llega el primer lote: se reemplaza curso por curso.
    pending[0].resolve(batchReply(pending[0].body, "Carla Díaz"));
    expect(await screen.findByRole("heading", { name: "Carla Díaz" })).toBeInTheDocument();
    // Beto conserva el curso 110 (segundo lote, aún con datos anteriores).
    expect(screen.getByRole("heading", { name: "Beto Ruiz" })).toBeInTheDocument();
    pending[1].resolve(batchReply(pending[1].body, "Carla Díaz"));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Beto Ruiz" })).not.toBeInTheDocument());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("'Descartar' borra la consulta guardada y vuelve al estado vacío", async () => {
    store.load.mockResolvedValue(savedRecord());
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(store.clear).toHaveBeenCalledWith(42);
    expect(screen.getByText("Selecciona los filtros y busca")).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando la última consulta/)).not.toBeInTheDocument();
  });

  it("una búsqueda nueva reemplaza la consulta guardada", async () => {
    store.load.mockResolvedValue(null);
    const user = userEvent.setup();
    renderPage();
    const buscar = await screen.findByRole("button", { name: "Buscar cursos" });
    await waitFor(() => expect(buscar).not.toBeDisabled());
    await user.click(buscar);
    await screen.findByRole("heading", { name: "Ana Pérez" });

    await waitFor(() => expect(store.save.mock.calls.some(([r]) => r.complete)).toBe(true), { timeout: 3000 });
    const rec = store.save.mock.calls.at(-1)[0];
    expect(rec.courses).toHaveLength(12);
    expect(rec.filters).toHaveProperty("semesterLabel");
    expect(screen.queryByText(/Mostrando la última consulta/)).not.toBeInTheDocument();
  });
});
