# Taskbeard AI Coding Instructions

## Big Picture
- This project is a YAML-backed planner: FastAPI serves normalized planner data from `data/*.yaml`, and React renders a timeline board.
- Backend composition happens in `backend/app/main.py` (`YamlStore` + `PlannerService` + `EventBroker` + file watcher).
- Frontend reads a single aggregated payload from `GET /api/planner` (`frontend/src/services/plannerApi.ts`) rather than assembling data client-side.
- Live refresh is event-driven: `backend/app/services/file_watch_service.py` publishes SSE events; frontend subscribes via `EventSource("/events")`.

## Service Boundaries and Data Flow
- Persisted state is only the YAML files under `data/`; derived fields (`dates`, `dependency_warnings`, `student_task_map`) are computed in `PlannerService.read_all()`.
- `YamlStore` enforces an allowlist (`FILE_KEYS`) and root schema type (`ROOT_KEY_TYPES`) in `backend/app/services/yaml_store.py`.
- If you add a new config YAML, update both `FILE_KEYS` and `ROOT_KEY_TYPES` or writes/reads will fail.
- Task APIs normalize polymorphic fields (`teams`, `depends_on`, `assigned_to`) to `string[]` internally and serialize back as `null|string|string[]` (`backend/app/api/tasks.py`).
- Priority aliases are canonicalized to `need|want|nice` in both API and planner service; keep this behavior consistent.

## Backend Patterns
- Any endpoint that mutates YAML should publish a broker event (`{"type":"file_changed", ...}`) so connected clients refresh.
- Keep path resolution rooted at repo `data/` via `_repo_root()` in `backend/app/main.py`; do not hardcode absolute paths.
- Config editing supports both JSON payload writes (`PUT /api/config/{name}`) and raw YAML text validation (`PUT /api/config/{name}/yaml`).
- Dependency logic is warning-only (no blocking constraints), implemented in `PlannerService._dependency_warnings()`.

## Frontend Patterns
- Main orchestration is in `frontend/src/App.tsx`: optimistic task edits, undo/redo stacks, then `putTasks()` + `refresh()`.
- Board interactions live in `frontend/src/components/TimelineGrid.tsx` (drag/drop, resize, copy-to-team via `Alt` drag).
- Config editing is intentionally text-first (`frontend/src/pages/ConfigPage.tsx`) using `js-yaml` syntax checks before API calls.
- Team color behavior expects ordered `colors: [{fg,bg}, ...]` palettes (see `frontend/src/services/teamColors.ts` and `docs/data-model.md`).

## Critical Workflows
- Install deps: `uv sync` (root) and `npm install` (in `frontend/` if needed).
- Run both servers with process management: `uv run start`; stop with `uv run stop`; restart with `uv run restart` (implemented in `main.py`).
- Backend-only run: `uv run uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000`.
- Tests: `uv run pytest` for backend, `npm test` in `frontend/` for Vitest.

## Change Safety Checklist
- Preserve canonical task/member normalization (`teams` etc. always treated as lists in runtime payloads).
- Keep API contracts in sync with `frontend/src/services/plannerApi.ts` types when changing backend response shapes.
- When changing YAML schema expectations, update tests under `tests/backend/` first (especially `test_yaml_store.py`, `test_tasks_polymorphic.py`, `test_planner_service.py`).
