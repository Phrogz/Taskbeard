from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from ..services.file_watch_service import EventBroker


router = APIRouter(prefix="/api/config", tags=["config"])


def _resolve_rel_path(name: str) -> str:
    key = name.strip().lower()
    if not key:
        raise ValueError("Config name is required")
    return f"{key}.yaml"


@router.get("/{name}")
def get_config(name: str, request: Request):
    store = request.app.state.store
    rel_path = _resolve_rel_path(name)
    try:
        return store.read(rel_path)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.put("/{name}")
async def put_config(name: str, payload: dict[str, Any], request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    rel_path = _resolve_rel_path(name)
    try:
        value = store.write(rel_path, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    await broker.publish({"type": "file_changed", "change": "modified", "path": rel_path})
    return value


@router.put("/{name}/yaml")
async def put_config_yaml(name: str, payload: dict[str, Any], request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    rel_path = _resolve_rel_path(name)
    yaml_text = payload.get("yaml_text")

    if not isinstance(yaml_text, str):
        raise HTTPException(status_code=400, detail="yaml_text must be a string")

    try:
        value = store.write_yaml_text(rel_path, yaml_text)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    await broker.publish({"type": "file_changed", "change": "modified", "path": rel_path})
    return value
