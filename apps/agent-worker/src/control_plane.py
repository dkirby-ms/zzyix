from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
from uuid import uuid4

from checkpoints import WorkerCheckpoint, checkpoint_from_row, checkpoint_to_record


@dataclass(frozen=True)
class TriggerRecord:
    id: str
    quilt_id: str
    source: str
    deduplication_key: str
    payload: dict[str, Any]
    priority: int
    created_at: datetime
    run_id: str | None = None
    claimed_by_agent_principal_id: str | None = None


@dataclass(frozen=True)
class LeaseHandle:
    quilt_id: str
    run_id: str
    owner_principal_id: str
    generation: int
    expires_at: datetime


class ControlPlaneStore(Protocol):
    def claim_next_trigger(self, owner_principal_id: str, reclaim_after_seconds: int = 60) -> TriggerRecord | None:
        ...

    def start_run(self, quilt_id: str, agent_principal_id: str) -> str:
        ...

    def start_or_resume_run(self, quilt_id: str, agent_principal_id: str, run_id: str | None) -> str:
        ...

    def claim_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, ttl_seconds: int) -> LeaseHandle | None:
        ...

    def renew_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int, ttl_seconds: int) -> bool:
        ...

    def lease_is_owned(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int) -> bool:
        ...

    def release_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int) -> None:
        ...

    def load_checkpoint(self, quilt_id: str, run_id: str | None = None) -> WorkerCheckpoint | None:
        ...

    def save_checkpoint(self, checkpoint: WorkerCheckpoint, expected_version: int | None) -> WorkerCheckpoint:
        ...

    def complete_run(self, run_id: str) -> None:
        ...

    def fail_run(self, run_id: str, status: str) -> None:
        ...

    def mark_trigger_completed(self, trigger_id: str, run_id: str) -> None:
        ...

    def mark_trigger_failed(self, trigger_id: str, run_id: str) -> None:
        ...

    def requeue_trigger(self, trigger_id: str, run_id: str) -> None:
        ...


