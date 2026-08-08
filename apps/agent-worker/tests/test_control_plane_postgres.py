from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from checkpoints import WorkerCheckpoint
from control_plane import PostgresControlPlane

pytest.importorskip("psycopg")
import psycopg
from psycopg.types.json import Jsonb


AGENT_PRINCIPAL_ID = "a1111111-1111-4111-8111-111111111111"
UNASSIGNED_AGENT_PRINCIPAL_ID = "a1111111-1111-4111-8111-111111111112"
QUILT_ID = "a2222222-2222-4222-8222-222222222222"
TRIGGER_ID = "a3333333-3333-4333-8333-333333333333"
PATCH_ID = "a4444444-4444-4444-8444-444444444444"
WORKER_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture()
def postgres_dsn() -> str:
    dsn = os.getenv("AGENT_WORKER_POSTGRES_TEST_DSN")
    if not dsn:
        pytest.skip("set AGENT_WORKER_POSTGRES_TEST_DSN to run PostgresControlPlane integration tests")
    return dsn


@pytest.fixture()
def seeded_control_plane(postgres_dsn: str):
    with psycopg.connect(postgres_dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select to_regclass('agent_control.trigger_queue')")
            if cursor.fetchone()[0] is None:
                pytest.skip("AGENT_WORKER_POSTGRES_TEST_DSN must point at a migrated zzyix database")
            _delete_seed_rows(cursor)
            cursor.execute(
                "insert into principals (id, kind, status, display_name) values (%s, 'agent', 'active', 'Test Agent')",
                (AGENT_PRINCIPAL_ID,),
            )
            cursor.execute(
                "insert into principals (id, kind, status, display_name) values (%s, 'agent', 'active', 'Unassigned Test Agent')",
                (UNASSIGNED_AGENT_PRINCIPAL_ID,),
            )
            cursor.execute(
                """
                insert into quilts (id, patch_rows, patch_columns, patch_width, patch_height, topology, protocol_version)
                values (%s, 1, 1, 10, 10, 'toroidal', 2)
                """,
                (QUILT_ID,),
            )
            cursor.execute(
                """
                insert into agent_control.agent_assignments (quilt_id, agent_principal_id, policy_version)
                values (%s, %s, 'test-policy')
                """,
                (QUILT_ID, AGENT_PRINCIPAL_ID),
            )
            cursor.execute(
                """
                insert into agent_control.trigger_queue (
                    id,
                    source,
                    quilt_id,
                    deduplication_key,
                    priority,
                    status,
                    coalescing_policy_version,
                    payload
                ) values (%s, 'pytest', %s, 'pytest-recovery', 100, 'pending', 'v1', %s)
                """,
                (TRIGGER_ID, QUILT_ID, Jsonb({"patchId": PATCH_ID})),
            )

    try:
        yield
    finally:
        with psycopg.connect(postgres_dsn) as connection:
            with connection.cursor() as cursor:
                _delete_seed_rows(cursor)


def test_given_two_postgres_workers_when_trigger_reclaimed_then_checkpoint_resumes_original_run(
    postgres_dsn: str,
    seeded_control_plane,
) -> None:
    del seeded_control_plane
    first = PostgresControlPlane(postgres_dsn)
    second = PostgresControlPlane(postgres_dsn)

    # Act: two workers contend for one assigned trigger.
    with ThreadPoolExecutor(max_workers=2) as executor:
        claims = list(executor.map(lambda _: PostgresControlPlane(postgres_dsn).claim_next_trigger(AGENT_PRINCIPAL_ID), range(2)))

    # Assert: only one worker can claim the trigger, and only one live lease can exist.
    claimed = [claim for claim in claims if claim is not None]
    assert len(claimed) == 1
    run_id = first.start_or_resume_run(QUILT_ID, AGENT_PRINCIPAL_ID, claimed[0].run_id)
    lease = first.claim_lease(QUILT_ID, run_id, AGENT_PRINCIPAL_ID, ttl_seconds=60)
    assert lease is not None
    blocked_run_id = second.start_run(QUILT_ID, AGENT_PRINCIPAL_ID)
    assert second.claim_lease(QUILT_ID, blocked_run_id, AGENT_PRINCIPAL_ID, ttl_seconds=60) is None

    first.save_checkpoint(
        WorkerCheckpoint(
            quilt_id=QUILT_ID,
            run_id=run_id,
            checkpoint_version=1,
            workflow_state="load_events",
            observed_revision=7,
            pending_trigger_ids=(TRIGGER_ID,),
            policy_version="v1",
            framework_version="mvp",
            updated_at=datetime.now(timezone.utc),
        ),
        expected_version=None,
    )
    _expire_claim_and_lease(postgres_dsn, run_id)

    # Act: the next worker reclaims stale work after the first worker is lost.
    reclaimed = second.claim_next_trigger(AGENT_PRINCIPAL_ID)
    assert reclaimed is not None
    resumed_run_id = second.start_or_resume_run(QUILT_ID, AGENT_PRINCIPAL_ID, reclaimed.run_id)
    resumed_lease = second.claim_lease(QUILT_ID, resumed_run_id, AGENT_PRINCIPAL_ID, ttl_seconds=60)
    checkpoint = second.load_checkpoint(QUILT_ID, resumed_run_id)

    # Assert: recovery keeps the original run identity and latest checkpoint.
    assert reclaimed.id == TRIGGER_ID
    assert resumed_run_id == run_id
    assert resumed_lease is not None
    assert resumed_lease.generation == lease.generation + 1
    assert checkpoint is not None
    assert checkpoint.run_id == run_id
    assert checkpoint.workflow_state == "load_events"
    assert checkpoint.pending_trigger_ids == (TRIGGER_ID,)


def test_given_unassigned_agent_when_starting_run_or_claiming_lease_then_ownership_is_rejected(
    postgres_dsn: str,
    seeded_control_plane,
) -> None:
    del seeded_control_plane
    control_plane = PostgresControlPlane(postgres_dsn)

    # Act & Assert: a principal without the active assignment cannot create execution state.
    with pytest.raises(RuntimeError, match="active assignment"):
        control_plane.start_run(QUILT_ID, UNASSIGNED_AGENT_PRINCIPAL_ID)

    assigned_run_id = control_plane.start_run(QUILT_ID, AGENT_PRINCIPAL_ID)
    rejected_lease = control_plane.claim_lease(
        QUILT_ID,
        assigned_run_id,
        UNASSIGNED_AGENT_PRINCIPAL_ID,
        ttl_seconds=60,
    )

    assert rejected_lease is None


def test_given_pending_queue_at_capacity_when_requeueing_claimed_trigger_then_transition_is_rejected(
    postgres_dsn: str,
    seeded_control_plane,
) -> None:
    del seeded_control_plane
    control_plane = PostgresControlPlane(postgres_dsn)

    # Arrange: claim the seed trigger, then fill the only pending queue slot.
    claimed = control_plane.claim_next_trigger(AGENT_PRINCIPAL_ID)
    assert claimed is not None
    run_id = control_plane.start_or_resume_run(QUILT_ID, AGENT_PRINCIPAL_ID, claimed.run_id)
    with psycopg.connect(postgres_dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "update agent_control.trigger_queue_limits set pending_limit = 1 where singleton_key = 'default'",
            )
            cursor.execute(
                """
                insert into agent_control.trigger_queue (
                    source, quilt_id, deduplication_key, priority, status, coalescing_policy_version, payload
                ) values ('pytest', %s, 'pending-at-capacity', 100, 'pending', 'v1', '{}'::jsonb)
                """,
                (QUILT_ID,),
            )

    # Act & Assert: requeue cannot bypass the pending trigger capacity.
    with pytest.raises(psycopg.errors.RaiseException, match="pending trigger queue limit exceeded"):
        control_plane.requeue_trigger(claimed.id, run_id)

    with psycopg.connect(postgres_dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select status from agent_control.trigger_queue where id = %s", (claimed.id,))
            status = cursor.fetchone()[0]

    assert status == "claimed"


def test_given_competing_workers_when_claiming_same_lease_then_only_one_acquires(
    postgres_dsn: str,
    seeded_control_plane,
) -> None:
    del seeded_control_plane
    control_plane = PostgresControlPlane(postgres_dsn)
    first_run_id = control_plane.start_run(QUILT_ID, AGENT_PRINCIPAL_ID)
    second_run_id = control_plane.start_run(QUILT_ID, AGENT_PRINCIPAL_ID)

    # Act: separate connections race to acquire the same quilt lease.
    with ThreadPoolExecutor(max_workers=2) as executor:
        leases = list(executor.map(
            lambda run_id: PostgresControlPlane(postgres_dsn).claim_lease(
                QUILT_ID,
                run_id,
                AGENT_PRINCIPAL_ID,
                ttl_seconds=60,
            ),
            (first_run_id, second_run_id),
        ))

    # Assert: PostgreSQL's expiry-gated upsert permits exactly one live owner.
    assert len([lease for lease in leases if lease is not None]) == 1


class _BlockingAgentReadServer:
    def __init__(self) -> None:
        self.events_started = threading.Event()
        self.release_events = threading.Event()
        self.event_requests = 0
        parent = self

        class RequestHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                if self.headers.get("Authorization") != "Bearer test-worker-token":
                    self.send_error(401)
                    return

                if self.path.endswith("/context"):
                    self._send_json({"topology": {"quiltId": QUILT_ID}, "patches": []})
                    return

                if "/events?" in self.path:
                    parent.event_requests += 1
                    parent.events_started.set()
                    parent.release_events.wait(timeout=30)
                    self._send_json({"operations": []})
                    return

                self.send_error(404)

            def _send_json(self, payload: dict) -> None:
                body = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args) -> None:
                del format, args

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        host, port = self._server.server_address
        return f"http://{host}:{port}"

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        self.release_events.set()
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)


