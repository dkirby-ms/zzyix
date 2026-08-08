from __future__ import annotations

from checkpoints import WorkerCheckpoint, checkpoint_from_row, checkpoint_to_record


def test_given_invalid_pending_ids_when_loading_checkpoint_then_raises() -> None:
    row = {
        "quilt_id": "q1",
        "run_id": "r1",
        "checkpoint_version": 1,
        "workflow_state": "running",
        "pending_trigger_ids": "not-a-list",
        "policy_version": "v1",
        "framework_version": "mvp",
    }

    try:
        checkpoint_from_row(row)
    except ValueError as exc:
        assert "pending_trigger_ids" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_given_checkpoint_when_advancing_then_increments_version() -> None:
    checkpoint = WorkerCheckpoint(
        quilt_id="q1",
        run_id="r1",
        checkpoint_version=3,
        workflow_state="running",
        observed_revision=11,
        pending_trigger_ids=("t1",),
        policy_version="v1",
        framework_version="mvp",
        updated_at=checkpoint_from_row(
            {
                "quilt_id": "q1",
                "run_id": "r1",
                "checkpoint_version": 1,
                "workflow_state": "running",
                "pending_trigger_ids": [],
                "policy_version": "v1",
                "framework_version": "mvp",
            }
        ).updated_at,
    )

    next_checkpoint = checkpoint.next_version("completed", ["t2"])

    assert next_checkpoint.checkpoint_version == 4
    assert next_checkpoint.pending_trigger_ids == ("t2",)


def test_given_committed_checkpoint_when_worker_restarts_then_state_can_be_restored() -> None:
    checkpoint = checkpoint_from_row(
        {
            "quilt_id": "q1",
            "run_id": "r1",
            "checkpoint_version": 2,
            "workflow_state": "load_events",
            "observed_revision": 11,
            "pending_trigger_ids": ["t1", "t2"],
            "policy_version": "v1",
            "framework_version": "mvp",
        }
    )

    restored = checkpoint_from_row(checkpoint_to_record(checkpoint))

    assert restored == checkpoint
