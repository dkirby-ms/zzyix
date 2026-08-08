from __future__ import annotations

from control_plane import InMemoryControlPlane
from supervisor import AgentSupervisor, WorkerConfig
from workflow import WorkflowResult


class _WorkflowStub:
    def __init__(self, status: str):
        self._status = status

    def run(self, run_id: str, trigger, lease_guard):
        del trigger
        if not lease_guard():
            return WorkflowResult(
                status="lease_lost",
                proposal={"summary": "lost", "actions": [{"type": "observe", "target": "q1"}]},
                checkpoint=_checkpoint(run_id),
                gateway=None,
            )

        return WorkflowResult(
            status=self._status,
            proposal={"summary": "ok", "actions": [{"type": "observe", "target": "q1"}]},
            checkpoint=_checkpoint(run_id),
            gateway=None,
        )


def _checkpoint(run_id: str):
    from datetime import datetime, timezone

    from checkpoints import WorkerCheckpoint

    return WorkerCheckpoint(
        quilt_id="40000000-0000-4000-8000-000000000001",
        run_id=run_id,
        checkpoint_version=1,
        workflow_state="completed",
        observed_revision=None,
        pending_trigger_ids=(),
        policy_version="v1",
        framework_version="mvp",
        updated_at=datetime.now(timezone.utc),
    )


def test_given_claimed_trigger_when_processing_then_marks_completed() -> None:
    control_plane = InMemoryControlPlane()
    trigger_id = control_plane.enqueue_trigger(
        quilt_id="40000000-0000-4000-8000-000000000001",
        payload={"patchId": "50000000-0000-4000-8000-000000000001"},
    )

    supervisor = AgentSupervisor(
        config=WorkerConfig(agent_principal_id="11111111-1111-4111-8111-111111111111"),
        control_plane=control_plane,
        workflow=_WorkflowStub(status="completed"),
    )

    outcome = supervisor.process_once()

    assert outcome.status == "completed"
    trigger = next(item for item in control_plane._triggers if item["id"] == trigger_id)
    assert trigger["status"] == "completed"


def test_given_lease_unavailable_when_processing_then_marks_failed() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})

    first_run_id = control_plane.start_run(quilt_id=quilt_id, agent_principal_id="first")
    control_plane.claim_lease(quilt_id=quilt_id, run_id=first_run_id, owner_principal_id="first", ttl_seconds=60)

    supervisor = AgentSupervisor(
        config=WorkerConfig(agent_principal_id="11111111-1111-4111-8111-111111111111"),
        control_plane=control_plane,
        workflow=_WorkflowStub(status="completed"),
    )

    outcome = supervisor.process_once()

    assert outcome.status == "lease_unavailable"
    trigger = next(item for item in control_plane._triggers if item["id"] == trigger_id)
    assert trigger["status"] == "failed"


def test_given_active_lease_when_second_worker_claims_same_quilt_then_claim_is_rejected() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    first_run_id = control_plane.start_run(quilt_id=quilt_id, agent_principal_id="first")
    second_run_id = control_plane.start_run(quilt_id=quilt_id, agent_principal_id="second")

    first_lease = control_plane.claim_lease(
        quilt_id=quilt_id,
        run_id=first_run_id,
        owner_principal_id="first",
        ttl_seconds=60,
    )
    second_lease = control_plane.claim_lease(
        quilt_id=quilt_id,
        run_id=second_run_id,
        owner_principal_id="second",
        ttl_seconds=60,
    )

    assert first_lease is not None
    assert second_lease is None
    assert control_plane.lease_is_owned(
        quilt_id=quilt_id,
        run_id=first_run_id,
        owner_principal_id="first",
        generation=first_lease.generation,
    )