def test_given_production_worker_process_restart_when_checkpoint_committed_then_resumes_latest_postgres_checkpoint(
    postgres_dsn: str,
    seeded_control_plane,
) -> None:
    # Arrange
    del seeded_control_plane
    server = _BlockingAgentReadServer()
    processes: list[subprocess.Popen[str]] = []
    server.start()

    try:
        # Act: force termination after the production process persists its first checkpoint.
        first = _start_test_worker(postgres_dsn, server.base_url)
        processes.append(first)
        first_checkpoint = _wait_for_checkpoint(postgres_dsn, workflow_state="load_events")
        assert server.events_started.wait(timeout=10)

        _terminate_worker(first)
        _expire_claim_and_lease(postgres_dsn, first_checkpoint.run_id)

        server.release_events.set()
        second = _start_test_worker(postgres_dsn, server.base_url)
        processes.append(second)
        completed_checkpoint = _wait_for_checkpoint(postgres_dsn, workflow_state="completed")
        status, run_id = _wait_for_trigger_completion(postgres_dsn)

        # Assert: the restarted process completes the original run from a newer checkpoint.
        assert status == "completed"
        assert run_id == first_checkpoint.run_id
        assert completed_checkpoint.run_id == first_checkpoint.run_id
        assert completed_checkpoint.checkpoint_version > first_checkpoint.checkpoint_version
        assert server.event_requests >= 2
    finally:
        for process in processes:
            _terminate_worker(process)
        server.close()


