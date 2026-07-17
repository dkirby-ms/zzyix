<!-- markdownlint-disable-file -->
# Planning Log: Revisioning and Idempotency

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None.

### Plan Deviations from Research

* DD-01: Plan introduces persisted idempotency key schema and migration in the primary implementation path, while research selected a Socket.IO-first tile-UUID dedup path without requiring a migration.
  * Research recommends: Prioritize tile UUID deduplication in repository transaction flow for current Socket.IO mutations; defer broader idempotency table adoption until REST expansion.
  * Plan implements: Adds idempotency_keys schema and migration now, then layers duplicate detection and opSeq replay behavior in repository handlers.
  * Rationale: Satisfies explicit idempotency-key requirement and enables retry durability across process restarts.

* DD-02: Plan brings forward revision metadata enforcement using explicit stale/out-of-order checks, even though research deferred full compare-and-swap parity to future HTTP mutation endpoints.
  * Research recommends: Keep stale-state conflict handling limited to current Socket.IO retry scope and defer full HTTP CAS parity until REST mutation endpoints exist.
  * Plan implements: Adds revision metadata support and typed stale/out-of-order conflict handling on current mutation flow.
  * Rationale: Delivers explicit conflict behavior now for existing mutation surface and avoids contract churn later.

* DD-03: Migration generation required index normalization due to existing journal drift in repository metadata.
  * Plan specifies: Generate new migration artifacts for schema additions.
  * Implementation differs: Generated migration was renamed from `0001` to `0002` and journal entries were updated to reflect existing `0001_gray_lord_hawal` before adding `0002_flat_cable`.
  * Rationale: Maintains append-only migration ordering and avoids duplicate migration index conflicts.

### Review-Driven Discrepancies Resolved

* DRR-01: place_tile idempotency identity ambiguity when `tileId` was optional in transport contract.
  * Resolution: `PlaceTilePayload.tileId` is now required and validated as UUID in handler payload guard.
  * Files: apps/server/src/contracts.ts, apps/server/src/index.ts, apps/server/src/index.test.ts, apps/server/src/index.integration.test.ts, apps/server/src/index.concurrency.test.ts

* DRR-02: idempotency key reuse lacked request-hash mismatch reject semantics.
  * Resolution: Added `REQUEST_HASH_MISMATCH` typed outcomes and repository checks for both place/remove flows.
  * Files: apps/server/src/contracts.ts, apps/server/src/db/repository.ts

* DRR-03: stale/out-of-order precondition checks requested at handler layer were only enforced in repository layer.
  * Resolution: Added explicit handler-level `expectedRevision` checks before repository mutation calls while preserving repository safeguards.
  * Files: apps/server/src/index.ts

* DRR-04: retention path did not prune expired `idempotency_keys` rows.
  * Resolution: Extended retention prune flow to remove expired keys and return deleted key count; added retention unit test.
  * Files: apps/server/src/db/repository.ts, apps/server/src/jobs/retention.ts, apps/server/src/jobs/retention.test.ts

## Implementation Paths Considered

### Selected: Tile UUID deduplication with advisory-lock transactional replay semantics

* Approach: Require and use deterministic tileId per placement, detect duplicate placement/removal within repository transaction, and return existing opSeq without duplicate writes.
* Rationale: Directly addresses retry duplication risk in current Socket.IO path with minimal schema changes and strong alignment to existing architecture.
* Evidence: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md (Lines 47-55, 97-123)

### IP-01: Dedicated idempotency_keys table with request/response caching

* Approach: Add idempotency_keys table keyed by client and request key, store response payloads, enforce request-hash consistency, and clean expired keys via retention.
* Trade-offs: Strong generic idempotency capability across endpoints, but introduces migration/runtime complexity and additional operational policy surface.
* Rejection rationale: Over-scoped for current Socket.IO-only mutation path; better aligned to future REST implementation.

### IP-02: lastKnownOpSeq optimistic conflict gating on every mutation

* Approach: Add lastKnownOpSeq to mutation payload and reject stale clients when server sequence has advanced.
* Trade-offs: Explicit conflict detection but risks rejecting valid collaborative concurrent operations in a cooperative editing model.
* Rejection rationale: Existing advisory lock already guarantees deterministic ordering and issue scope targets retry idempotency, not collaborative stale-write rejection.

### IP-03: Add canvases.version CAS now for future-proofing

* Approach: Add version column immediately and increment with every mutation.
* Trade-offs: Enables future HTTP compare-and-swap, but adds schema and runtime overhead without immediate usage path.
* Rejection rationale: Deferred until REST mutation surface exists to avoid speculative complexity.

## Suggested Follow-On Work

* WI-01: Add full REST mutation CAS semantics using canvases.version with cross-transport conflict parity. (medium)
  * Source: DR-10
  * Dependency: REST mutation endpoint implementation
* WI-02: Expand replay documentation into ADR-level operational guidance - Capture exact retry semantics, duplicate suppression guarantees, and observability expectations. (medium)
  * Source: Primary research documentation recommendations
  * Dependency: Completion of this implementation and production telemetry baselining
* WI-03: Add repository-level DB-backed tests for persisted idempotency key replay paths. (medium)
  * Source: Phase 4 implementation feedback
  * Dependency: Stable local/CI migration apply path for `idempotency_keys`
* WI-04: Extract and directly unit test emit/snapshot replay gating helper to reduce inline test simulation complexity. (low)
  * Source: Phase 4 implementation feedback
  * Dependency: Refactoring of socket handler side-effect gate in `apps/server/src/index.ts`