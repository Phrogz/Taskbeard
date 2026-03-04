from __future__ import annotations

import copy
import threading
from pathlib import Path
from typing import Any

import yaml


class _CompactDumper(yaml.SafeDumper):
    """SafeDumper that renders scalar-only lists inline and None as empty."""


def _represent_list(dumper: yaml.Dumper, data: list) -> yaml.Node:
    if data and all(isinstance(item, (str, int, float, bool)) for item in data):
        return dumper.represent_sequence("tag:yaml.org,2002:seq", data, flow_style=True)
    return dumper.represent_sequence("tag:yaml.org,2002:seq", data, flow_style=False)


def _represent_none(dumper: yaml.Dumper, _data: object) -> yaml.Node:
    return dumper.represent_scalar("tag:yaml.org,2002:null", "")


_CompactDumper.add_representer(list, _represent_list)
_CompactDumper.add_representer(type(None), _represent_none)


FILE_KEYS: dict[str, str] = {
    "season.yaml": "season",
    "practices.yaml": "default_hours_per_day",
    "teams.yaml": "teams",
    "colors.yaml": "colors",
    "members.yaml": "members",
    "tasks.yaml": "tasks",
}

ROOT_KEY_TYPES: dict[str, type] = {
    "season": dict,
    "default_hours_per_day": dict,
    "teams": list,
    "colors": dict,
    "members": list,
    "tasks": list,
}

EXTRA_KEY_TYPES: dict[str, dict[str, type]] = {
    "season.yaml": {"events": list, "breaks": list},
}


class YamlStore:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self._locks: dict[Path, threading.Lock] = {}
        self._global_lock = threading.Lock()

    def _file_lock(self, path: Path) -> threading.Lock:
        with self._global_lock:
            if path not in self._locks:
                self._locks[path] = threading.Lock()
            return self._locks[path]

    def _ensure_known(self, rel_path: str) -> None:
        if rel_path not in FILE_KEYS:
            raise ValueError(f"Unknown YAML file key: {rel_path}")

    def _abs_path(self, rel_path: str) -> Path:
        self._ensure_known(rel_path)
        path = self.root_dir / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def read(self, rel_path: str) -> dict[str, Any]:
        path = self._abs_path(rel_path)
        if not path.exists():
            return {}
        with path.open("r", encoding="utf-8") as stream:
            value = yaml.safe_load(stream) or {}
        if not isinstance(value, dict):
            raise ValueError(f"YAML root must be a mapping in {rel_path}")
        return value

    def write(self, rel_path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a mapping")
        self._validate_payload(rel_path, payload)

        path = self._abs_path(rel_path)
        lock = self._file_lock(path)
        with lock:
            tmp_path = path.with_suffix(path.suffix + ".tmp")
            with tmp_path.open("w", encoding="utf-8") as stream:
                yaml.dump(
                    payload,
                    stream,
                    Dumper=_CompactDumper,
                    sort_keys=False,
                    default_flow_style=False,
                    allow_unicode=True,
                )
            tmp_path.replace(path)
        return copy.deepcopy(payload)

    def parse_yaml_text(self, rel_path: str, yaml_text: str) -> dict[str, Any]:
        self._ensure_known(rel_path)
        try:
            value = yaml.safe_load(yaml_text) if yaml_text.strip() else {}
        except yaml.YAMLError as error:
            raise ValueError(f"Invalid YAML for {rel_path}: {error}") from error

        if value is None:
            value = {}
        if not isinstance(value, dict):
            raise ValueError(f"YAML root must be a mapping in {rel_path}")

        self._validate_payload(rel_path, value)
        return value

    def write_yaml_text(self, rel_path: str, yaml_text: str) -> dict[str, Any]:
        payload = self.parse_yaml_text(rel_path, yaml_text)
        return self.write(rel_path, payload)

    def _validate_payload(self, rel_path: str, payload: dict[str, Any]) -> None:
        required_root_key = FILE_KEYS[rel_path]
        if required_root_key not in payload:
            raise ValueError(
                f"File {rel_path} must include root key '{required_root_key}'"
            )
        expected_type = ROOT_KEY_TYPES.get(required_root_key)
        if expected_type and not isinstance(payload.get(required_root_key), expected_type):
            expected_name = "mapping" if expected_type is dict else "list"
            raise ValueError(
                f"File {rel_path} key '{required_root_key}' must be a {expected_name}"
            )
        for key, etype in EXTRA_KEY_TYPES.get(rel_path, {}).items():
            if key in payload and not isinstance(payload[key], etype):
                expected_name = "mapping" if etype is dict else "list"
                raise ValueError(
                    f"File {rel_path} key '{key}' must be a {expected_name}"
                )
