from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from .yaml_store import YamlStore


def _parse_date(value: str | date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(value, "%Y-%m-%d").date()


def _format_date(value: date) -> str:
    return value.isoformat()


def _normalize_date_str(value: str | date | datetime | None) -> str | None:
    if value is None:
        return None
    return _parse_date(value).isoformat()


def _normalize_id_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    scalar = str(value).strip()
    return [scalar] if scalar else []


def _normalize_priority(value: Any) -> str:
    raw = str(value).strip().lower() if value is not None else ""
    if raw in {1, "1", "high", "urgent"}:
        return "urgent"
    if raw in {2, "2", "med", "medium", "need"}:
        return "need"
    if raw in {3, "3", "low", "want"}:
        return "want"
    return "need"


@dataclass
class PlannerService:
    store: YamlStore

    def read_all(self) -> dict[str, Any]:
        season_file = self.store.read("season.yaml")
        practices_file = self.store.read("practices.yaml")
        events_file = self.store.read("events.yaml")
        breaks_file = self.store.read("breaks.yaml")
        teams_file = self.store.read("teams.yaml")
        colors_file = self.store.read("colors.yaml")
        members_file = self.store.read("members.yaml")
        tasks_file = self.store.read("tasks.yaml")

        season = season_file.get("season", {})
        tasks = self._normalize_tasks(tasks_file.get("tasks", []))
        members = self._normalize_members(members_file.get("members", []))

        return {
            "season": season,
            "practices": practices_file,
            "events": events_file.get("events", []),
            "breaks": breaks_file.get("breaks", []),
            "teams": teams_file.get("teams", []),
            "colors": colors_file.get("colors", {}),
            "members": members,
            "tasks": tasks,
            "dates": self._build_dates(season),
            "dependency_warnings": self._dependency_warnings(tasks),
            "student_task_map": self._student_task_map(members, tasks),
        }

    def _normalize_members(self, members: Any) -> list[dict[str, Any]]:
        if not isinstance(members, list):
            return []
        output: list[dict[str, Any]] = []
        for item in members:
            if not isinstance(item, dict):
                continue
            normalized = dict(item)
            normalized["teams"] = _normalize_id_list(normalized.get("teams"))
            output.append(normalized)
        return output

    def _normalize_tasks(self, tasks: Any) -> list[dict[str, Any]]:
        if not isinstance(tasks, list):
            return []
        output: list[dict[str, Any]] = []
        for item in tasks:
            if not isinstance(item, dict):
                continue
            normalized = dict(item)
            normalized["teams"] = _normalize_id_list(normalized.get("teams"))
            normalized["depends_on"] = _normalize_id_list(normalized.get("depends_on"))
            normalized["assigned_to"] = _normalize_id_list(normalized.get("assigned_to"))
            normalized["priority"] = _normalize_priority(normalized.get("priority"))
            output.append(normalized)
        return output

    def _build_dates(self, season: dict[str, Any]) -> list[dict[str, Any]]:
        start = season.get("start_date")
        end = season.get("end_date")
        if not start or not end:
            return []

        start_date = _parse_date(start)
        end_date = _parse_date(end)
        today = date.today()
        output: list[dict[str, Any]] = []
        day = start_date
        while day <= end_date:
            output.append(
                {
                    "date": _format_date(day),
                    "past": day < today,
                    "is_today": day == today,
                    "weekday": day.strftime("%a"),
                }
            )
            day += timedelta(days=1)
        return output

    def _dependency_warnings(self, tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        task_by_id = {task.get("id"): task for task in tasks}
        warnings: list[dict[str, Any]] = []
        today = date.today()

        for task in tasks:
            task_id = task.get("id")
            task_end_str = _normalize_date_str(task.get("end_date"))
            if task_id and task_end_str and not bool(task.get("completed")):
                task_end = _parse_date(task_end_str)
                if today > task_end:
                    warnings.append(
                        {
                            "task_id": task_id,
                            "dependency_id": None,
                            "message": "Task overdue and not completed",
                        }
                    )

        for task in tasks:
            task_id = task.get("id")
            for dependency_id in task.get("depends_on", []):
                dependency = task_by_id.get(dependency_id)
                if not dependency:
                    warnings.append(
                        {
                            "task_id": task_id,
                            "dependency_id": dependency_id,
                            "message": "Dependency does not exist",
                        }
                    )
                    continue

                dep_end_raw = dependency.get("end_date")
                task_start_raw = task.get("start_date")
                dep_end = _normalize_date_str(dep_end_raw)
                task_start = _normalize_date_str(task_start_raw)
                if dep_end and task_start and task_start < dep_end:
                    warnings.append(
                        {
                            "task_id": task_id,
                            "dependency_id": dependency_id,
                            "message": "Task starts before dependency ends",
                        }
                    )
        return warnings

    def _student_task_map(
        self,
        members: list[dict[str, Any]],
        tasks: list[dict[str, Any]],
    ) -> dict[str, list[dict[str, Any]]]:
        output: dict[str, list[dict[str, Any]]] = {}
        for member in members:
            member_id = str(member.get("id") or "").strip()
            if member_id:
                output[member_id] = []
        for task in tasks:
            for student_id in task.get("assigned_to", []):
                if not student_id:
                    continue
                output.setdefault(student_id, []).append(
                    {
                        "task_id": task.get("id"),
                        "title": task.get("title"),
                        "start_date": _normalize_date_str(task.get("start_date")),
                        "end_date": _normalize_date_str(task.get("end_date")),
                        "completed": bool(task.get("completed")),
                    }
                )
        for values in output.values():
            values.sort(key=lambda item: (item.get("start_date") or "", item.get("title") or ""))
        return output
