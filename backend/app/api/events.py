from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..services.file_watch_service import sse_event_stream
from .dependencies import get_current_user


router = APIRouter(tags=["events"])


@router.get("/events")
async def events(request: Request, _user=Depends(get_current_user)):
    broker = request.app.state.event_broker
    return StreamingResponse(
        sse_event_stream(broker),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
