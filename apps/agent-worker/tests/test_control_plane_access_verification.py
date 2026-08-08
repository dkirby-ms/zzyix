from __future__ import annotations

from contextlib import nullcontext

import pytest
from psycopg import errors

import control_plane_access_verification as verification


class FakeCursor:
    def __init__(self, current_user: str, insert_error: Exception | None) -> None:
        self.current_user = current_user
        self.insert_error = insert_error
        self.commands: list[str] = []

    def __enter__(self) -> FakeCursor:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, command: str) -> None:
        self.commands.append(command)
        if command.startswith("INSERT") and self.insert_error:
            raise self.insert_error

    def fetchone(self) -> tuple[str]:
        return (self.current_user,)


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self.cursor_instance = cursor

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self.cursor_instance

    def transaction(self):
        return nullcontext()


def test_given_restricted_dsn_when_verifying_then_confirms_role_and_canonical_write_denial(monkeypatch) -> None:
    # Arrange
    cursor = FakeCursor("agent_control_worker", errors.InsufficientPrivilege("denied"))
    connection = FakeConnection(cursor)
    monkeypatch.setattr(verification.psycopg, "connect", lambda _dsn: connection)

    # Act
    current_user = verification.verify_control_plane_access("postgresql://worker")

    # Assert
    assert current_user == "agent_control_worker"
    assert cursor.commands == ["SELECT current_user", "INSERT INTO public.quilts DEFAULT VALUES"]


def test_given_unexpected_dsn_role_when_verifying_then_rejects_before_canonical_probe(monkeypatch) -> None:
    # Arrange
    cursor = FakeCursor("pgadmin", errors.InsufficientPrivilege("denied"))
    connection = FakeConnection(cursor)
    monkeypatch.setattr(verification.psycopg, "connect", lambda _dsn: connection)

    # Act & Assert
    with pytest.raises(ValueError, match="expected 'agent_control_worker'"):
        verification.verify_control_plane_access("postgresql://admin")

    assert cursor.commands == ["SELECT current_user"]


def test_given_canonical_write_grant_when_verifying_then_fails(monkeypatch) -> None:
    # Arrange
    cursor = FakeCursor("agent_control_worker", None)
    connection = FakeConnection(cursor)
    monkeypatch.setattr(verification.psycopg, "connect", lambda _dsn: connection)

    # Act & Assert
    with pytest.raises(RuntimeError, match="unexpectedly permits canonical writes"):
        verification.verify_control_plane_access("postgresql://worker")