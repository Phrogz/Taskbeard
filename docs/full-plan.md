# Robotics Task Manager — Full Implementation Plan

## Objective
Build a web app that resembles the seasonal robotics planning sheet and supports team swimlanes, task scheduling, member assignments, and live updates from YAML files.

## Core Decisions
- Backend: Python + FastAPI.
- Frontend: React + TypeScript.
- Persistence: YAML files only (no SQL database).
- Sync: File watcher + Server-Sent Events (SSE) for live refresh when YAML is changed by UI, hand edits, or another user.
- Scheduling granularity: day-level.
- Auth: none for MVP.

## Requirements Coverage

### Configure
- Practice defaults: 2h Monday–Thursday, 4h Sunday.
- Events with date ranges and travel days.
- Teams (swimlanes) and lane colors.
- Members and team memberships.
- Breaks (Winterim, Spring Break).

### Edit
- Tasks per team(s), including cross-team tasks shown in multiple swimlanes.
- Optional task dependencies (warning only).
- Optional estimated hours used for auto spanning days.
- Task schedule dates.
- Task assignment to members.
- Extra-capacity practice days (extended practice / "dinner with the robot").
- Mark tasks completed (greyed display).

### Show
- Current date marker and past-day shading.
- Hover task to see assigned members.
- Hover member assignment to see task.
- Hover member name to see multiline list of assigned tasks.

## Architecture

### Backend
- `backend/app/main.py`: FastAPI app wiring.
- `backend/app/api/config.py`: config CRUD endpoints.
- `backend/app/api/tasks.py`: task endpoints.
- `backend/app/api/events.py`: SSE endpoint for file-change events.
- `backend/app/services/yaml_store.py`: validated read/write with atomic updates.
- `backend/app/services/planner_service.py`: timeline projection, warnings, cross-team expansion.
- `backend/app/services/file_watch_service.py`: watch data directory and publish change events.

### Frontend
- `frontend/src/pages/BoardPage.tsx`: swimlane board timeline.
- `frontend/src/pages/ConfigPage.tsx`: settings forms.
- `frontend/src/components/TimelineGrid.tsx`: date grid rendering.
- `frontend/src/components/StudentPanel.tsx`: member hover list.
- `frontend/src/services/plannerApi.ts`: API + SSE client.

## YAML Storage Layout

- `data/season.yaml` (includes season dates, events + travel, and breaks)
- `data/practices.yaml`
- `data/teams.yaml`
- `data/members.yaml`
- `data/tasks.yaml`

All UI edits write back to these files. Any external edit to these files triggers a backend watcher event and frontend refresh.

## Concurrency and Reliability
- Writes use temp file + atomic rename.
- In-process write lock per file.
- Schema validation before persist.
- SSE channel emits file change events to all clients.

## Deployment (Ubuntu + nginx)
- Run backend with `uvicorn` (systemd service).
- nginx reverse proxy:
  - `/api/*` and `/events` -> FastAPI.
  - `/` -> frontend static bundle.
- Data directory writable by app user.

## Incremental Implementation Order
1. Docs + data model + seed YAML.
2. Backend API + watcher + warnings.
3. Frontend scaffold + board/config pages.
4. Hover behaviors and live update integration.
5. Deployment scripts/docs.

## Recently Implemented
- Task data file moved to `data/tasks.yaml` and backend/task API path references updated.
- Task priority normalization added (`1/high/urgent`, `2/med/medium/need`, `3/low/want`) with canonical storage as `urgent|need|want` and default `need`.
- Task-card interactions updated so click opens context menu while drag gestures do not trigger click behavior.
- Complete/incomplete toggle now updates immediately in UI and deselects the active task instance.
- Empty-cell background double-click creates a 3-day `New Task` on the clicked team and enters name edit mode.
- Multi-team selection is now per-instance (task+team), so only the clicked instance highlights.
- Deleting from a team instance now unassociates that team; task is hard-deleted only when no teams remain.
- Dragging between teams now supports move (replace team) and Option-drag copy (add team association).
- Added `Tasks`, `Team`, `Config` navigation tabs and a new Team timeline page with member sub-rows by team assignment.
- Task tooltip now shows `Assigned: ` followed by alphabetically sorted member names.
- Priority-based styling added: `need` uses bold task text and `want` uses italic task text.
- CLI start/stop/restart logic consolidated into root `main.py` and published via `pyproject.toml` Click entrypoints.

- Polymorphic task field handling for `teams`, `depends_on`, `assigned_to` (read: scalar/array/null; write: null/single/array).
- Lane-to-lane reassignment on drag/drop.
- Task selection model (select + clear on background click).
- Double-click rename mode (Enter commit, Escape cancel).
- Keyboard delete for selected tasks (blocked while renaming).
- Undo/redo for task edits (move/resize/rename/complete/delete) with `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, `Cmd/Ctrl+Y`.

- People timeline view: toggling "People" renders person sub-rows within each team. People list = team members union task assignees, sorted alphabetically. Assignment indicators are colored boxes matching each task's team-lane color. Hover shows task name. Click selects; Delete/Backspace or right-click "Unassign" removes the assignment. Indicators are not draggable. Team header spans all person rows; person names column (100px) appears to the right of team labels.

- Warnings moved from right sidebar to a horizontal card bar below the timeline, reclaiming horizontal space. Each warning card shows the task name and a circled question-mark icon; hovering the icon reveals warning details in a tooltip.

- Task context menu now includes a "Priority ▸" submenu (between "Assign To" and "Complete") listing Urgent, Need, and Want with a checkmark on the active priority. Selecting a priority updates the task's rendering style immediately without dismissing the menu.

- People-only timeline view: when People is toggled on and Teams is toggled off (`#people`), the board shows a flat alphabetically-sorted list of all people — one row per person with full interactive task cards (draggable, resizable, context menu, rename). Task card colors come from the task's first team. Date changes apply to the entire task. Backend generates assignment-overlap warnings when a person has multiple tasks on the same day, shown as warning cards for both involved tasks.

- Task YAML cleanup: auto-generated IDs (`task-mmau3qar-...`) replaced with title-derived slugs (e.g. `cad`, `use-cancoders-for-shooter`); human-readable IDs preserved. Renaming a task regenerates its slug ID and updates all `depends_on` references. YAML serialization uses compact format: `null` for empty lists, scalar for single values, inline flow `[a, b]` for multiples. Custom `_CompactDumper` in `yaml_store.py` handles this for all YAML files.

## Queued TODO (Next Phase)
- Add regression tests for board interaction state transitions (selection, rename, undo/redo stack semantics).
