import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AuthContext } from "./useAuth";
import { apiUrl, getSessionId, setSessionId, clearSessionId, authHeaders, onUnauthorized } from "../utils/api";


const ROLES_INSTRUCTOR = new Set(["instructor", "coordinador administrativo", "super administrator"]);
const ROLES_STUDENT = new Set(["estudiante ef"]);

// Map a single Brightspace role string to app role.
// FAIL-CLOSED (18 ago 2026): ante un rol desconocido o vacío se asume
// "student" — el rol con MENOS privilegios. Antes el default era
// "instructor", lo que le daba la vista docente a cualquier usuario cuyo
// rol no reconociéramos. El backend igual verifica el rol real por curso,
// pero la UI no debe abrir puertas de más.
function mapSingleRole(backendRole) {
  if (!backendRole) return null;
  const r = String(backendRole).toLowerCase().trim();
  if (ROLES_STUDENT.has(r) || r.includes("estudiante") || r.includes("student")) return "student";
  if (ROLES_INSTRUCTOR.has(r) || r.includes("instructor") || r.includes("admin") || r.includes("coordinador")) return "instructor";
  console.warn(`[AuthContext] Rol desconocido de Brightspace: "${backendRole}" — asignando "student" (fail-closed)`);
  return "student";
}

// Determine all app-level roles from backend all_roles array (fail-closed:
// sin roles conocidos → estudiante, nunca profesor por defecto)
function mapAllRoles(allRolesArray) {
  if (!Array.isArray(allRolesArray) || !allRolesArray.length) return ["student"];
  const appRoles = new Set();
  for (const r of allRolesArray) {
    const mapped = mapSingleRole(r);
    if (mapped) appRoles.add(mapped);
  }
  return appRoles.size > 0 ? Array.from(appRoles) : ["student"];
}

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [initialOrgUnitId, setInitialOrgUnitId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Read hash fragment from OAuth callback
        let _sid = null;
        let _hashOu = null;
        const _hash = window.location.hash;
        if (_hash.startsWith("#gemelo:")) {
          const parts = _hash.slice(1).split(":");
          if (parts.length >= 2) {
            _sid    = parts[1] || null;
            _hashOu = parts[2] && Number(parts[2]) > 0 ? Number(parts[2]) : null;
            const _fl = parts[3];
            if (_fl === "1") sessionStorage.setItem("gemelo_first_login", "1");
          }
          window.history.replaceState(null, "", window.location.pathname + window.location.search);

          // Popup OAuth flow: si este tab fue abierto como popup por LoginScreen,
          // le avisamos al padre con el token y cerramos. El padre (main window)
          // almacena el SID y hace reload. De este modo el main window nunca sale
          // de gemelo.cesa.edu.co durante el flujo OAuth.
          if (_sid && window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(
                { type: "gemelo-auth", sid: _sid, orgUnitId: _hashOu, firstLogin: parts[3] === "1" },
                window.location.origin,
              );
            } catch { /* noop */ }
            // Dar 300ms para que el mensaje llegue antes de cerrar
            setTimeout(() => window.close(), 300);
            return; // No seguir inicializando el contexto en la ventana popup
          }
        }

        if (!_sid) _sid = getSessionId();
        if (_sid) {
          setSessionId(_sid);
          localStorage.removeItem("gemelo_oauth_pending"); // limpiar bandera de retry
        }

        if (_hashOu) {
          setInitialOrgUnitId(_hashOu);
          // Entrada embebida (LTI dentro de un curso): el callback OAuth trae
          // el orgUnitId en el hash. Se persiste para que RoleHome salte
          // directo al dashboard de ese curso (gemelo_lti_org se consume una
          // sola vez) y para que el dashboard lo lea aun tras un F5.
          sessionStorage.setItem("gemelo_lti_org", String(_hashOu));
          sessionStorage.setItem("gemelo_pending_org", String(_hashOu));
        }

        // Call /auth/me (el sid va solo en el header Bearer, nunca en la URL)
        // Fetch directo (no apiGet): la respuesta de /auth/me se maneja aquí
        // mismo y no debe disparar el manejo global de 401.
        const res = await fetch(apiUrl("/auth/me"), {
          credentials: "include",
          headers: authHeaders(_sid),
        });
        const data = await res.json();
        if (data.authenticated) {
          // Initial roles from /auth/me (may be empty on first login before courses fetched)
          let allRolesRaw = data.all_roles || (data.role ? [data.role] : []);

          // Fetch enrolled courses to determine ALL roles from actual enrollments
          // This is the authoritative source: /enrollments/myenrollments/ returns
          // every course with its roleName, so we can detect dual-role users reliably.
          try {
            const coursesRes = await fetch(
              apiUrl(`/brightspace/courses/enrolled?active_only=false&limit=200`),
              {
                credentials: "include",
                headers: authHeaders(_sid),
              }
            );
            if (coursesRes.ok) {
              const coursesData = await coursesRes.json();
              const items = Array.isArray(coursesData?.items) ? coursesData.items : [];
              const rolesFromCourses = [...new Set(
                items.map(c => String(c.roleName || "").trim()).filter(r => r)
              )];
              if (rolesFromCourses.length > 0) {
                // Merge course roles with system roles from /auth/me
                // (system roles like "Super Administrator" don't appear in enrollments)
                allRolesRaw = [...new Set([...allRolesRaw, ...rolesFromCourses])];
              }
            }
          } catch {
            // If courses fetch fails, fall back to roles from /auth/me
          }

          const appRoles = mapAllRoles(allRolesRaw);
          const primaryRole = mapSingleRole(data.role) || appRoles[0];

          // SuperAdmin detection: env var list, backend role, or enrolled roles.
          // El backend detecta el rol de sistema por RoleId numérico y trata
          // igual a "Super Administrator" (105) y "Administrator" (116) —
          // _ADMIN_ROLES en gemelo.py autoriza ambos. Aquí replicamos eso:
          // match exacto de "administrator" (exacto para NO capturar roles de
          // curso como "Coordinador Administrativo").
          const superAdminIds = (import.meta.env?.VITE_SUPERADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
          const _sysRole = String(data.role || "").trim().toLowerCase();
          const isSuperAdmin =
            superAdminIds.includes(String(data.user_id)) ||
            allRolesRaw.some((r) => String(r).toLowerCase().includes("super admin")) ||
            allRolesRaw.some((r) => String(r).trim().toLowerCase() === "administrator") ||
            _sysRole.includes("super admin") ||
            _sysRole === "administrator";
          const user = {
            ...data,
            all_roles: allRolesRaw,
            appRole: primaryRole,
            appRoles, // ["instructor", "student"] for dual-role users
            isDualRole: appRoles.length > 1,
            isInstructor: appRoles.includes("instructor"),
            isStudent: appRoles.includes("student"),
            isSuperAdmin,
          };
          setAuthUser(user);

          const savedOu = sessionStorage.getItem("gemelo_pending_org");
          if (savedOu && Number(savedOu) > 0) {
            // NOTE: Don't remove the key — we need it to survive page
            // reloads (F5). Lazy-loaded pages (StudentPortal/TeacherDashboard)
            // may mount AFTER this effect runs, and their useState
            // initializers read sessionStorage directly. If we delete it
            // here, a hard refresh loses the course selection.
            setInitialOrgUnitId(Number(savedOu));
          }

          // Tutorial SOLO si nunca lo ha visto (gemelo_onboarded). La bandera
          // first_login del hash NO se usa como disparador: el backend la
          // manda en "1" en cada login, y con ella el tutorial (con su voz)
          // se relanzaba en cada entrada LTI.
          sessionStorage.removeItem("gemelo_first_login");
          const alreadyOnboarded = localStorage.getItem("gemelo_onboarded") === "1";
          if (!alreadyOnboarded) {
            setShowTutorial(true);
          }
        } else if (data.lti_detected) {
          const ou = data.org_unit_id || "";
          if (ou) sessionStorage.setItem("gemelo_pending_org", ou);
          const loginPath = ou
            ? apiUrl(`/auth/brightspace/login?org_unit_id=${ou}`)
            : apiUrl("/auth/brightspace/login");
          window.location.href = loginPath;
          return;
        }
      } catch {
        // offline / error -> show login
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  // Limpieza local de la sesión + vuelta a la pantalla de login. Compartida
  // por logout() y por el manejo global de 401 (que NO vuelve a llamar al
  // backend: la sesión ya es inválida allá).
  const redirectingRef = useRef(false);
  const resetSessionToLogin = useCallback(() => {
    clearSessionId();
    sessionStorage.clear();
    // Evita redirecciones repetidas si llegan varios 401 en paralelo
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    // Redirect to root (login) instead of reload to avoid 403 on SPA routes
    window.location.href = window.location.origin + "/";
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include", headers: authHeaders() });
    } catch { /* noop */ }
    resetSessionToLogin();
  }, [resetSessionToLogin]);

  // 401 global: utils/api emite "gemelo:unauthorized" cuando una llamada
  // autenticada es rechazada (sesión expirada/revocada) → volver al login.
  useEffect(() => onUnauthorized(() => resetSessionToLogin()), [resetSessionToLogin]);

  // Memoizado: sin esto el objeto value se recrea en cada render del provider
  // y TODOS los consumidores de useAuth() re-renderizan en cascada.
  const value = useMemo(() => ({
    authUser,
    authChecked,
    // Fail-closed: sin usuario cargado, el default es el rol con MENOS
    // privilegios (student), nunca instructor.
    role: authUser?.appRole || "student",
    allRoles: authUser?.appRoles || ["student"],
    isDualRole: authUser?.isDualRole || false,
    isInstructor: authUser?.isInstructor ?? false,
    isStudent: authUser?.isStudent ?? false,
    isSuperAdmin: authUser?.isSuperAdmin ?? false,
    logout,
    showTutorial,
    setShowTutorial,
    initialOrgUnitId,
  }), [authUser, authChecked, logout, showTutorial, initialOrgUnitId]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

