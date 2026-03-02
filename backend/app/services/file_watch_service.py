from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from watchfiles import Change, awatch


class EventBroker:
    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[dict]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict]:
        queue: asyncio.Queue[dict] = asyncio.Queue()
        async with self._lock:
            self._queues.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        async with self._lock:
            self._queues.discard(queue)

    async def publish(self, event: dict) -> None:
        async with self._lock:
            queues = list(self._queues)
        for queue in queues:
            queue.put_nowait(event)


class FileWatchService:
    def __init__(self, data_dir: Path, broker: EventBroker):
        self.data_dir = data_dir
        self.broker = broker

    async def watch_forever(self) -> None:
        async for changes in awatch(self.data_dir, recursive=True):
            for change_type, changed_path in changes:
                if not str(changed_path).endswith(".yaml"):
                    continue
                await self.broker.publish(
                    {
                        "type": "file_changed",
                        "change": Change(change_type).name,
                        "path": str(Path(changed_path).relative_to(self.data_dir)),
                        "ts": datetime.now(timezone.utc).isoformat(),
                    }
                )


async def sse_event_stream(
    broker: EventBroker,
) -> AsyncGenerator[str, None]:
    queue = await broker.subscribe()
    try:
        while True:
            event = await queue.get()
            yield f"event: planner-update\ndata: {json.dumps(event)}\n\n"
    finally:
        await broker.unsubscribe(queue)
