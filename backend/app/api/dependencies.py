from __future__ import annotations

from fastapi import HTTPException, Request

from ..services.auth_service import AuthUser, SESSION_COOKIE_NAME


def get_current_user(request: Request) -> AuthUser | None:
    auth_service = request.app.state.auth_service
    if not auth_service.is_enabled():
        return None

    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    user = auth_service.verify_session_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def require_admin(request: Request) -> AuthUser | None:
    user = get_current_user(request)
    if user is None:
        return None  # auth disabled
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
