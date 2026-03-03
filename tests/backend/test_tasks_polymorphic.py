from __future__ import annotations

from backend.app.api.tasks import _normalize_task, _serialize_task


def test_normalize_task_converts_scalar_and_null_to_lists():
    task = _normalize_task(
        {
            "id": "t1",
            "title": "Demo",
            "teams": "build",
            "depends_on": None,
            "assigned_to": "member-a",
        }
    )

    assert task["teams"] == ["build"]
    assert task["depends_on"] == []
    assert task["assigned_to"] == ["member-a"]
    assert task["priority"] == "need"


def test_normalize_task_priority_aliases_to_canonical_values():
    assert _normalize_task({"priority": "1"})["priority"] == "urgent"
    assert _normalize_task({"priority": "medium"})["priority"] == "need"
    assert _normalize_task({"priority": "LOW"})["priority"] == "want"


def test_serialize_task_uses_null_scalar_or_array_by_count():
    empty = _serialize_task({"teams": [], "depends_on": [], "assigned_to": []})
    assert empty["teams"] is None
    assert empty["depends_on"] is None
    assert empty["assigned_to"] is None

    single = _serialize_task({"teams": ["build"], "depends_on": ["task-a"], "assigned_to": ["m1"]})
    assert single["teams"] == "build"
    assert single["depends_on"] == "task-a"
    assert single["assigned_to"] == "m1"

    multiple = _serialize_task(
        {
            "teams": ["build", "code"],
            "depends_on": ["task-a", "task-b"],
            "assigned_to": ["m1", "m2"],
            "priority": "high",
        }
    )
    assert multiple["teams"] == ["build", "code"]
    assert multiple["depends_on"] == ["task-a", "task-b"]
    assert multiple["assigned_to"] == ["m1", "m2"]
    assert multiple["priority"] == "urgent"
