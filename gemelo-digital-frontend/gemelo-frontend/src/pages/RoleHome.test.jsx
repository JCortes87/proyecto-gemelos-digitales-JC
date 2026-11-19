// @vitest-environment jsdom
// Filtro de período del inicio docente: semestres reales de Brightspace,
// selección por defecto (último pregrado/posgrado), caché por semestre y
// tope de 60 tarjetas con "Mostrar más".
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../utils/api", async (importOriginal) => ({
  ...(await importOriginal()),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { apiGet } from "../utils/api";
import { AuthContext } from "../context/useAuth";
import RoleHome from "./RoleHome";

// Catálogo de inscripciones: solo cursos viejos (el nombre no trae el semestre actual).
const CATALOG = [
  { id: 1, name: "Curso viejo 202510", code: "OLD1", roleName: "Instructor", isActive: false },
  { id: 2, name: "Curso viejo 202520", code: "OLD2", roleName: "Instructor", isActive: false },
];

const SEMESTERS = [
  { id: 900, code: "202631", name: "202631 DIPLOMADOS" },
  { id: 901, code: "202620", name: "202620 2DO PREGRADO / POSGRADO" },
  { id: 902, code: "202615", name: "202615 1ER PREGRADO / POSGRADO" },
];

const COURSES_901 = Array.from({ length: 70 }, (_, i) => ({
  id: 5000 + i,
  name: `Finanzas ${String(i).padStart(2, "0")}`,
  code: `FIN${i}`,
  semesterCode: "202620",
  roleName: "Instructor",
}));
const COURSES_902 = [
  { id: 6001, name: "Mercadeo I", code: "MER1", semesterCode: "202615", roleName: "Instructor" },
  { id: 6002, name: "Mercadeo II", code: "MER2", semesterCode: "202615", roleName: "Instructor" },
];

function semesterCalls(id) {
  return apiGet.mock.calls.filter(([p]) => p === `/gemelo/coordinator/courses?semesterId=${id}`).length;
}

function courseCards() {
  return screen.queryAllByRole("button", { name: /^Abrir curso / });
}

function renderPage() {
  const auth = {
    authUser: { user_name: "Ana Pérez", all_roles: ["Instructor"] },
    logout: vi.fn(),
    isInstructor: true,
    isStudent: false,
    isDualRole: false,
    isSuperAdmin: false,
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <RoleHome />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RoleHome · filtro de período docente", { timeout: 30_000 }, () => {
  beforeEach(() => {
    apiGet.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    apiGet.mockImplementation(async (path) => {
      if (path.startsWith("/brightspace/courses/enrolled")) return { items: CATALOG };
      if (path.startsWith("/brightspace/semesters")) return { items: SEMESTERS };
      if (path === "/gemelo/coordinator/courses?semesterId=901") return { count: 70, items: COURSES_901 };
      if (path === "/gemelo/coordinator/courses?semesterId=902") return { count: 2, items: COURSES_902 };
      throw new Error(`ruta no simulada: ${path}`);
    });
  });

  it("elige por defecto el último pregrado/posgrado, limita a 60 y cachea por semestre", async () => {
    const user = userEvent.setup();
    renderPage();

    // Por defecto: 202620 PREGRADO / POSGRADO (no el diplomado más reciente).
    const select = await screen.findByRole("combobox", { name: "Filtrar por período" });
    expect(select).toHaveValue("sem:901");
    expect(screen.getByRole("option", { name: "Todos mis cursos" })).toBeInTheDocument();

    // Tope de 60 tarjetas + "Mostrar más".
    await waitFor(() => expect(courseCards()).toHaveLength(60));
    expect(screen.getByText("Finanzas 00")).toBeInTheDocument();
    expect(screen.queryByText("Curso viejo 202510")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mostrar más/ }));
    expect(courseCards()).toHaveLength(70);
    expect(screen.queryByRole("button", { name: /Mostrar más/ })).not.toBeInTheDocument();
    expect(semesterCalls(901)).toBe(1);

    // Cambiar de semestre consulta ese semestre una sola vez.
    await user.selectOptions(select, "sem:902");
    await screen.findByText("Mercadeo I");
    expect(courseCards()).toHaveLength(2);
    expect(semesterCalls(902)).toBe(1);

    // Volver al anterior es instantáneo (caché) y el tope se reinicia.
    await user.selectOptions(select, "sem:901");
    expect(courseCards()).toHaveLength(60);
    await user.selectOptions(select, "sem:902");
    expect(courseCards()).toHaveLength(2);
    expect(semesterCalls(901)).toBe(1);
    expect(semesterCalls(902)).toBe(1);

    // "Todos mis cursos" vuelve al catálogo de inscripciones.
    await user.selectOptions(select, "all");
    expect(screen.getByText("Curso viejo 202510")).toBeInTheDocument();
    expect(courseCards()).toHaveLength(2);
  });

  it("la búsqueda se aplica sobre los cursos del período", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(courseCards()).toHaveLength(60));
    await user.type(screen.getByRole("textbox", { name: /Buscar cursos/ }), "Finanzas 6");
    await waitFor(() => expect(courseCards()).toHaveLength(10));
    expect(screen.queryByRole("button", { name: /Mostrar más/ })).not.toBeInTheDocument();
  });

  it("sin semestres disponibles usa 'Todos mis cursos' y el respaldo por código en el nombre", async () => {
    apiGet.mockImplementation(async (path) => {
      if (path.startsWith("/brightspace/courses/enrolled")) return { items: CATALOG };
      if (path.startsWith("/brightspace/semesters")) throw new Error("caído");
      throw new Error(`ruta no simulada: ${path}`);
    });
    const user = userEvent.setup();
    renderPage();
    const select = await screen.findByRole("combobox", { name: "Filtrar por período" });
    expect(select).toHaveValue("all");
    await user.selectOptions(select, "code:202520");
    expect(screen.getByText("Curso viejo 202520")).toBeInTheDocument();
    expect(courseCards()).toHaveLength(1);
    expect(apiGet.mock.calls.some(([p]) => p.startsWith("/gemelo/coordinator/courses"))).toBe(false);
  });
});
