from __future__ import annotations

import logging
import tarfile
import threading
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)


class SnapshotService:
    def __init__(
        self,
        data_dir: Path,
        cooldown_minutes: int = 15,
        max_snapshots: int = 50,
    ):
        self.data_dir = data_dir
        self.snapshot_dir = data_dir / "snapshots"
        self.cooldown = timedelta(minutes=cooldown_minutes)
        self.max_snapshots = max_snapshots
        self._last_snapshot: datetime | None = None
        self._lock = threading.Lock()

    def notify_write(self) -> None:
        """Create a snapshot if the cooldown has elapsed since the last one."""
        try:
            with self._lock:
                now = datetime.now()
                if self._last_snapshot and (now - self._last_snapshot) < self.cooldown:
                    return
                self._create_snapshot(now)
                self._last_snapshot = now
                self._prune()
        except Exception:
            logger.exception("Failed to create data snapshot")

    def _create_snapshot(self, timestamp: datetime) -> None:
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        name = f"snapshot-{timestamp:%Y%m%d-%H%M%S}.tar.gz"
        path = self.snapshot_dir / name
        with tarfile.open(path, "w:gz", compresslevel=9) as tar:
            for yaml_file in sorted(self.data_dir.glob("*.yaml")):
                tar.add(yaml_file, arcname=yaml_file.name)

    def _prune(self) -> None:
        cutoff = datetime.now() - timedelta(days=180)
        snapshots = sorted(self.snapshot_dir.glob("snapshot-*.tar.gz"))
        for snap in snapshots[: -self.max_snapshots]:
            snap.unlink()
        for snap in snapshots[-self.max_snapshots :]:
            try:
                ts = datetime.strptime(snap.stem, "snapshot-%Y%m%d-%H%M%S")
            except ValueError:
                continue
            if ts < cutoff:
                snap.unlink()
