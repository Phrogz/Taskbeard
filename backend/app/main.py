from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.config import router as config_router
from .api.events import router as events_router
from .api.tasks import router as tasks_router
from .services.file_watch_service import EventBroker, FileWatchService
from .services.planner_service import PlannerService
from .services.yaml_store import YamlStore


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


@asynccontextmanager
async def lifespan(app: FastAPI):
    data_dir = _repo_root() / "data"
    store = YamlStore(data_dir)
    planner_service = PlannerService(store)
    broker = EventBroker()
    watcher = FileWatchService(data_dir=data_dir, broker=broker)
    watcher_task = asyncio.create_task(watcher.watch_forever())

    app.state.store = store
    app.state.planner_service = planner_service
    app.state.event_broker = broker

    try:
        yield
    finally:
        watcher_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watcher_task


app = FastAPI(title="Robotics Task Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(tasks_router)
app.include_router(events_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
