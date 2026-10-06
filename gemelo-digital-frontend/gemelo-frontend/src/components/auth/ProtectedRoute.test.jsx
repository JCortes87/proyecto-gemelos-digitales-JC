// @vitest-environment jsdom
// ProtectedRoute: estado "verificando", redirección a /login sin sesión y
// redirección por rol (incluido el usuario con doble rol).
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { AuthContext } from "../../context/useAuth";

function auth(overrides = {}) {
  return {
    authUser: { user_name: "Ana" },
    authChecked: true,
    allRoles: ["student"],
    isDualRole: false,
    ...overrides,
  };
}

function montar(value, { path = "/dashboard", allowedRoles = ["instructor"] } = {}) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>selector de rol</div>} />
          <Route path="/login" element={<div>pantalla de login</div>} />
          <Route path="/portal" element={<div>portal estudiante</div>} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute allowedRoles={allowedRoles}><div>tablero docente</div></ProtectedRoute>}
          />
          <Route
            path="/solo-estudiantes"
            element={<ProtectedRoute allowedRoles={["student"]}><div>contenido de estudiante</div></ProtectedRoute>}
          />
          <Route
            path="/libre"
            element={<ProtectedRoute><div>zona sin restricción de rol</div></ProtectedRoute>}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("mientras se verifica la sesión muestra el estado de carga", () => {
    montar(auth({ authChecked: false, authUser: null }));
    expect(screen.getByText(/Verificando sesión/)).toBeInTheDocument();
    expect(screen.queryByText("tablero docente")).not.toBeInTheDocument();
  });

  it("sin usuario redirige a /login", () => {
    montar(auth({ authUser: null }));
    expect(screen.getByText("pantalla de login")).toBeInTheDocument();
  });

  it("docente con rol permitido ve el contenido", () => {
    montar(auth({ allRoles: ["instructor"] }));
    expect(screen.getByText("tablero docente")).toBeInTheDocument();
  });

  it("estudiante que entra al tablero docente va a /portal", () => {
    montar(auth({ allRoles: ["student"] }));
    expect(screen.getByText("portal estudiante")).toBeInTheDocument();
    expect(screen.queryByText("tablero docente")).not.toBeInTheDocument();
  });

  it("docente que entra a una ruta solo de estudiantes va a /dashboard", () => {
    montar(auth({ allRoles: ["instructor"] }), { path: "/solo-estudiantes" });
    expect(screen.getByText("tablero docente")).toBeInTheDocument();
    expect(screen.queryByText("contenido de estudiante")).not.toBeInTheDocument();
  });

  it("doble rol accede si CUALQUIERA de sus roles está permitido", () => {
    montar(auth({ allRoles: ["student", "instructor"], isDualRole: true }));
    expect(screen.getByText("tablero docente")).toBeInTheDocument();
  });

  it("doble rol sin acceso vuelve al selector de rol", () => {
    montar(auth({ allRoles: ["student", "instructor"], isDualRole: true }), { allowedRoles: ["admin"] });
    expect(screen.getByText("selector de rol")).toBeInTheDocument();
  });

  it("sin allowedRoles basta con estar autenticado", () => {
    montar(auth(), { path: "/libre" });
    expect(screen.getByText("zona sin restricción de rol")).toBeInTheDocument();
  });
});
