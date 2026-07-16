<!-- markdownlint-disable-file -->
# Release Changes: Revisioning and Idempotency

**Related Plan**: .copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md
**Implementation Date**: 2026-07-16

## Summary

Implement deterministic revision sequencing and idempotent mutation handling for Socket.IO tile operations.

## Changes

### Added

* apps/server/migrations/0002_flat_cable.sql - Added migration for idempotency key storage and canvas revision column.
* apps/server/migrations/meta/0002_snapshot.json - Added Drizzle snapshot metadata for migration 0002.

### Modified

* apps/server/src/db/schema.ts - Added `canvases.version` and new `idempotency_keys` table with composite PK, uniqueness, and TTL index.
* apps/server/migrations/meta/_journal.json - Added migration journal entry sequence for 0001 and 0002.
* apps/server/src/contracts.ts - Expanded mutation ack/reject contracts for duplicate, stale, and out-of-order idempotency outcomes.
* apps/server/src/db/repository.ts - Added advisory-lock-safe duplicate/replay handling for place/remove mutations with persisted idempotency outcomes.
* apps/server/src/index.ts - Updated socket mutation handling for revision preconditions and replay-safe ack/broadcast behavior.
* apps/server/src/jobs/retention.ts - Added explicit retention notes for idempotency-key TTL cleanup responsibilities.
* apps/server/src/index.test.ts - Added unit coverage for replay safety, deterministic ordering behavior, and revision payload guard validation.
* apps/server/src/index.integration.test.ts - Added integration coverage for duplicate retry opSeq reuse, typed revision rejects, and no duplicate replay emission semantics.

### Removed

* None.

## Additional or Deviating Changes

* Migration sequencing adjustment was applied to resolve metadata drift.
	* Drizzle initially generated a `0001` migration; it was promoted to `0002` to preserve append-only migration history with the existing `0001_gray_lord_hawal.sql`.
* Repository response typing was narrowed for persisted idempotency replay reads.
	* Build surfaced `unknown` response narrowing in replay logic; fixed with explicit type guard/narrowing to keep strict TypeScript safety.
* Replay broadcasts were explicitly suppressed in socket handlers when repository responses indicate idempotent replays.
	* This preserves deterministic ack semantics while avoiding duplicate `tile_placed`/`tile_removed` emissions for retried operations.

## Release Summary

All five implementation phases are complete. Files affected: 11 total (2 added, 9 modified, 0 removed).

Added files:
* apps/server/migrations/0002_flat_cable.sql
* apps/server/migrations/meta/0002_snapshot.json

Modified files:
* apps/server/src/db/schema.ts
* apps/server/migrations/meta/_journal.json
* apps/server/src/contracts.ts
* apps/server/src/db/repository.ts
* apps/server/src/index.ts
* apps/server/src/jobs/retention.ts
* apps/server/src/index.test.ts
* apps/server/src/index.integration.test.ts
* .copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md

Implementation outcome:
* Added persisted idempotency metadata (`idempotency_keys`) and canvas revision tracking (`canvases.version`).
* Preserved advisory-lock-protected opSeq allocation and implemented duplicate/replay-safe mutation behavior in repository flows.
* Added typed stale/out-of-order conflict semantics in contracts and enforced revision preconditions in mutation paths.
* Updated socket handlers to suppress duplicate replay broadcasts while preserving deterministic acknowledgement semantics.
* Added unit/integration tests for duplicate retry behavior, opSeq reuse, and revision conflict outcomes.

Validation:
* `npm --prefix apps/server run lint` - passed
* `npm --prefix apps/server run build` - passed
* `npm --prefix apps/server run test -- index` - passed
* `npm --prefix apps/server run test -- index.integration` - passed
* `npm run lint` - passed
* `npm run build` - passed (client chunk-size warning only; non-blocking)
* `npm run test` - passed

Deployment/infrastructure notes:
* Database migration sequence now includes `0002_flat_cable` after normalization of migration journal continuity.
* No runtime service topology changes required.
