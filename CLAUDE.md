# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo with two main projects:

- **`gemelo-digital-frontend/gemelo-frontend/`** — React 19 SPA (Vite 8, no TypeScript)
- **`gemelo-digital-backend/`** — Python FastAPI backend (uvicorn)

The app is an edtech analytics dashboard for CESA (Colegio de Estudios Superiores de Administracion) called "Gemelo Digital". It integrates with Brightspace (D2L) LMS via OAuth/LTI for student and instructor analytics.

Git remotes: `jc` (JCortes87/proyecto-gemelos-digitales-JC) is the production line (`jc/main`); `origin` (juandavid639/Proyecto-Gemelos-Digitales) is a secondary copy.

## Common Commands

All frontend commands run from `gemelo-digital-frontend/gemelo-frontend/`:

```bash
npm run dev        # Vite dev server on :5173 (proxies API to https://localhost:8000)
npm run build      # Production build to dist/
npm run lint       # ESLint 9 flat config — keep it at 0 errors / 0 warnings
npm test           # Vitest + jsdom (+ React Testing Library)
npm run preview    # Preview production build
```

Backend (from `gemelo-digital-backend/`):
```bash
pip install -r requirements-dev.txt      # app + test deps (versions pinned)
alembic upgrade head                     # schema is managed by Alembic only
uvicorn main:app --reload --port 8000 --ssl-keyfile localhost-key.pem --ssl-certfile localhost-cert.pem
python -m pytest -q                      # tests never hit the real DB or network
```

The entry point is `main.py` at the backend root (`main:app`), not `app/main.py`. In Docker, `start.sh` runs `alembic upgrade head` and then uvicorn.

