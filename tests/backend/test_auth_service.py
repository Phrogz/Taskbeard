from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

from backend.app.services.auth_service import AuthService


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture()
def auth_yaml(data_dir: Path) -> Path:
    return data_dir / "auth.yaml"


def write_auth(auth_yaml: Path, content: str) -> None:
    auth_yaml.write_text(dedent(content), encoding="utf-8")


class TestIsEnabled:
    def test_disabled_when_no_file(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        assert service.is_enabled() is False

    def test_enabled_when_file_exists(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "test-id"
            admins: []
            viewers: []
        """)
        service = AuthService(data_dir)
        assert service.is_enabled() is True


class TestGetClientId:
    def test_returns_none_when_disabled(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        assert service.get_client_id() is None

    def test_returns_client_id(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "my-client-id.apps.googleusercontent.com"
            admins: []
            viewers: []
        """)
        service = AuthService(data_dir)
        assert service.get_client_id() == "my-client-id.apps.googleusercontent.com"


class TestResolveRole:
    def test_admin_exact_match(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins:
              - admin@school.org
            viewers:
              - "@school.org"
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("admin@school.org") == "admin"

    def test_admin_case_insensitive(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins:
              - Admin@School.org
            viewers: []
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("admin@school.org") == "admin"

    def test_viewer_domain_match(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins: []
            viewers:
              - "@school.org"
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("student@school.org") == "viewer"

    def test_viewer_exact_email(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins: []
            viewers:
              - parent@gmail.com
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("parent@gmail.com") == "viewer"

    def test_viewer_domain_case_insensitive(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins: []
            viewers:
              - "@School.Org"
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("Anyone@school.org") == "viewer"

    def test_unauthorized_returns_none(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins:
              - admin@school.org
            viewers:
              - "@school.org"
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("outsider@other.com") is None

    def test_admin_takes_precedence_over_domain_viewer(
        self, data_dir: Path, auth_yaml: Path
    ) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins:
              - lead@school.org
            viewers:
              - "@school.org"
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("lead@school.org") == "admin"

    def test_empty_lists(self, data_dir: Path, auth_yaml: Path) -> None:
        write_auth(auth_yaml, """\
            google_client_id: "x"
            admins: []
            viewers: []
        """)
        service = AuthService(data_dir)
        assert service.resolve_role("anyone@any.com") is None

    def test_no_auth_file_returns_none(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        assert service.resolve_role("anyone@any.com") is None


class TestSessionToken:
    def test_roundtrip(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        token = service.create_session_token("user@test.com", "admin")
        user = service.verify_session_token(token)
        assert user is not None
        assert user.email == "user@test.com"
        assert user.role == "admin"

    def test_invalid_token_returns_none(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        assert service.verify_session_token("garbage") is None

    def test_tampered_token_returns_none(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        token = service.create_session_token("user@test.com", "viewer")
        assert service.verify_session_token(token + "x") is None

    def test_viewer_role_roundtrip(self, data_dir: Path) -> None:
        service = AuthService(data_dir)
        token = service.create_session_token("viewer@test.com", "viewer")
        user = service.verify_session_token(token)
        assert user is not None
        assert user.role == "viewer"
