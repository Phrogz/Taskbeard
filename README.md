# Robotics Task Management

YAML-backed robotics season planning board with team swimlanes, task scheduling, member assignments, and live file-watch updates.

## Prerequisites
- Python 3.13+
- `uv`
- Node.js 20+

## Backend (uv)
From repo root:

```bash
uv sync
uv run uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

## Start both servers
From repo root:

```bash
uv sync
uv run start
```

Stop both servers:

```bash
uv run stop
```

Restart both servers:

```bash
uv run restart
```

Optional flags:

```bash
uv run start --backend-port 8000 --frontend-port 5173
uv run start --skip-frontend-install
uv run stop --timeout 10
uv run stop --backend-port 8000 --frontend-port 5173 --extra-port 5174
```

## Frontend
From `frontend`:

```bash
npm install
npm run dev
```

Vite proxies `/api` and `/events` to `http://127.0.0.1:8000`.

## Initial testing checklist
- Open `http://127.0.0.1:5173`.
- Verify board loads with seeded tasks and swimlanes.
- Verify API health at `http://127.0.0.1:8000/api/health`.
- Edit a YAML file under `data/` and confirm UI updates without restart.
- Drag a task to a new day and confirm YAML writes and board refresh.

## Unit tests
From repo root:

```bash
uv sync
uv run pytest
```

## Data Files
All persisted state is YAML under `data/`:
- `data/config/*.yaml`
- `data/tasks.yaml`

Notable config files include `data/config/members.yaml` and `data/config/teams.yaml`.

Edits from UI write these files; manual edits are detected by the backend watcher and pushed to connected clients.

## UI Notes
- Top navigation includes `Tasks`, `Team`, and `Config`.
- `Tasks` is the lane board view with drag/drop and task context menus.
- `Team` shows team groupings with member sub-rows and colored assignment bars.
- Task priority is normalized to `need`, `want`, or `nice` (aliases accepted by API).
