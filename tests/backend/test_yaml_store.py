from __future__ import annotations

import pytest

from backend.app.api.config import _resolve_rel_path
from backend.app.services.yaml_store import YamlStore


def test_resolve_rel_path_uses_root_level_yaml_names():
    assert _resolve_rel_path("season") == "season.yaml"
    assert _resolve_rel_path("tasks") == "tasks.yaml"


def test_parse_yaml_text_rejects_invalid_yaml(tmp_path):
    store = YamlStore(tmp_path)

    with pytest.raises(ValueError, match="Invalid YAML"):
        store.parse_yaml_text("season.yaml", "season: [")


def test_write_yaml_text_requires_expected_root_key(tmp_path):
    store = YamlStore(tmp_path)

    with pytest.raises(ValueError, match="must include root key 'season'"):
        store.write_yaml_text("season.yaml", "timezone: America/Los_Angeles")


def test_write_yaml_text_validates_expected_root_type(tmp_path):
    store = YamlStore(tmp_path)

    with pytest.raises(ValueError, match="key 'tasks' must be a list"):
        store.write_yaml_text("tasks.yaml", "tasks: {}")


def test_write_yaml_text_persists_valid_content(tmp_path):
    store = YamlStore(tmp_path)

    value = store.write_yaml_text(
        "members.yaml",
        "members:\n  - id: m1\n    name: Member One\n    teams: [build]",
    )

    assert value["members"][0]["id"] == "m1"
    assert store.read("members.yaml")["members"][0]["name"] == "Member One"
