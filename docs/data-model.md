# YAML Data Model

## season.yaml
```yaml
season:
  start_date: 2026-02-16
  end_date: 2026-04-26
  timezone: America/Denver
```

## practices.yaml
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
  - date: 2026-03-08
    hours: 0
    label: No Practice
  - date: 2026-04-10
    hours: 5
    label: Dinner with the Robot
```

## events.yaml
```yaml
events:
  - id: denver-regional
    name: Denver Regional
    start_date: 2026-04-08
    end_date: 2026-04-12
    travel:
      - date: 2026-04-07
        label: Packing + Loading Trailer
      - date: 2026-04-13
        label: Travel + Unload + Unpack
```

## breaks.yaml
```yaml
breaks:
  - id: winterim
    name: Winterim
    start_date: 2026-03-09
    end_date: 2026-03-15
```

## teams.yaml
```yaml
teams:
  - id: other
    name: Other
    colors:
      - fg: "#111827"
        bg: "#f28a0c"
      - fg: "#111827"
        bg: "#f59e0b"
  - id: electrical
    name: Electrical
    color: "#ff00ff"
```

## members.yaml
```yaml
members:
  - id: andy
    name: Andy
    teams: [other]
```

## tasks.yaml
```yaml
tasks:
  - id: order-banner
    title: Order Banner
    teams: [other]
    start_date: 2026-02-23
    end_date: 2026-02-23
    est_hours: 1
    completed: false
    priority: want
    depends_on: []
    assigned_to: [andy]
```

## Notes
- Cross-team tasks are represented by multiple `teams` on a single task.
- Team visual colors are ordered under `colors` with `{fg,bg}` objects.
- Task `priority` is canonicalized as one of `need`, `want`, or `nice`.
- Dependencies are warnings only.
- Backend derives `past` and `is_today` flags for dates.