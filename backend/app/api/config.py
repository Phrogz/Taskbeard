from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from ..services.file_watch_service import EventBroker


router = APIRouter(prefix="/api/config", tags=["config"])

POLYMORPHIC_MEMBER_FIELDS = ("teams",)


def _serialize_polymorphic(value: Any) -> str | list[str] | None:
    if value is None:
        return None
    if isinstance(value, list):
        values = [str(item) for item in value if str(item).strip()]
    else:
        scalar = str(value).strip()
        values = [scalar] if scalar else []
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return values


def _serialize_members(payload: dict[str, Any]) -> dict[str, Any]:
    members = payload.get("members")
    if not isinstance(members, list):
        return payload
    serialized = dict(payload)
    serialized["members"] = [
        {
            **member,
            **{k: _serialize_polymorphic(member.get(k)) for k in POLYMORPHIC_MEMBER_FIELDS},
        }
        for member in members
        if isinstance(member, dict)
    ]
    return serialized


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


@router.get("/{name}/yaml")
def get_config_yaml(name: str, request: Request):
    store = request.app.state.store
    rel_path = _resolve_rel_path(name)
    try:
        return {"yaml_text": store.read_raw(rel_path)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.put("/{name}")
async def put_config(name: str, payload: dict[str, Any], request: Request):
    store = request.app.state.store
    broker: EventBroker = request.app.state.event_broker
    rel_path = _resolve_rel_path(name)
    if rel_path == "members.yaml":
        payload = _serialize_members(payload)
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
        parsed = store.parse_yaml_text(rel_path, yaml_text)
        if rel_path == "members.yaml":
            parsed = _serialize_members(parsed)
        value = store.write(rel_path, parsed)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    await broker.publish({"type": "file_changed", "change": "modified", "path": rel_path})
    return value
