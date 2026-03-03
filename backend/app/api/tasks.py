from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
import uuid

from fastapi import APIRouter, HTTPException, Request

from ..services.file_watch_service import EventBroker


router = APIRouter(prefix="/api", tags=["planner"])

POLYMORPHIC_TASK_FIELDS = ("teams", "depends_on", "assigned_to")


def _normalize_priority(value: Any) -> str:
    raw = str(value).strip().lower() if value is not None else ""
    if raw in {"1", "high", "urgent"}:
        return "urgent"
    if raw in {"2", "med", "medium", "need"}:
        return "need"
    if raw in {"3", "low", "want"}:
        return "want"
    return "need"


def _normalize_id_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    scalar = str(value).strip()
    return [scalar] if scalar else []


def _normalize_task(task: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(task)
    for key in POLYMORPHIC_TASK_FIELDS:
        normalized[key] = _normalize_id_list(normalized.get(key))
    normalized["priority"] = _normalize_priority(normalized.get("priority"))
    return normalized


def _serialize_polymorphic(value: Any) -> str | list[str] | None:
    values = _normalize_id_list(value)
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return values


def _serialize_task(task: dict[str, Any]) -> dict[str, Any]:
    serialized = dict(task)
    for key in POLYMORPHIC_TASK_FIELDS:
        serialized[key] = _serialize_polymorphic(serialized.get(key))
    serialized["priority"] = _normalize_priority(serialized.get("priority"))
    return serialized


def _read_normalized_tasks(store: Any) -> list[dict[str, Any]]:
    tasks_file = store.read("tasks.yaml")
    raw_tasks = tasks_file.get("tasks", [])
    if not isinstance(raw_tasks, list):
        return []
    return [_normalize_task(task) for task in raw_tasks if isinstance(task, dict)]


def _write_tasks(store: Any, tasks: list[dict[str, Any]]) -> dict[str, Any]:
    return store.write("tasks.yaml", {"tasks": [_serialize_task(task) for task in tasks]})


@router.get("/planner")
def get_planner(request: Request):
    planner = request.app.state.planner_service
    return planner.read_all()


@router.get("/tasks")
def get_tasks(request: Request):
    store = request.app.state.store
    return {"tasks": _read_normalized_tasks(store)}


@router.put("/tasks")
async def put_tasks(payload: dict, request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    raw_tasks = payload.get("tasks", []) if isinstance(payload, dict) else []
    if not isinstance(raw_tasks, list):
        raise HTTPException(status_code=400, detail="tasks must be a list")
    tasks = [_normalize_task(task) for task in raw_tasks if isinstance(task, dict)]
    try:
        value = _write_tasks(store, tasks)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    await broker.publish(
        {"type": "file_changed", "change": "modified", "path": "tasks.yaml"}
    )
    return value


@router.post("/tasks")
async def create_task(payload: dict, request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    tasks = _read_normalized_tasks(store)

    item = _normalize_task(dict(payload))
    item.setdefault("id", f"task-{uuid.uuid4().hex[:8]}")
    item.setdefault("depends_on", [])
    item.setdefault("teams", [])
    item.setdefault("assigned_to", [])
    item.setdefault("completed", False)
    item.setdefault("priority", "need")
    tasks.append(item)

    value = _write_tasks(store, tasks)
    await broker.publish(
        {"type": "file_changed", "change": "modified", "path": "tasks.yaml"}
    )
    return item


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: dict, request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    tasks = _read_normalized_tasks(store)
    for index, task in enumerate(tasks):
        if task.get("id") == task_id:
            merged = dict(task)
            merged.update(payload)
            merged["id"] = task_id
            merged = _normalize_task(merged)
            tasks[index] = merged
            value = _write_tasks(store, tasks)
            await broker.publish(
                {
                    "type": "file_changed",
                    "change": "modified",
                    "path": "tasks.yaml",
                }
            )
            return merged
    raise HTTPException(status_code=404, detail="Task not found")


def _next_end_date(start_date: str, est_hours: float, practices: dict) -> str:
    def _as_date_str(value: str | date | datetime | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return value

    defaults = practices.get("default_hours_per_day", {})
    overrides_by_date = {
        _as_date_str(item.get("date")): float(item.get("hours", 0))
        for item in practices.get("overrides", [])
        if item.get("date")
    }
    hours_remaining = max(float(est_hours), 0)
    cursor = datetime.strptime(start_date, "%Y-%m-%d").date()

    while hours_remaining > 0:
        date_key = cursor.isoformat()
        if date_key in overrides_by_date:
            capacity = overrides_by_date[date_key]
        else:
            weekday_key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][
                cursor.weekday()
            ]
            capacity = float(defaults.get(weekday_key, 0))
        if capacity > 0:
            hours_remaining -= capacity
        if hours_remaining > 0:
            cursor += timedelta(days=1)
    return cursor.isoformat()


@router.post("/tasks/{task_id}/schedule")
async def schedule_task(task_id: str, payload: dict, request: Request):
    start_date = payload.get("start_date")
    if not start_date:
        raise HTTPException(status_code=400, detail="start_date is required")
    auto_span = bool(payload.get("auto_span", False))

    store = request.app.state.store
    tasks = _read_normalized_tasks(store)
    practices = store.read("practices.yaml")

    for task in tasks:
        if task.get("id") != task_id:
            continue

        task["start_date"] = start_date
        if auto_span and task.get("est_hours"):
            task["end_date"] = _next_end_date(start_date, task.get("est_hours", 0), practices)
        else:
            task["end_date"] = payload.get("end_date", start_date)

        await update_task(task_id, task, request)
        return task

    raise HTTPException(status_code=404, detail="Task not found")


@router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str, payload: dict, request: Request):
    completed = bool(payload.get("completed", True))
    return await update_task(task_id, {"completed": completed}, request)


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker

    tasks = _read_normalized_tasks(store)
    new_tasks = [task for task in tasks if task.get("id") != task_id]
    if len(new_tasks) == len(tasks):
        raise HTTPException(status_code=404, detail="Task not found")

    _write_tasks(store, new_tasks)
    await broker.publish(
        {
            "type": "file_changed",
            "change": "modified",
            "path": "tasks.yaml",
        }
    )
    return {"deleted": True, "task_id": task_id}
