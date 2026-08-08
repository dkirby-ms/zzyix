from __future__ import annotations

from datetime import datetime, timedelta, timezone

from control_plane import InMemoryControlPlane
from supervisor import AgentSupervisor, WorkerConfig
from workflow import WorkflowResult


class _WorkflowStub:
    def __init__(self, status: str):
        self._status = status

    def run(self, run_id: str, trigger, lease_guard, checkpoint=None, checkpoint_callback=None):
        del trigger
        del checkpoint
        del checkpoint_callback
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


class _ResumeWorkflow:
    def __init__(self) -> None:
        self.checkpoints = []

    def run(self, run_id: str, trigger, lease_guard, checkpoint=None, checkpoint_callback=None):
        del trigger
        del checkpoint_callback
        self.checkpoints.append(checkpoint)
        assert lease_guard()
        next_checkpoint = _checkpoint(run_id, workflow_state="completed", version=(checkpoint.checkpoint_version + 1 if checkpoint else 1))
        return WorkflowResult(
            status="completed",
            proposal={"summary": "resumed", "actions": [{"type": "observe", "target": "q1"}]},
            checkpoint=next_checkpoint,
            gateway=None,
        )


class _LeaseLossWorkflow:
    def __init__(self) -> None:
        self.work_calls = 0

    def run(self, run_id: str, trigger, lease_guard, checkpoint=None, checkpoint_callback=None):
        del run_id
        del trigger
        del checkpoint
        del checkpoint_callback
        if not lease_guard():
            return WorkflowResult(
                status="lease_lost",
                proposal={"summary": "stopped", "actions": []},
                checkpoint=_checkpoint("lost-run"),
                gateway=None,
            )
        self.work_calls += 1
        raise AssertionError("work must not start after lease loss")


class _LeaseLossAfterCheckpointWorkflow:
    def run(self, run_id: str, trigger, lease_guard, checkpoint=None, checkpoint_callback=None):
        del trigger
        assert lease_guard()
        persisted = _checkpoint(
            run_id,
            workflow_state="tool_call",
            version=(checkpoint.checkpoint_version + 1 if checkpoint else 1),
        )
        if checkpoint_callback is not None:
            checkpoint_callback(persisted)
        return WorkflowResult(
            status="lease_lost",
            proposal={"summary": "checkpointed", "actions": []},
            checkpoint=persisted,
            gateway=None,
        )


def _checkpoint(run_id: str, workflow_state: str = "completed", version: int = 1):
    from datetime import datetime, timezone

    from checkpoints import WorkerCheckpoint

    return WorkerCheckpoint(
        quilt_id="40000000-0000-4000-8000-000000000001",
        run_id=run_id,
        checkpoint_version=version,
        workflow_state=workflow_state,
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
    control_plane.assign_quilt(
        "40000000-0000-4000-8000-000000000001",
        "11111111-1111-4111-8111-111111111111",
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


def test_given_lease_unavailable_when_processing_then_requeues_for_recovery() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    control_plane.assign_quilt(quilt_id, "11111111-1111-4111-8111-111111111111")

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
    assert trigger["status"] == "pending"
    assert trigger["run_id"] == outcome.run_id


def test_given_model_free_gate_disabled_when_processing_then_does_not_claim() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    control_plane.assign_quilt(quilt_id, "11111111-1111-4111-8111-111111111111")

    supervisor = AgentSupervisor(
        config=WorkerConfig(
            agent_principal_id="11111111-1111-4111-8111-111111111111",
            model_free_enabled=False,
        ),
        control_plane=control_plane,
        workflow=_WorkflowStub(status="completed"),
    )

    outcome = supervisor.process_once()

    assert outcome.status == "feature_disabled"
    trigger = next(item for item in control_plane._triggers if item["id"] == trigger_id)
    assert trigger["status"] == "pending"


def test_given_first_worker_model_free_disabled_when_second_worker_processes_then_trigger_completes() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    agent_id = "11111111-1111-4111-8111-111111111111"
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    control_plane.assign_quilt(quilt_id, agent_id)

    blocked = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id, model_free_enabled=False),
        control_plane=control_plane,
        workflow=_WorkflowStub(status="completed"),
    ).process_once()
    completed = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id, model_free_enabled=True),
        control_plane=control_plane,
        workflow=_WorkflowStub(status="completed"),
    ).process_once()

    assert blocked.status == "feature_disabled"
    assert completed.status == "completed"
    trigger = next(item for item in control_plane._triggers if item["id"] == trigger_id)
    assert trigger["status"] == "completed"


