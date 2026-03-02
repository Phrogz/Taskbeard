from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..services.file_watch_service import sse_event_stream


router = APIRouter(tags=["events"])


@router.get("/events")
async def events(request: Request):
    broker = request.app.state.event_broker
    return StreamingResponse(
        sse_event_stream(broker),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
