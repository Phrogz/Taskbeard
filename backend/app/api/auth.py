from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from ..services.auth_service import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _is_secure(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


@router.get("/client-id")
def get_client_id(request: Request):
    auth_service = request.app.state.auth_service
    if not auth_service.is_enabled():
        return {"client_id": None}
    return {"client_id": auth_service.get_client_id()}


@router.post("/login")
def login(payload: dict, request: Request, response: Response):
    auth_service = request.app.state.auth_service
    if not auth_service.is_enabled():
        raise HTTPException(status_code=400, detail="Authentication is not configured")

    credential = payload.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing credential")

    try:
        id_info = auth_service.verify_google_token(credential)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    email = id_info.get("email", "")
    if not email:
        raise HTTPException(status_code=401, detail="No email in token")

    role = auth_service.resolve_role(email)
    if role is None:
        raise HTTPException(
            status_code=403,
            detail=f"Account {email} is not authorized to access this application",
        )

    token = auth_service.create_session_token(email, role)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=_is_secure(request),
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return {"email": email, "role": role}


@router.post("/logout")
def logout(request: Request, response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_is_secure(request),
    )
    return {"ok": True}


@router.get("/me")
def get_me(request: Request):
    auth_service = request.app.state.auth_service
    if not auth_service.is_enabled():
        return {"user": None}

    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return {"user": None}

    user = auth_service.verify_session_token(token)
    if user is None:
        return {"user": None}

    return {"user": {"email": user.email, "role": user.role}}