Local Postgres is the docker container `gemelo-pg` on port 5433 (it shares that port with other projects' containers).

## Architecture

### Frontend Stack
- **React 19** + **React Router DOM v7** + **Vite 8** (plain JSX, no TypeScript)
- **Recharts** for chart visualizations
- **CSS-in-JS** via `src/styles/global.js` (injected at runtime with `injectStyles()`)
- No component library, no CSS modules, no Tailwind

### State Management — React Context (no Redux)
Five context providers nested in `App.jsx` (`context/*Context.jsx`). Their hooks live in separate files (`context/useAuth.js`, `useCourse.js`, `useI18n.js`, `useTheme.js`, `useToast.js`) so Fast Refresh works:
1. **AuthContext** — session (sid in localStorage as `gemelo_sid`), role detection, dual-role support, `logout()`
2. **CourseContext** — Selected course, student data, thresholds, learning outcomes
3. **ThemeContext** — Dark/light mode (CSS custom properties on `:root`)
4. **I18nContext** — `t(key, fallback)`. The UI is Spanish-only: the language selector was removed and the locale is forced to `es`
5. **ToastContext** — Toast notifications (info/success/warning/error)

### Routing & Roles
Routes in `App.jsx` are role-gated via `ProtectedRoute`:
- `/` → `RoleHome` (dual-role selector) or auto-redirect
- `/dashboard/*` → `TeacherDashboard` (instructor/admin)
- `/coordinator` → `CoordinatorDashboard` (instructor/admin)
- `/portal/*` → `StudentPortal` (student)

Pages are lazy-loaded with `React.lazy` + `Suspense`. Users can have dual roles (student + instructor); detected from `/brightspace/courses/enrolled` role names.

### Authentication Flow
OAuth 2.0 via Brightspace (signed + expiring `state`, bound to a nonce cookie when available). On callback, the hash contains `#gemelo:{sid}:{orgUnitId}:{isFirstLogin}`. The sid is stored in `localStorage` as `gemelo_sid` and sent as a `Bearer` header. Never read `gemelo_sid` directly: use the helpers in `utils/api.js`. LTI 1.3 launches only accept RS256 id_tokens.

### API Layer (`src/utils/api.js`)
- `apiGet` / `apiPost` / `apiPut` / `apiDownload` — share one internal `request()` helper and throw `ApiError` (`.status`, `.body`)
- `getSessionId` / `setSessionId` / `clearSessionId` / `authHeaders` — the only way to touch the session id
- Global 401 handling: clears the session and emits `gemelo:unauthorized` (AuthContext subscribes via `onUnauthorized`)
- `mapLimit(arr, limit, mapper)` — concurrent async mapping

Dev proxy in `vite.config.js` forwards `/gemelo`, `/brightspace`, `/auth`, `/lti`, `/health`, `/debug`, `/.well-known`, `/speech` to `https://localhost:8000` (self-signed cert, `secure: false`).

### Key Directories (under `gemelo-digital-frontend/gemelo-frontend/src/`)
- `components/auth/` — LoginScreen, ProtectedRoute
- `components/dashboard/` — SmartAlerts, CourseTrends, DueDateCalendar, AINarrativeSummary, GradePredictions, EvidenceReports, AssignmentsPanel
- `components/ui/` — Shared: Dialog (accessible modal: focus trap, Esc), Breadcrumb, CommandPalette, ErrorBoundary, StudentAvatar, StatusBadge/severity, ContextualTip
- `context/` — the 5 providers and their `use*` hooks
- `hooks/` — useMediaQuery, useCompactMode, useStudentChat, useStudentNotes, useCourseSnapshots, useKeyboardShortcuts
- `pages/` — RoleHome, TeacherDashboard, StudentPortal, CoordinatorDashboard, LearningOutcomesAdmin
- `pages/teacher/` — TeacherDashboard pieces (layout, tabs, drawer, modals, panels, primitives) and `hooks/` for its data loaders
- `pages/learning-outcomes/` — LearningOutcomesAdmin tabs, panels and hooks
- `utils/` — api, helpers (risk calc, formatting), colors, export (CSV with formula-injection protection), prediction, voice, speech
- `styles/global.js` — global CSS with theme tokens

### Styling Conventions
- Theming uses CSS custom properties (`--bg`, `--card`, `--text`, `--brand`, `--border`, plus semantic tokens) defined for light and dark in `styles/global.js`. Don't hard-code hex colors in components; add a token with both values instead
- Dark mode toggles the `.dark` class on `document.documentElement`
- Responsive breakpoints: 1024px (tablet), 640px (mobile), 480px (small)
- Layout: fixed sidebar (220px) + topbar (56px) + scrollable main area
- Interactive elements must be real buttons or have role/tabIndex/keyboard handlers; modals should use `ui/Dialog`

### Backend (`gemelo-digital-backend/`)
- `main.py` — FastAPI app, `lifespan` (table check at startup; closes the shared HTTP client and flushes the session queue at shutdown), middlewares (CORS, security headers, request-id), SPA serving from `../frontend_dist`
- `app/config.py` — single `Settings` object; the only place that reads environment variables
- `app/security.py` — strict secret loading (`SESSION_SECRET`, `LTI_STATE_SECRET` are required when `TOOL_BASE_URL` is https)
- `app/api/` — `gemelo*.py` (analytics/admin/outcomes), `auth_routes.py` (OAuth), `lti.py`/`lti_keys.py`, `course_auth.py` (per-course authorization, fail-closed), `brightspace/` (Brightspace proxy split by domain; `brightspace_proxy.py` is a re-export shim)
- `app/services/` — `brightspace_client.py` (shared httpx client + retries + token refresh), `brightspace/` (proxy business logic), `gemelo/` (GemeloService mixins; `gemelo_service.py` is the facade), `sync_service.py`, `session_store_db.py` (sessions in Postgres: hashed id, Fernet-encrypted data, ordered write queue)
- `app/request_id.py` — `X-Request-ID` per request; 500 responses return `requestId` instead of exception details
- `alembic/` — migrations; never create tables with `create_all` at runtime
- Sync DB access from async code must go through `asyncio.to_thread`

## Environment Variables
- Frontend: `VITE_API_BASE_URL` — backend URL for production builds (`.env.production`); leave it empty in dev (see `.env.example`). Every `VITE_*` value ends up in the public bundle
- Backend: see `gemelo-digital-backend/.env.example` and `app/config.py`

## Language
The UI is in Spanish. Code comments mix Spanish and English (new comments are usually Spanish).
