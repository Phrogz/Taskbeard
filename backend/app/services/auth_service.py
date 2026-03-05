from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import jwt
import yaml
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "taskbeard_session"
SESSION_EXPIRY_DAYS = 7


@dataclass
class AuthUser:
    email: str
    role: str  # "admin" | "viewer"


class AuthService:
    def __init__(self, data_dir: Path) -> None:
        self._auth_path = data_dir / "auth.yaml"
        self._secret_key = os.environ.get("TASKBEARD_SECRET_KEY", "")
        if not self._secret_key:
            self._secret_key = secrets.token_hex(32)
            logger.warning(
                "TASKBEARD_SECRET_KEY not set — using a random key. "
                "Sessions will not persist across restarts."
            )

    def is_enabled(self) -> bool:
        return self._auth_path.is_file()

    def _load_config(self) -> dict[str, Any]:
        if not self._auth_path.is_file():
            return {}
        with self._auth_path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data if isinstance(data, dict) else {}

    def get_client_id(self) -> str | None:
        config = self._load_config()
        cid = config.get("google_client_id")
        return str(cid) if cid else None

    def verify_google_token(self, credential: str) -> dict[str, Any]:
        client_id = self.get_client_id()
        if not client_id:
            raise ValueError("Google client ID not configured")
        id_info = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
        return id_info

    def resolve_role(self, email: str) -> str | None:
        config = self._load_config()
        email_lower = email.lower()

        admins = config.get("admins", [])
        if isinstance(admins, list):
            for entry in admins:
                if str(entry).lower() == email_lower:
                    return "admin"

        viewers = config.get("viewers", [])
        if isinstance(viewers, list):
            for entry in viewers:
                entry_str = str(entry).lower()
                if entry_str.startswith("@"):
                    if email_lower.endswith(entry_str):
                        return "viewer"
                elif entry_str == email_lower:
                    return "viewer"

        # Admins matched above; check domain patterns for admin emails too
        # (not needed — admins are matched first by exact email)
        return None

    def create_session_token(self, email: str, role: str) -> str:
        payload = {
            "email": email,
            "role": role,
            "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS),
            "iat": datetime.now(timezone.utc),
        }
        return jwt.encode(payload, self._secret_key, algorithm="HS256")

    def verify_session_token(self, token: str) -> AuthUser | None:
        try:
            payload = jwt.decode(token, self._secret_key, algorithms=["HS256"])
            email = payload.get("email", "")
            role = payload.get("role", "")
            if email and role in ("admin", "viewer"):
                return AuthUser(email=email, role=role)
        except jwt.InvalidTokenError:
            pass
        return None
