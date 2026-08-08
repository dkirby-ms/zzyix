from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, replace

from checkpoints import WorkerCheckpoint
from control_plane import ControlPlaneStore, LeaseHandle, TriggerRecord
from telemetry import emit_event
from workflow import GraphWorkflow, WorkflowTrigger

logger = logging.getLogger(__name__)


def parse_bool_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


@dataclass(frozen=True)
class WorkerConfig:
    agent_principal_id: str
    lease_ttl_seconds: int = 20
    poll_interval_seconds: float = 0.5
    model_free_enabled: bool = True


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
        if not self._config.model_free_enabled:
            emit_event("worker_feature_gate_blocked", gate="model_free")
            return ProcessOutcome(status="feature_disabled")

        trigger = self._control_plane.claim_next_trigger(self._config.agent_principal_id)
        if trigger is None:
            emit_event("worker_idle")
            return ProcessOutcome(status="idle")

        emit_event("worker_trigger_claimed", trigger_id=trigger.id, quilt_id=trigger.quilt_id)
        run_id = self._control_plane.start_or_resume_run(
            trigger.quilt_id,
            self._config.agent_principal_id,
            trigger.run_id,
        )
        lease = self._control_plane.claim_lease(
            quilt_id=trigger.quilt_id,
            run_id=run_id,
            owner_principal_id=self._config.agent_principal_id,
            ttl_seconds=self._config.lease_ttl_seconds,
        )

        if lease is None:
            emit_event("worker_lease_unavailable", run_id=run_id, trigger_id=trigger.id, quilt_id=trigger.quilt_id)
            self._control_plane.fail_run(run_id, "cancelled")
            self._control_plane.requeue_trigger(trigger.id, run_id)
            return ProcessOutcome(status="lease_unavailable", run_id=run_id, trigger_id=trigger.id)

        try:
            previous = self._control_plane.load_checkpoint(trigger.quilt_id, run_id)
            checkpoint_version = previous.checkpoint_version if previous is not None else None
            if previous is not None:
                emit_event(
                    "worker_checkpoint_recovered",
                    run_id=run_id,
                    trigger_id=trigger.id,
                    quilt_id=trigger.quilt_id,
                    checkpoint_version=previous.checkpoint_version,
                    workflow_state=previous.workflow_state,
                )

            def commit_checkpoint(checkpoint: WorkerCheckpoint) -> None:
                nonlocal checkpoint_version
                if checkpoint_version is not None and checkpoint.checkpoint_version <= checkpoint_version:
                    checkpoint = replace(checkpoint, checkpoint_version=checkpoint_version + 1)
                committed = self._control_plane.save_checkpoint(checkpoint, checkpoint_version)
                checkpoint_version = committed.checkpoint_version
                emit_event(
                    "worker_checkpoint_committed",
                    run_id=run_id,
                    quilt_id=trigger.quilt_id,
                    checkpoint_version=committed.checkpoint_version,
                )

            result = self._execute_workflow(trigger, run_id, lease, previous, commit_checkpoint)
            if result.status == "lease_lost":
                emit_event("worker_lease_lost", run_id=run_id, trigger_id=trigger.id, quilt_id=trigger.quilt_id)
                self._control_plane.fail_run(run_id, "cancelled")
                self._control_plane.requeue_trigger(trigger.id, run_id)
                return ProcessOutcome(status="lease_lost", run_id=run_id, trigger_id=trigger.id)

            if checkpoint_version != result.checkpoint.checkpoint_version:
                commit_checkpoint(result.checkpoint)
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

    def _execute_workflow(
        self,
        trigger: TriggerRecord,
        run_id: str,
        lease: LeaseHandle,
        checkpoint: WorkerCheckpoint | None,
        checkpoint_callback,
    ):
        lease_lost = threading.Event()
        stop_renewal = threading.Event()
        renewal_interval = max(0.1, self._config.lease_ttl_seconds / 3)

        def renew_until_stopped() -> None:
            while not stop_renewal.wait(renewal_interval):
                if not self._control_plane.renew_lease(
                    trigger.quilt_id,
                    run_id,
                    self._config.agent_principal_id,
                    lease.generation,
                    self._config.lease_ttl_seconds,
                ):
                    lease_lost.set()
                    return

        renewal_thread = threading.Thread(target=renew_until_stopped, name="lease-renewal", daemon=True)
        renewal_thread.start()

        def lease_guard() -> bool:
            if lease_lost.is_set():
                return False
            renewed = self._control_plane.renew_lease(
                quilt_id=trigger.quilt_id,
                run_id=run_id,
                owner_principal_id=self._config.agent_principal_id,
                generation=lease.generation,
                ttl_seconds=self._config.lease_ttl_seconds,
            )
            if not renewed:
                return False

            owned = self._control_plane.lease_is_owned(
                quilt_id=trigger.quilt_id,
                run_id=run_id,
                owner_principal_id=self._config.agent_principal_id,
                generation=lease.generation,
            )
            if not owned:
                lease_lost.set()
            return owned

        try:
            return self._workflow.run(
                run_id=run_id,
                trigger=WorkflowTrigger(
                    trigger_id=trigger.id,
                    quilt_id=trigger.quilt_id,
                    payload=trigger.payload,
                ),
                lease_guard=lease_guard,
                checkpoint=checkpoint,
                checkpoint_callback=checkpoint_callback,
            )
        finally:
            stop_renewal.set()


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
        model_free_enabled=parse_bool_flag("AGENT_FEATURE_MODEL_FREE_ENABLED", True),
    )