def _start_test_worker(postgres_dsn: str, base_url: str) -> subprocess.Popen[str]:
    environment = os.environ | {
        "NODE_ENV": "test",
        "AGENT_USE_STATIC_SERVER_TOKEN": "true",
        "AGENT_TEST_STATIC_SERVER_TOKEN": "test-worker-token",
        "AGENT_PRINCIPAL_ID": AGENT_PRINCIPAL_ID,
        "AGENT_CONTROL_PLANE_DSN": postgres_dsn,
        "AGENT_SERVER_TOKEN_SCOPE": "api://zzyix-test/.default",
        "AGENT_SERVER_BASE_URL": base_url,
        "AGENT_POLL_INTERVAL_SECONDS": "0.05",
        "AGENT_GATEWAY_MODE": "fake",
        "AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED": "false",
        "PYTHONUNBUFFERED": "1",
    }
    return subprocess.Popen(
        [sys.executable, "src/main.py"],
        cwd=WORKER_ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def _terminate_worker(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _wait_for_checkpoint(dsn: str, workflow_state: str) -> WorkerCheckpoint:
    deadline = time.monotonic() + 15
    control_plane = PostgresControlPlane(dsn)
    while time.monotonic() < deadline:
        checkpoint = control_plane.load_checkpoint(QUILT_ID)
        if checkpoint is not None and checkpoint.workflow_state == workflow_state:
            return checkpoint
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for checkpoint state {workflow_state}")


def _wait_for_trigger_completion(dsn: str) -> tuple[str, str | None]:
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        with psycopg.connect(dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute("select status, run_id from agent_control.trigger_queue where id = %s", (TRIGGER_ID,))
                row = cursor.fetchone()
        if row is not None and row[0] == "completed":
            return str(row[0]), str(row[1]) if row[1] is not None else None
        time.sleep(0.05)
    raise AssertionError("timed out waiting for restarted worker to complete the trigger")


def _expire_claim_and_lease(dsn: str, run_id: str) -> None:
    with psycopg.connect(dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update agent_control.trigger_queue
                set status = 'claimed',
                    run_id = %s,
                    claimed_at = now() - interval '120 seconds',
                    claimed_by_agent_principal_id = %s
                where id = %s
                """,
                (run_id, AGENT_PRINCIPAL_ID, TRIGGER_ID),
            )
            cursor.execute(
                "update agent_control.quilt_leases set expires_at = now() - interval '1 second' where quilt_id = %s",
                (QUILT_ID,),
            )


def _delete_seed_rows(cursor) -> None:
    cursor.execute("delete from quilts where id = %s", (QUILT_ID,))
    cursor.execute(
        "delete from principals where id in (%s, %s)",
        (AGENT_PRINCIPAL_ID, UNASSIGNED_AGENT_PRINCIPAL_ID),
    )