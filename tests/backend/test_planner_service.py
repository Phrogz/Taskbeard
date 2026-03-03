from __future__ import annotations

import yaml

from backend.app.services.planner_service import PlannerService
from backend.app.services.yaml_store import YamlStore


def _write_yaml(root, relative_path: str, payload: dict) -> None:
    full_path = root / relative_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with full_path.open("w", encoding="utf-8") as stream:
        yaml.safe_dump(payload, stream, sort_keys=False)


def test_planner_prefers_members_and_normalizes_task_lists(tmp_path):
    _write_yaml(
        tmp_path,
        "members.yaml",
        {
            "members": [
                {"id": "m1", "name": "Member One", "teams": "build"},
                {"id": "m2", "name": "Member Two", "teams": ["code", "cad"]},
            ]
        },
    )
    _write_yaml(
        tmp_path,
        "tasks.yaml",
        {
            "tasks": [
                {
                    "id": "t1",
                    "title": "Task One",
                    "start_date": "2026-03-01",
                    "end_date": "2026-03-02",
                    "teams": "build",
                    "depends_on": None,
                    "assigned_to": "m1",
                    "completed": False,
                    "priority": "high",
                }
            ]
        },
    )

    payload = PlannerService(YamlStore(tmp_path)).read_all()

    assert payload["members"][0]["teams"] == ["build"]
    assert payload["members"][1]["teams"] == ["code", "cad"]

    task = payload["tasks"][0]
    assert task["teams"] == ["build"]
    assert task["depends_on"] == []
    assert task["assigned_to"] == ["m1"]
    assert task["priority"] == "need"


def test_planner_returns_empty_members_when_members_file_missing(tmp_path):
    payload = PlannerService(YamlStore(tmp_path)).read_all()

    assert payload["members"] == []
