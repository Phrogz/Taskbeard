from __future__ import annotations

import copy
import threading
from pathlib import Path
from typing import Any

import yaml


FILE_KEYS: dict[str, str] = {
    "config/season.yaml": "season",
    "config/practices.yaml": "default_hours_per_day",
    "config/events.yaml": "events",
    "config/breaks.yaml": "breaks",
    "config/teams.yaml": "teams",
    "config/members.yaml": "members",
    "tasks.yaml": "tasks",
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
                yaml.safe_dump(
                    payload,
                    stream,
                    sort_keys=False,
                    default_flow_style=False,
                    allow_unicode=True,
                )
            tmp_path.replace(path)
        return copy.deepcopy(payload)

    def _validate_payload(self, rel_path: str, payload: dict[str, Any]) -> None:
        required_root_key = FILE_KEYS[rel_path]
        if required_root_key not in payload:
            raise ValueError(
                f"File {rel_path} must include root key '{required_root_key}'"
            )
