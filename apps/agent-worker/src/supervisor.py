from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

from checkpoints import WorkerCheckpoint
from control_plane import ControlPlaneStore, LeaseHandle, TriggerRecord
from telemetry import emit_event
from workflow import GraphWorkflow, WorkflowTrigger

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WorkerConfig:
    agent_principal_id: str
    lease_ttl_seconds: int = 20
    poll_interval_seconds: float = 0.5


@dataclass(frozen=True)
class ProcessOutcome:
    status: str
    run_id: str | None = None
    trigger_id: str | None = None


class AgentSupervisor:
    def __init__(self, config: WorkerConfig, control_plane: ControlPlaneStore, workflow: GraphWorkflow) -> None:
        self._config = config
        self._control_plane = control_plane
        self._workflow = workflow

    def process_once(self) -> ProcessOutcome:
        trigger = self._control_plane.claim_next_trigger(self._config.agent_principal_id)
        if trigger is None:
            emit_event("worker_idle")
            return ProcessOutcome(status="idle")

        emit_event("worker_trigger_claimed", trigger_id=trigger.id, quilt_id=trigger.quilt_id)
        run_id = self._control_plane.start_run(trigger.quilt_id, self._config.agent_principal_id)
        lease = self._control_plane.claim_lease(
            quilt_id=trigger.quilt_id,
            run_id=run_id,
            owner_principal_id=self._config.agent_principal_id,
            ttl_seconds=self._config.lease_ttl_seconds,
        )

        if lease is None:
            emit_event("worker_lease_unavailable", run_id=run_id, trigger_id=trigger.id, quilt_id=trigger.quilt_id)
            self._control_plane.fail_run(run_id, "cancelled")
            self._control_plane.mark_trigger_failed(trigger.id, run_id)
            return ProcessOutcome(status="lease_unavailable", run_id=run_id, trigger_id=trigger.id)

        try:
            result = self._execute_workflow(trigger, run_id, lease)
            if result.status == "lease_lost":
                emit_event("worker_lease_lost", run_id=run_id, trigger_id=trigger.id, quilt_id=trigger.quilt_id)
                self._control_plane.fail_run(run_id, "cancelled")
                self._control_plane.mark_trigger_failed(trigger.id, run_id)
                return ProcessOutcome(status="lease_lost", run_id=run_id, trigger_id=trigger.id)

            previous = self._control_plane.load_checkpoint(trigger.quilt_id, run_id)
            expected = previous.checkpoint_version if previous is not None else None
            self._control_plane.save_checkpoint(result.checkpoint, expected)
            emit_event("worker_checkpoint_committed", run_id=run_id, quilt_id=trigger.quilt_id)
            self._control_plane.complete_run(run_id)
            self._control_plane.mark_trigger_completed(trigger.id, run_id)
            emit_event(
                "worker_run_completed",
                run_id=run_id,
                trigger_id=trigger.id,
                quilt_id=trigger.quilt_id,
                gateway_provider=result.gateway.provider if result.gateway is not None else "none",
                gateway_used_fallback=result.gateway.used_fallback if result.gateway is not None else False,
                gateway_fallback_reason=result.gateway.fallback_reason if result.gateway is not None else None,
            )
            return ProcessOutcome(status="completed", run_id=run_id, trigger_id=trigger.id)
        except Exception:
            emit_event("worker_run_failed", run_id=run_id, trigger_id=trigger.id)
            logger.exception("worker_run_failed")
            self._control_plane.fail_run(run_id, "failed")
            self._control_plane.mark_trigger_failed(trigger.id, run_id)
            return ProcessOutcome(status="failed", run_id=run_id, trigger_id=trigger.id)
        finally:
            self._control_plane.release_lease(trigger.quilt_id, run_id, self._config.agent_principal_id, lease.generation)
            emit_event("worker_lease_released", run_id=run_id, quilt_id=trigger.quilt_id)

    def run_forever(self) -> None:
        while True:
            outcome = self.process_once()
            if outcome.status == "idle":
                time.sleep(self._config.poll_interval_seconds)

    def _execute_workflow(self, trigger: TriggerRecord, run_id: str, lease: LeaseHandle):
        def lease_guard() -> bool:
            renewed = self._control_plane.renew_lease(
                quilt_id=trigger.quilt_id,
                run_id=run_id,
                owner_principal_id=self._config.agent_principal_id,
                generation=lease.generation,
                ttl_seconds=self._config.lease_ttl_seconds,
            )
            if not renewed:
                return False

            return self._control_plane.lease_is_owned(
                quilt_id=trigger.quilt_id,
                run_id=run_id,
                owner_principal_id=self._config.agent_principal_id,
                generation=lease.generation,
            )

        return self._workflow.run(
            run_id=run_id,
            trigger=WorkflowTrigger(
                trigger_id=trigger.id,
                quilt_id=trigger.quilt_id,
                payload=trigger.payload,
            ),
            lease_guard=lease_guard,
        )


def load_config_from_env() -> WorkerConfig:
    agent_principal_id = os.getenv("AGENT_PRINCIPAL_ID", "")
    if not agent_principal_id:
        raise ValueError("AGENT_PRINCIPAL_ID is required")

    lease_ttl_seconds = int(os.getenv("AGENT_LEASE_TTL_SECONDS", "20"))
    poll_interval_seconds = float(os.getenv("AGENT_POLL_INTERVAL_SECONDS", "0.5"))

    if lease_ttl_seconds <= 0:
        raise ValueError("AGENT_LEASE_TTL_SECONDS must be positive")
    if poll_interval_seconds <= 0:
        raise ValueError("AGENT_POLL_INTERVAL_SECONDS must be positive")

    return WorkerConfig(
        agent_principal_id=agent_principal_id,
        lease_ttl_seconds=lease_ttl_seconds,
        poll_interval_seconds=poll_interval_seconds,
    )
