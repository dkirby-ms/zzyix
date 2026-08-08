from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class WorkerCheckpoint:
    quilt_id: str
    run_id: str
    checkpoint_version: int
    workflow_state: str
    observed_revision: int | None
    pending_trigger_ids: tuple[str, ...]
    policy_version: str
    framework_version: str
    updated_at: datetime

    def next_version(self, workflow_state: str, pending_trigger_ids: list[str]) -> "WorkerCheckpoint":
        return WorkerCheckpoint(
            quilt_id=self.quilt_id,
            run_id=self.run_id,
            checkpoint_version=self.checkpoint_version + 1,
            workflow_state=workflow_state,
            observed_revision=self.observed_revision,
            pending_trigger_ids=tuple(pending_trigger_ids),
            policy_version=self.policy_version,
            framework_version=self.framework_version,
            updated_at=datetime.now(timezone.utc),
        )


def checkpoint_from_row(row: dict[str, Any]) -> WorkerCheckpoint:
    pending = row.get("pending_trigger_ids", [])
    if not isinstance(pending, list) or not all(isinstance(item, str) for item in pending):
        raise ValueError("pending_trigger_ids must be a list[str]")

    version = row.get("checkpoint_version", 1)
    if not isinstance(version, int) or version < 1:
        raise ValueError("checkpoint_version must be a positive integer")

    observed = row.get("observed_revision")
    if observed is not None and (not isinstance(observed, int) or observed < 0):
        raise ValueError("observed_revision must be None or a non-negative integer")

    workflow_state = row.get("workflow_state")
    if not isinstance(workflow_state, str) or not workflow_state:
        raise ValueError("workflow_state must be a non-empty string")

    return WorkerCheckpoint(
        quilt_id=str(row["quilt_id"]),
        run_id=str(row["run_id"]),
        checkpoint_version=version,
        workflow_state=workflow_state,
        observed_revision=observed,
        pending_trigger_ids=tuple(pending),
        policy_version=str(row["policy_version"]),
        framework_version=str(row["framework_version"]),
        updated_at=_coerce_datetime(row.get("updated_at")),
    )


def checkpoint_to_record(checkpoint: WorkerCheckpoint) -> dict[str, Any]:
    return {
        "quilt_id": checkpoint.quilt_id,
        "run_id": checkpoint.run_id,
        "checkpoint_version": checkpoint.checkpoint_version,
        "workflow_state": checkpoint.workflow_state,
        "observed_revision": checkpoint.observed_revision,
        "pending_trigger_ids": list(checkpoint.pending_trigger_ids),
        "policy_version": checkpoint.policy_version,
        "framework_version": checkpoint.framework_version,
        "updated_at": checkpoint.updated_at,
    }


def _coerce_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    return datetime.now(timezone.utc)
