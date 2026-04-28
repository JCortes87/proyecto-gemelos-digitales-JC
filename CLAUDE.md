# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo with two main projects:

- **`gemelo-digital-frontend/gemelo-frontend/`** — React 19 SPA (Vite 8, no TypeScript)
- **`gemelo-digital-backend/`** — Python FastAPI backend (uvicorn)

The app is an edtech analytics dashboard for CESA (Colegio de Estudios Superiores de Administracion) called "Gemelo Digital". It integrates with Brightspace (D2L) LMS via OAuth/LTI for student and instructor analytics.

## Common Commands

All frontend commands run from `gemelo-digital-frontend/gemelo-frontend/`:

```bash
npm run dev        # Start Vite dev server (proxies API to localhost:8000)
npm run build      # Production build to dist/
npm run lint       # ESLint (flat config, ESLint 9)
npm run preview    # Preview production build
```

Backend (from `gemelo-digital-backend/`):
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

No test framework is configured in the frontend.

## Architecture

### Frontend Stack
- **React 19** + **React Router DOM v7** + **Vite 8** (plain JSX, no TypeScript)
- **Recharts** for chart visualizations
- **CSS-in-JS** via `src/styles/global.js` (~3600 lines injected at runtime with `injectStyles()`)
- No component library, no CSS modules, no Tailwind

### State Management — React Context (no Redux)
Five context providers nested in `App.jsx`:
1. **AuthContext** — JWT auth (token in localStorage as `gemelo_sid`), role detection, dual-role support
2. **CourseContext** — Selected course, student data, thresholds, learning outcomes
3. **ThemeContext** — Dark/light mode (CSS custom properties on `:root`)
4. **I18nContext** — Spanish/English translations (inline object, no i18n library). `t(key, fallback)` function
5. **ToastContext** — Toast notifications (info/success/warning/error)

### Routing & Roles
Routes in `App.jsx` are role-gated via `ProtectedRoute`:
- `/` → `RoleHome` (dual-role selector) or auto-redirect
- `/dashboard/*` → `TeacherDashboard` (instructor/admin)
- `/coordinator` → `CoordinatorDashboard` (instructor/admin)
- `/portal/*` → `StudentPortal` (student)

Pages are lazy-loaded with `React.lazy` + `Suspense`.

Users can have dual roles (student + instructor); detected from `/brightspace/courses/enrolled` role names.

### Authentication Flow
OAuth 2.0 via Brightspace. On callback, hash contains `#gemelo:{sid}:{orgUnitId}:{isFirstLogin}`. Token stored in `localStorage` as `gemelo_sid`, sent as `Bearer` header.

### API Layer (`src/utils/api.js`)
- `apiGet(path, opts)` — GET with bearer token
- `apiDownloadUrl(path)` — Download URL with sid as query param
- `mapLimit(arr, limit, mapper)` — Concurrent async mapping

Dev proxy in `vite.config.js` forwards `/gemelo`, `/brightspace`, `/auth`, `/lti`, `/health`, `/debug`, `/.well-known`, `/speech` to `http://localhost:8000`.

### Key Directories (under `gemelo-digital-frontend/gemelo-frontend/src/`)
- `components/auth/` — LoginScreen, ProtectedRoute
- `components/dashboard/` — SmartAlerts, CourseTrends, DueDateCalendar, AINarrativeSummary, GradePredictions, EvidenceReports
- `components/student-detail/` — Student profile and analytics
- `components/ui/` — Shared: Breadcrumb, CommandPalette, ErrorBoundary, StudentAvatar, LastUpdated, ContextualTip
- `context/` — All 5 context providers
- `hooks/` — useMediaQuery, useCompactMode, useStudentChat, useStudentNotes, useCourseSnapshots, useKeyboardShortcuts
- `pages/` — RoleHome, TeacherDashboard, StudentPortal, CoordinatorDashboard
- `utils/` — api, helpers (risk calc, formatting), colors (status coloring), export (CSV), prediction, voice, speech
- `styles/global.js` — All CSS-in-JS styles with CSS custom properties for theming

### Styling Conventions
- All styles are CSS-in-JS in `styles/global.js`, injected once via `injectStyles()` in `App.jsx`
- Theming uses CSS custom properties (`--bg`, `--card`, `--text`, `--brand`, `--border`, etc.)
- Dark mode toggles `.dark` class on `document.documentElement`
- Responsive breakpoints: 1024px (tablet), 640px (mobile), 480px (small)
- Layout: fixed sidebar (220px) + topbar (56px) + scrollable main area

### Backend (`gemelo-digital-backend/`)
- FastAPI app at `app/main.py`
- Routes: `app/api/gemelo.py` (analytics), `app/api/lti.py` (LTI launch), `app/api/lti_keys.py`
- Services: `app/services/` — Brightspace API integration
- Config: `app/config_loader.py`, `config/`

## Environment Variables
- `VITE_API_BASE_URL` — Backend API endpoint (used in production builds)
- Dev server proxies API calls to `localhost:8000` (no env var needed for dev)

## Language
The UI is primarily in Spanish. Code comments mix Spanish and English. The i18n system supports `es` (default) and `en`.