class InMemoryControlPlane(ControlPlaneStore):
    def __init__(self) -> None:
        self._triggers: deque[dict[str, Any]] = deque()
        self._leases: dict[str, LeaseHandle] = {}
        self._checkpoints: dict[tuple[str, str], WorkerCheckpoint] = {}
        self._runs: dict[str, str] = {}
        self._run_agents: dict[str, str] = {}
        self._assignments: dict[str, str] = {}

    def assign_quilt(self, quilt_id: str, agent_principal_id: str) -> None:
        self._assignments[quilt_id] = agent_principal_id

    def enqueue_trigger(self, quilt_id: str, payload: dict[str, Any], source: str = "test", deduplication_key: str = "seed", priority: int = 100) -> str:
        trigger_id = str(uuid4())
        self._triggers.append({
            "id": trigger_id,
            "quilt_id": quilt_id,
            "source": source,
            "deduplication_key": deduplication_key,
            "payload": payload,
            "priority": priority,
            "created_at": datetime.now(timezone.utc),
            "status": "pending",
            "run_id": None,
            "claimed_at": None,
            "claimed_by_agent_principal_id": None,
        })
        return trigger_id

    def claim_next_trigger(self, owner_principal_id: str, reclaim_after_seconds: int = 60) -> TriggerRecord | None:
        now = datetime.now(timezone.utc)
        candidates = [
            item for item in self._triggers
            if self._assignments.get(item["quilt_id"]) == owner_principal_id
            and (
                item["status"] == "pending"
                or (
                    item["status"] == "claimed"
                    and item["claimed_at"] is not None
                    and item["claimed_at"] <= now - timedelta(seconds=reclaim_after_seconds)
                )
            )
        ]
        if not candidates:
            return None

        selected = sorted(candidates, key=lambda item: (item["priority"], item["created_at"]))[0]
        selected["status"] = "claimed"
        selected["claimed_by_agent_principal_id"] = owner_principal_id
        selected["claimed_at"] = now
        return TriggerRecord(
            id=selected["id"],
            quilt_id=selected["quilt_id"],
            source=selected["source"],
            deduplication_key=selected["deduplication_key"],
            payload=dict(selected["payload"]),
            priority=int(selected["priority"]),
            created_at=selected["created_at"],
            run_id=selected["run_id"],
            claimed_by_agent_principal_id=selected["claimed_by_agent_principal_id"],
        )

    def start_run(self, quilt_id: str, agent_principal_id: str) -> str:
        del quilt_id
        run_id = str(uuid4())
        self._runs[run_id] = "running"
        self._run_agents[run_id] = agent_principal_id
        return run_id

    def start_or_resume_run(self, quilt_id: str, agent_principal_id: str, run_id: str | None) -> str:
        if (
            run_id is not None
            and self._run_agents.get(run_id) == agent_principal_id
            and run_id in self._runs
        ):
            self._runs[run_id] = "running"
            return run_id
        return self.start_run(quilt_id, agent_principal_id)

    def claim_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, ttl_seconds: int) -> LeaseHandle | None:
        now = datetime.now(timezone.utc)
        existing = self._leases.get(quilt_id)
        if existing and existing.expires_at > now:
            return None

        generation = 1 if existing is None else existing.generation + 1
        lease = LeaseHandle(
            quilt_id=quilt_id,
            run_id=run_id,
            owner_principal_id=owner_principal_id,
            generation=generation,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        self._leases[quilt_id] = lease
        return lease

    def renew_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int, ttl_seconds: int) -> bool:
        lease = self._leases.get(quilt_id)
        if lease is None:
            return False

        if lease.run_id != run_id or lease.owner_principal_id != owner_principal_id or lease.generation != generation:
            return False

        self._leases[quilt_id] = LeaseHandle(
            quilt_id=lease.quilt_id,
            run_id=lease.run_id,
            owner_principal_id=lease.owner_principal_id,
            generation=lease.generation,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
        )
        return True

    def lease_is_owned(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int) -> bool:
        lease = self._leases.get(quilt_id)
        if lease is None:
            return False
        if lease.expires_at <= datetime.now(timezone.utc):
            return False

        return lease.run_id == run_id and lease.owner_principal_id == owner_principal_id and lease.generation == generation

    def release_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int) -> None:
        if self.lease_is_owned(quilt_id, run_id, owner_principal_id, generation):
            del self._leases[quilt_id]

    def load_checkpoint(self, quilt_id: str, run_id: str | None = None) -> WorkerCheckpoint | None:
        if run_id is not None:
            return self._checkpoints.get((quilt_id, run_id))
        checkpoints = [checkpoint for (checkpoint_quilt_id, _), checkpoint in self._checkpoints.items() if checkpoint_quilt_id == quilt_id]
        return max(checkpoints, key=lambda checkpoint: checkpoint.updated_at, default=None)

    def save_checkpoint(self, checkpoint: WorkerCheckpoint, expected_version: int | None) -> WorkerCheckpoint:
        key = (checkpoint.quilt_id, checkpoint.run_id)
        existing = self._checkpoints.get(key)
        if expected_version is not None:
            current = 0 if existing is None else existing.checkpoint_version
            if current != expected_version:
                raise RuntimeError("checkpoint compare-and-set failed")

        self._checkpoints[key] = checkpoint
        return checkpoint

    def complete_run(self, run_id: str) -> None:
        self._runs[run_id] = "succeeded"

    def fail_run(self, run_id: str, status: str) -> None:
        self._runs[run_id] = status

    def mark_trigger_completed(self, trigger_id: str, run_id: str) -> None:
        for trigger in self._triggers:
            if trigger["id"] == trigger_id:
                trigger["status"] = "completed"
                trigger["run_id"] = run_id
                return

    def mark_trigger_failed(self, trigger_id: str, run_id: str) -> None:
        for trigger in self._triggers:
            if trigger["id"] == trigger_id:
                trigger["status"] = "failed"
                trigger["run_id"] = run_id
                return

    def requeue_trigger(self, trigger_id: str, run_id: str) -> None:
        for trigger in self._triggers:
            if trigger["id"] == trigger_id:
                trigger["status"] = "pending"
                trigger["run_id"] = run_id
                trigger["claimed_at"] = None
                trigger["claimed_by_agent_principal_id"] = None
                return


