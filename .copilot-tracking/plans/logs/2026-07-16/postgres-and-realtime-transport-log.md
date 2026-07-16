<!-- markdownlint-disable-file -->
# Planning Log: Postgres Data Model and Realtime Transport Layer

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-06: retention archival destination (cold storage vs prune-only) remains undefined beyond TTL cleanup.
  * Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md (Lines 317-323)
  * Reason: Initial scope uses TTL and snapshot pruning; archival pipeline is follow-on work.
  * Impact: medium
* DR-08: reconnect replay strategy needs bounded replay policy when operation tails are large and snapshot is stale.
  * Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md (Lines 293-300)
  * Reason: Plan includes baseline replay but not explicit max tail guardrails.
  * Impact: medium
* DR-09: adapter reliability under ACA scale events should include explicit failover behavior tests.
  * Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md (Lines 304-316)
  * Reason: Plan validates baseline adapter usage and integration tests, not full chaos/failover simulation.
  * Impact: low
* DR-11: explicit ADR output for schema versioning strategy, snapshot trigger policy, and adapter rationale is not represented as a concrete plan deliverable.
  * Source: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md (Lines 344-347)
  * Reason: Research calls out ADRs to document, but plan/details only include an optional architecture decision amendment.
  * Impact: medium

### Addressed Research Items

* DR-05: deterministic op_seq increment under concurrent DB writes needs explicit transactional pattern (locking or conflict retry).
  * Resolution: Added an explicit implementation step in Phase 2 for transactional op_seq allocation strategy and made it a success criterion.
  * Implementation references: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md (Implementation Phase 2, Step 2.3), .copilot-tracking/details/2026-07-16/postgres-and-realtime-transport-details.md (Step 2.2)

### Plan Deviations from Research

* None currently.

## Implementation Paths Considered

### Selected: Drizzle plus Postgres-backed authoritative session state with Socket.IO Postgres adapter

* Approach: Implement Drizzle schema and migrations, persist authoritative canvas/session state in Postgres, add opSeq-rich transport payloads, and use @socket.io/postgres-adapter for multi-instance room synchronization.
* Rationale: Best alignment with research-selected stack, ACA operational model, and required reconnect sequencing behavior.
* Evidence: .copilot-tracking/research/2026-07-16/postgres-and-realtime-transport-research.md (Lines 213-236, 304-316)

### IP-01: Raw pg plus hand-authored SQL migrations

* Approach: Use node-postgres directly with custom migration table and handcrafted SQL scripts.
* Trade-offs: Maximum SQL control, minimum abstraction; higher drift risk and less type safety.
* Rejection rationale: Research identified migration/versioning and type-safety drawbacks against selected approach.

### IP-02: Prisma-managed persistence and migration pipeline

* Approach: Use Prisma schema/client and migration workflow for server persistence model.
* Trade-offs: Strong developer ergonomics but larger runtime footprint and TypeScript 6 compatibility friction.
* Rejection rationale: Research flagged CI/runtime overhead and compatibility friction relative to Drizzle.

### IP-03: Redis adapter for Socket.IO scaling

* Approach: Use @socket.io/redis-adapter for cross-instance room broadcast synchronization.
* Trade-offs: Common scaling pattern but introduces separate infra dependency and reconnect caveats.
* Rejection rationale: Postgres adapter reuses existing datastore and fits current infra simplicity goals.

## Suggested Follow-On Work

* WI-01: Define operation_log JSON schema evolution policy - Version op payload shape and enforce schema checks for backward compatibility. (high)
  * Source: DR-11
  * Dependency: Baseline operation_log persistence in production
* WI-02: Add transactional op_seq allocator stress test matrix and observability hardening - Validate lock/retry behavior under high contention writes. (high)
  * Source: Addressed DR-05 follow-on hardening
  * Dependency: Initial sequencing implementation complete
* WI-03: Design long-term archival pipeline for operation and participant history - Move beyond TTL pruning into cold storage export strategy. (medium)
  * Source: DR-06
  * Dependency: Operational metrics from initial production workloads
* WI-04: Expand adapter failover and resilience test matrix - Validate behavior across ACA scale events, failover, and reconnect storms. (medium)
  * Source: DR-09
  * Dependency: Baseline adapter integration and CI integration suite available
* WI-05: Add an explicit migration runner wrapper for operational apply and rollback workflows. (medium)
  * Source: Phase 1 implementation
  * Dependency: Baseline Postgres migration workflow adoption