def test_given_reclaimed_trigger_when_processing_then_reuses_run_and_checkpoint() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    agent_id = "11111111-1111-4111-8111-111111111111"
    control_plane.assign_quilt(quilt_id, agent_id)
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    trigger = control_plane.claim_next_trigger(agent_id)
    assert trigger is not None
    run_id = control_plane.start_run(quilt_id, agent_id)
    control_plane._triggers[0]["run_id"] = run_id
    control_plane._triggers[0]["claimed_at"] = datetime.now(timezone.utc) - timedelta(seconds=61)
    control_plane.save_checkpoint(_checkpoint(run_id), expected_version=None)

    workflow = _ResumeWorkflow()
    supervisor = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id),
        control_plane=control_plane,
        workflow=workflow,
    )

    outcome = supervisor.process_once()

    assert outcome.status == "completed"
    assert outcome.run_id == run_id
    assert next(item for item in control_plane._triggers if item["id"] == trigger_id)["run_id"] == run_id
    assert workflow.checkpoints[0] is not None
    assert workflow.checkpoints[0].run_id == run_id


def test_given_worker_loss_after_checkpoint_when_restarted_then_resumes_original_run() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    agent_id = "11111111-1111-4111-8111-111111111111"
    control_plane.assign_quilt(quilt_id, agent_id)
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    claimed = control_plane.claim_next_trigger(agent_id)
    assert claimed is not None
    run_id = control_plane.start_run(quilt_id, agent_id)
    control_plane._triggers[0]["run_id"] = run_id
    control_plane._triggers[0]["claimed_at"] = datetime.now(timezone.utc) - timedelta(seconds=61)
    saved = _checkpoint(run_id, workflow_state="load_events")
    control_plane.save_checkpoint(saved, expected_version=None)

    workflow = _ResumeWorkflow()
    outcome = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id),
        control_plane=control_plane,
        workflow=workflow,
    ).process_once()

    assert outcome.status == "completed"
    assert outcome.run_id == run_id
    assert workflow.checkpoints == [saved]
    restored = control_plane.load_checkpoint(quilt_id, run_id)
    assert restored is not None
    assert restored.workflow_state == "completed"
    assert restored.checkpoint_version == saved.checkpoint_version + 1
    assert next(item for item in control_plane._triggers if item["id"] == trigger_id)["status"] == "completed"


def test_given_lease_loss_after_checkpoint_when_requeued_then_next_worker_resumes_checkpoint() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    agent_id = "11111111-1111-4111-8111-111111111111"
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    control_plane.assign_quilt(quilt_id, agent_id)

    claimed = control_plane.claim_next_trigger(agent_id)
    assert claimed is not None
    run_id = control_plane.start_run(quilt_id, agent_id)
    control_plane._triggers[0]["run_id"] = run_id
    control_plane._triggers[0]["claimed_at"] = datetime.now(timezone.utc) - timedelta(seconds=61)
    control_plane.save_checkpoint(_checkpoint(run_id, workflow_state="load_events", version=1), expected_version=None)

    lost = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id),
        control_plane=control_plane,
        workflow=_LeaseLossAfterCheckpointWorkflow(),
    ).process_once()

    assert lost.status == "lease_lost"
    pending = next(item for item in control_plane._triggers if item["id"] == trigger_id)
    assert pending["status"] == "pending"
    assert pending["run_id"] == run_id

    resumed_workflow = _ResumeWorkflow()
    resumed = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id),
        control_plane=control_plane,
        workflow=resumed_workflow,
    ).process_once()

    assert resumed.status == "completed"
    assert resumed.run_id == run_id
    assert resumed_workflow.checkpoints[0] is not None
    assert resumed_workflow.checkpoints[0].checkpoint_version == 2
    assert resumed_workflow.checkpoints[0].workflow_state == "tool_call"


def test_given_lease_loss_before_work_when_processing_then_requeues_without_work() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    agent_id = "11111111-1111-4111-8111-111111111111"
    control_plane.assign_quilt(quilt_id, agent_id)
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    workflow = _LeaseLossWorkflow()

    original_renew = control_plane.renew_lease

    def lose_lease(*args, **kwargs):
        control_plane._leases.clear()
        return original_renew(*args, **kwargs)

    control_plane.renew_lease = lose_lease
    outcome = AgentSupervisor(
        config=WorkerConfig(agent_principal_id=agent_id),
        control_plane=control_plane,
        workflow=workflow,
    ).process_once()

    assert outcome.status == "lease_lost"
    assert workflow.work_calls == 0
    trigger = next(item for item in control_plane._triggers if item["id"] == trigger_id)
    assert trigger["status"] == "pending"
    assert trigger["run_id"] == outcome.run_id


def test_given_unassigned_trigger_when_processing_then_leaves_it_pending() -> None:
    control_plane = InMemoryControlPlane()
    quilt_id = "40000000-0000-4000-8000-000000000001"
    trigger_id = control_plane.enqueue_trigger(quilt_id=quilt_id, payload={})
    control_plane.assign_quilt(quilt_id, "22222222-2222-4222-8222-222222222222")

    outcome = AgentSupervisor(
        config=WorkerConfig(agent_principal_id="11111111-1111-4111-8111-111111111111"),
        control_plane=control_plane,
        workflow=_WorkflowStub(status="completed"),
    ).process_once()

    assert outcome.status == "idle"
    assert next(item for item in control_plane._triggers if item["id"] == trigger_id)["status"] == "pending"


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
