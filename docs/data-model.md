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
    colors: yellows
  - id: electrical
    name: Electrical
    colors: purples

colors:
  greens: ["#cfff40", "#bff230", "#76b900", "#3f8500", "#265600"]
  purples: ["#f9d4ff", "#c359ef", "#9525c6", "#741d9d", "#4d1368"]
  blues: ["#cbf5ff", "#7cd7fe", "#0074df", "#0046a4", "#002781"]
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
    priority: need
    depends_on: []
    assigned_to: [andy]
```

## Notes
- Cross-team tasks are represented by multiple `teams` on a single task.
- Teams reference a palette name with `colors: <palette-key>`.
- Color palettes are defined alongside teams in `teams.yaml`; text color is inferred automatically for contrast.
- Task `priority` is canonicalized as one of `urgent`, `need`, or `want`.
- Dependencies are warnings only.
- Backend derives `past` and `is_today` flags for dates.