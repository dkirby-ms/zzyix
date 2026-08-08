from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pytest

from checkpoints import WorkerCheckpoint
from control_plane import PostgresControlPlane

pytest.importorskip("psycopg")
import psycopg
from psycopg.types.json import Jsonb


AGENT_PRINCIPAL_ID = "a1111111-1111-4111-8111-111111111111"
QUILT_ID = "a2222222-2222-4222-8222-222222222222"
TRIGGER_ID = "a3333333-3333-4333-8333-333333333333"


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
                (TRIGGER_ID, QUILT_ID, Jsonb({"patchId": "test"})),
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
    cursor.execute("delete from principals where id = %s", (AGENT_PRINCIPAL_ID,))