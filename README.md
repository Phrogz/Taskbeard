# Robotics Task Management

YAML-backed robotics season planning board with team swimlanes, task scheduling, member assignments, and live file-watch updates.

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- Node.js 20+

## Getting Started

From repo root:

```bash
uv run taskbeard start
```

This installs Python and npm dependencies, then starts both the backend (`http://127.0.0.1:8000`) and frontend (`http://127.0.0.1:5173`).

```bash
uv run taskbeard stop       # stop both servers
uv run taskbeard restart    # restart both servers
```

Optional flags:

```bash
uv run taskbeard start --backend-port 8000 --frontend-port 5173
uv run taskbeard stop --timeout 10
```

## Tests

```bash
uv run pytest                                    # backend
cd frontend && npm test                          # frontend
cd frontend && npx playwright test --reporter=line  # e2e
```

## Data Files

All persisted state lives in YAML files under `data/`. The UI reads and writes these files; manual edits are detected by the backend file watcher and pushed to all connected clients via SSE.

### `season.yaml` — Season dates, events, and breaks

```yaml
season:
  start_date: "2026-02-16"
  end_date: "2026-04-26"
  timezone: America/Denver
events:
  - id: denver-regional
    name: Denver Regional
    tba: 2026code               # optional TBA event code
    start_date: "2026-04-09"
    end_date: "2026-04-11"
    travel:                      # optional list of travel days
      - date: "2026-04-08"
        label: Load Trailer
breaks:
  - id: winterim
    name: Winterim
    start_date: "2026-03-06"
    end_date: "2026-03-15"
```

### `practices.yaml` — Weekly practice hours and overrides

```yaml
default_hours_per_day:
  mon: 2
  tue: 2
  wed: 2
  thu: 2
  fri: 0
  sat: 0
  sun: 4
overrides:
  - date: "2026-03-05"
    hours: 0
    label: No Practice
  - date: "2026-03-22"
    hours: 8
    label: Extended Practice
```

Hours are used to auto-calculate task end dates from estimated hours.

### `teams.yaml` — Team definitions

```yaml
teams:
  - id: cad
    name: CAD
    colors: greens     # references a palette name from colors.yaml
  - id: build
    name: Build
    colors: blues
```

Each team becomes a swimlane on the board.

### `colors.yaml` — Color palettes

```yaml
colors:
  greens: ["#76b900", "#bff230", "#3f8500", "#cfff40", "#265600"]
  blues: ["#0074df", "#7cd7fe", "#0046a4", "#cbf5ff", "#002781"]
```

Each palette is an array of hex colors. The first color is the default for tasks in that team's lane; additional colors handle same-day overlap.

### `members.yaml` — Team members

```yaml
members:
  - id: grady
    name: Grady
    teams: [cad, build]    # scalar "cad" or list ["cad", "build"]
  - id: ralph
    name: Ralph
    teams: code
```

The `teams` field accepts a single string or a list. Members appear in the People view and the Assign To menu.

### `tasks.yaml` — All tasks

```yaml
tasks:
  - id: design-intake
    title: Design Intake
    teams: [cad, build]          # scalar or list
    start_date: "2026-02-17"
    end_date: "2026-02-21"
    est_hours: 8                 # optional; used for auto-spanning
    depends_on: [other-task-id]  # optional; scalar or list
    assigned_to: [grady, ralph]  # optional; scalar or list
    completed: false
    priority: need               # urgent, need, or want
    description: ""              # optional
```

List fields (`teams`, `depends_on`, `assigned_to`) accept `null`, a scalar, or an array. YAML serialization uses compact form: `null` for empty, scalar for one, `[a, b]` for multiple.

### `auth.yaml` — Authentication (optional)

See [Authentication](#authentication-optional) below. This file is **not** accessible through the Config API.

## Authentication (Optional)

Taskbeard supports Google OAuth sign-in with two roles: **admin** (full read/write) and **viewer** (read-only). Auth is opt-in — it activates only when `data/auth.yaml` exists.

### Setup

1. Create a Google Cloud project at <https://console.cloud.google.com/>.
2. Navigate to **APIs & Services > Credentials** and create an **OAuth 2.0 Client ID** (type: Web application).
3. Add authorized JavaScript origins: `http://localhost:5173` (dev) and your production URL.
4. Copy `data/auth.yaml.example` to `data/auth.yaml` and fill in your Client ID, admin emails, and viewer patterns.

### auth.yaml format

```yaml
google_client_id: "YOUR_CLIENT_ID.apps.googleusercontent.com"

admins:
  - teacher@school.org

viewers:
  - "@school.org"           # domain pattern: any @school.org email
  - parent@gmail.com        # specific email
```

- **Admins** have full edit access (drag tasks, edit configs, save changes).
- **Viewers** see everything read-only (no dragging, no saving, inputs disabled).
- Admins automatically have viewer access; no need to list them under `viewers`.
- Changes to `auth.yaml` take effect immediately (no restart needed).

### Environment variables

- `TASKBEARD_SECRET_KEY` — signs session cookies. If unset, a random key is generated on startup, which means users will need to sign in again after a server restart. To keep sessions stable across restarts, set this to a long random string, e.g. `python3 -c "import secrets; print(secrets.token_hex(32))"`.

## UI Notes

- Top navigation includes `Teams`, `People`, and `Config` (`Teams`/`People` are toggleable aspects).
- `Teams` only is the lane board view with drag/drop and task context menus.
- `Teams` + `People` keeps the same timeline styling as `Teams`, with extra member rows under each team main row.
- `People` only shows all members alphabetically with assignment labels.
- Task priority is normalized to `urgent`, `need`, or `want` (aliases accepted by API).
- Task context menu includes an `Assign To` submenu with non-dismissing assignment toggles.
