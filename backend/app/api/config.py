from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from ..services.file_watch_service import EventBroker


router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/{name}")
def get_config(name: str, request: Request):
    store = request.app.state.store
    rel_path = f"config/{name}.yaml"
    try:
        return store.read(rel_path)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.put("/{name}")
async def put_config(name: str, payload: dict, request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    rel_path = f"config/{name}.yaml"
    try:
        value = store.write(rel_path, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    await broker.publish({"type": "file_changed", "change": "modified", "path": rel_path})
    return value
