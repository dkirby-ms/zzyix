from __future__ import annotations

import os
import sys

import psycopg
from psycopg import errors


EXPECTED_DATABASE_ROLE = "agent_control_worker"
EXIT_SUCCESS = 0
EXIT_FAILURE = 1
EXIT_ERROR = 2


def verify_control_plane_access(
    dsn: str,
    expected_database_role: str = EXPECTED_DATABASE_ROLE,
) -> str:
    """Verify that the worker DSN has the restricted control-plane role."""
    with psycopg.connect(dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_user")
            row = cursor.fetchone()

        current_user = str(row[0]) if row else ""
        if current_user != expected_database_role:
            raise ValueError(
                f"AGENT_CONTROL_PLANE_DSN authenticated as {current_user!r}; "
                f"expected {expected_database_role!r}"
            )

        try:
            # A nested transaction rolls back the probe even if a grant is misconfigured.
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("INSERT INTO public.quilts DEFAULT VALUES")
        except errors.InsufficientPrivilege:
            return current_user

    raise RuntimeError("AGENT_CONTROL_PLANE_DSN unexpectedly permits canonical writes")


def main() -> int:
    dsn = os.getenv("AGENT_CONTROL_PLANE_DSN")
    if not dsn:
        print("AGENT_CONTROL_PLANE_DSN is required", file=sys.stderr)
        return EXIT_ERROR

    try:
        current_user = verify_control_plane_access(dsn)
    except (psycopg.Error, RuntimeError, ValueError) as exc:
        print(f"agent worker database access verification failed: {exc}", file=sys.stderr)
        return EXIT_FAILURE

    print(f"agent worker database access verified for role {current_user}")
    return EXIT_SUCCESS


if __name__ == "__main__":
    sys.exit(main())