class PostgresControlPlane(ControlPlaneStore):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

        try:
            import psycopg  # type: ignore
        except ImportError as exc:
            raise RuntimeError("psycopg is required for PostgresControlPlane") from exc

        self._psycopg = psycopg

    def claim_next_trigger(self, owner_principal_id: str, reclaim_after_seconds: int = 60) -> TriggerRecord | None:
        sql = """
with settings as (
    select claim_timeout_seconds
    from agent_control.trigger_queue_limits
    where singleton_key = 'default'
), candidate as (
    select queue.id, queue.quilt_id, queue.source, queue.deduplication_key, queue.payload,
                 queue.priority, queue.created_at, queue.run_id, queue.claimed_by_agent_principal_id
    from agent_control.trigger_queue as queue
    join agent_control.agent_assignments as assignment
        on assignment.quilt_id = queue.quilt_id
     and assignment.agent_principal_id = %s
     and assignment.status = 'active'
    cross join settings
    where queue.status = 'pending'
         or (queue.status = 'claimed'
                 and queue.claimed_at <= now() - make_interval(secs => greatest(%s, settings.claim_timeout_seconds)))
  order by priority asc, created_at asc
  for update skip locked
  limit 1
)
update agent_control.trigger_queue as queue
set status = 'claimed', claimed_at = now(), claimed_by_agent_principal_id = %s
from candidate
where queue.id = candidate.id
returning candidate.id, candidate.quilt_id, candidate.source, candidate.deduplication_key,
                    candidate.payload, candidate.priority, candidate.created_at, candidate.run_id,
                    candidate.claimed_by_agent_principal_id
"""
        row = self._fetchone(sql, (owner_principal_id, reclaim_after_seconds, owner_principal_id))
        if row is None:
            return None

        return TriggerRecord(
            id=str(row[0]),
            quilt_id=str(row[1]),
            source=str(row[2]),
            deduplication_key=str(row[3]),
            payload=dict(row[4]),
            priority=int(row[5]),
            created_at=row[6],
            run_id=str(row[7]) if row[7] is not None else None,
            claimed_by_agent_principal_id=str(row[8]) if row[8] is not None else None,
        )

    def start_run(self, quilt_id: str, agent_principal_id: str) -> str:
        sql = """
insert into agent_control.runs (quilt_id, agent_principal_id)
values (%s, %s)
returning id
"""
        row = self._fetchone(sql, (quilt_id, agent_principal_id))
        if row is None:
            raise RuntimeError("failed to start run")
        return str(row[0])

    def start_or_resume_run(self, quilt_id: str, agent_principal_id: str, run_id: str | None) -> str:
        if run_id is not None:
            existing = self._fetchone(
                     """select id from agent_control.runs
                         where id = %s and quilt_id = %s and agent_principal_id = %s
                            and status in ('running', 'failed', 'cancelled')""",
                (run_id, quilt_id, agent_principal_id),
            )
            if existing is not None:
                self._execute(
                    """update agent_control.runs
                       set status = 'running', ended_at = null
                       where id = %s""",
                    (run_id,),
                )
                return str(existing[0])
        return self.start_run(quilt_id, agent_principal_id)

    def claim_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, ttl_seconds: int) -> LeaseHandle | None:
        sql = """
insert into agent_control.quilt_leases (quilt_id, lease_owner_principal_id, run_id, expires_at)
values (%s, %s, %s, now() + (%s || ' seconds')::interval)
on conflict (quilt_id) do update
set lease_owner_principal_id = excluded.lease_owner_principal_id,
    run_id = excluded.run_id,
    acquired_at = now(),
    heartbeat_at = now(),
    expires_at = excluded.expires_at,
    generation = agent_control.quilt_leases.generation + 1
where agent_control.quilt_leases.expires_at <= now()
returning quilt_id, run_id, lease_owner_principal_id, generation, expires_at
"""
        row = self._fetchone(sql, (quilt_id, owner_principal_id, run_id, ttl_seconds))
        if row is None:
            return None

        return LeaseHandle(
            quilt_id=str(row[0]),
            run_id=str(row[1]),
            owner_principal_id=str(row[2]),
            generation=int(row[3]),
            expires_at=row[4],
        )

    def renew_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int, ttl_seconds: int) -> bool:
        sql = """
update agent_control.quilt_leases
set heartbeat_at = now(),
    expires_at = now() + (%s || ' seconds')::interval
where quilt_id = %s
  and run_id = %s
  and lease_owner_principal_id = %s
  and generation = %s
  and expires_at > now()
returning quilt_id
"""
        return self._fetchone(sql, (ttl_seconds, quilt_id, run_id, owner_principal_id, generation)) is not None

    def lease_is_owned(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int) -> bool:
        sql = """
select 1
from agent_control.quilt_leases
where quilt_id = %s
  and run_id = %s
  and lease_owner_principal_id = %s
  and generation = %s
  and expires_at > now()
"""
        return self._fetchone(sql, (quilt_id, run_id, owner_principal_id, generation)) is not None

    def release_lease(self, quilt_id: str, run_id: str, owner_principal_id: str, generation: int) -> None:
        sql = """
delete from agent_control.quilt_leases
where quilt_id = %s
  and run_id = %s
  and lease_owner_principal_id = %s
  and generation = %s
"""
        self._execute(sql, (quilt_id, run_id, owner_principal_id, generation))

    def load_checkpoint(self, quilt_id: str, run_id: str | None = None) -> WorkerCheckpoint | None:
        sql = """
select quilt_id, run_id, checkpoint_version, workflow_state, observed_revision, pending_trigger_ids, policy_version, framework_version, updated_at
from agent_control.checkpoints
where quilt_id = %s
    and (%s is null or run_id = %s)
order by updated_at desc
limit 1
"""
        row = self._fetchone(sql, (quilt_id, run_id, run_id))
        if row is None:
            return None

        return checkpoint_from_row({
            "quilt_id": row[0],
            "run_id": row[1],
            "checkpoint_version": row[2],
            "workflow_state": row[3],
            "observed_revision": row[4],
            "pending_trigger_ids": row[5],
            "policy_version": row[6],
            "framework_version": row[7],
            "updated_at": row[8],
        })

    def save_checkpoint(self, checkpoint: WorkerCheckpoint, expected_version: int | None) -> WorkerCheckpoint:
        record = checkpoint_to_record(checkpoint)

        if expected_version is None:
            sql = """
insert into agent_control.checkpoints (
  quilt_id, run_id, checkpoint_version, workflow_state, observed_revision, pending_trigger_ids, policy_version, framework_version, updated_at
)
values (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
on conflict (quilt_id, run_id) do update
set checkpoint_version = excluded.checkpoint_version,
    workflow_state = excluded.workflow_state,
    observed_revision = excluded.observed_revision,
    pending_trigger_ids = excluded.pending_trigger_ids,
    policy_version = excluded.policy_version,
    framework_version = excluded.framework_version,
    updated_at = excluded.updated_at
"""
            self._execute(sql, (
                record["quilt_id"],
                record["run_id"],
                record["checkpoint_version"],
                record["workflow_state"],
                record["observed_revision"],
                self._psycopg.types.json.Jsonb(record["pending_trigger_ids"]),
                record["policy_version"],
                record["framework_version"],
                record["updated_at"],
            ))
            return checkpoint

        sql = """
update agent_control.checkpoints
set checkpoint_version = %s,
    workflow_state = %s,
    observed_revision = %s,
    pending_trigger_ids = %s::jsonb,
    policy_version = %s,
    framework_version = %s,
    updated_at = %s
where quilt_id = %s
  and run_id = %s
  and checkpoint_version = %s
returning checkpoint_version
"""
        row = self._fetchone(sql, (
            record["checkpoint_version"],
            record["workflow_state"],
            record["observed_revision"],
            self._psycopg.types.json.Jsonb(record["pending_trigger_ids"]),
            record["policy_version"],
            record["framework_version"],
            record["updated_at"],
            record["quilt_id"],
            record["run_id"],
            expected_version,
        ))
        if row is None:
            raise RuntimeError("checkpoint compare-and-set failed")

        return checkpoint

    def complete_run(self, run_id: str) -> None:
        sql = "update agent_control.runs set status = 'succeeded', ended_at = now() where id = %s"
        self._execute(sql, (run_id,))

    def fail_run(self, run_id: str, status: str) -> None:
        sql = "update agent_control.runs set status = %s, ended_at = now() where id = %s"
        self._execute(sql, (status, run_id))

    def mark_trigger_completed(self, trigger_id: str, run_id: str) -> None:
        sql = """
update agent_control.trigger_queue
set status = 'completed', run_id = %s, resolved_at = now()
where id = %s
"""
        self._execute(sql, (run_id, trigger_id))

    def mark_trigger_failed(self, trigger_id: str, run_id: str) -> None:
        sql = """
update agent_control.trigger_queue
set status = 'failed', run_id = %s, resolved_at = now()
where id = %s
"""
        self._execute(sql, (run_id, trigger_id))

    def requeue_trigger(self, trigger_id: str, run_id: str) -> None:
        sql = """
update agent_control.trigger_queue
set status = 'pending', run_id = %s, claimed_at = null, claimed_by_agent_principal_id = null
where id = %s and status = 'claimed'
"""
        self._execute(sql, (run_id, trigger_id))

    def _execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self._psycopg.connect(self._dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)

    def _fetchone(self, sql: str, params: tuple[Any, ...] = ()) -> tuple[Any, ...] | None:
        with self._psycopg.connect(self._dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                row = cursor.fetchone()
        return row
