<!-- markdownlint-disable-file -->
# Release Changes: Postgres Data Model and Realtime Transport Layer

**Related Plan**: .copilot-tracking/plans/2026-07-16/postgres-and-realtime-transport-plan.instructions.md
**Implementation Date**: 2026-07-16

## Summary

Implementing Postgres-backed authoritative state and realtime transport hardening for collaborative canvas operations.

## Changes

### Added

* apps/server/drizzle.config.ts - Added Drizzle migration configuration for the server workspace
* apps/server/src/db/schema.ts - Added typed Postgres schema definitions for users, canvases, participants, tiles, operation_log, and snapshots
* apps/server/src/db/types.ts - Added shared database model aliases for persistence mapping
* apps/server/migrations/0000_overjoyed_lila_cheney.sql - Added initial Postgres migration baseline for the authoritative state model
* apps/server/migrations/meta/0000_snapshot.json - Added Drizzle schema snapshot metadata for the initial migration
* apps/server/migrations/meta/_journal.json - Added Drizzle migration journal metadata
* apps/server/src/db/client.ts - Added shared pg.Pool and Drizzle bootstrap for persisted server state
* apps/server/src/db/repository.ts - Added repository APIs for canvases, participants, tiles, operation history, snapshots, and pruning
* apps/server/src/db/snapshots.ts - Added snapshot cadence helpers for persisted session state
* apps/server/src/db/index.ts - Added database module barrel exports for runtime integration
* apps/server/src/jobs/retention.ts - Added scheduled retention bootstrap for operation and snapshot cleanup

### Modified

* apps/server/package.json - Added Postgres, Drizzle, retention, adapter, and integration-test dependencies plus migration scripts
* package-lock.json - Recorded workspace dependency and lockfile updates for the Phase 1 server foundation
* apps/server/src/index.ts - Replaced in-memory session lifecycle with Postgres-backed hydration, mutation persistence, snapshot writes, retention startup, and DB shutdown
* apps/server/src/contracts.ts - Added opSeq-bearing ack and broadcast payload metadata plus lastOpSeq on session snapshots
* apps/server/src/db/repository.ts - Added replay-oriented snapshot plus operation tail loading for reconnect hydration
* apps/server/src/index.test.ts - Expanded runtime tests for sequence-bearing acknowledgements and snapshot metadata
* apps/server/src/index.integration.test.ts - Added reconnect replay and sequence metadata coverage
* apps/client/src/interaction/controller.ts - Added sequence-aware reconciliation helpers and snapshot gap detection support
* apps/client/src/interaction/controller.test.ts - Added client-side sequence reconciliation coverage
* apps/server/src/db/repository.ts - Added presence lifecycle persistence helpers and transport-facing adapter support updates
* docs/decisions/2026-07-15-deployment-architecture-v01.md - Documented Socket.IO Postgres adapter usage with ACA sticky-session assumptions

### Removed

## Additional or Deviating Changes

* Normalized the initial migration baseline after Drizzle first generated placeholder-based CHECK constraint values.
	* Reason: The corrected schema and regenerated artifacts leave Phase 1 with a single clean initial migration instead of a baseline plus immediate corrective migration.
* Existing integration coverage still runs in-process rather than against a real Postgres instance.
	* Reason: Phase 2 kept test-surface changes minimal; stronger DB-backed integration coverage remains follow-on work.
* Client sequence handling was added as pure reconciliation helpers rather than live socket-event wiring.
	* Reason: The current client controller module is not yet the active socket transport consumer, so Phase 3 kept changes aligned with the existing client control surface.
* Multi-instance adapter wiring is implemented, but current fast tests do not exercise actual Postgres LISTEN/NOTIFY fan-out.
	* Reason: The present harness does not provide a real Postgres-backed multi-instance environment, so adapter runtime verification remains a follow-on integration concern.

## Release Summary

Implemented a Postgres-backed authoritative server state model and sequence-aware realtime transport baseline for collaborative canvas operations.

Files affected:
* Added database foundation files for schema, client bootstrap, repository access, snapshot helpers, retention scheduling, and migration metadata under apps/server/src/db, apps/server/src/jobs, and apps/server/migrations.
* Modified server runtime and transport contract files to persist authoritative state, expose sequence metadata, replay reconnect snapshots, and initialize the Socket.IO Postgres adapter.
* Modified client-side controller helpers and tests to support sequence-aware reconciliation.
* Updated the deployment decision record to document Postgres adapter usage with ACA sticky-session assumptions.

Validation status:
* Passed `npm run lint`
* Passed `npm run build`
* Passed `npm run test`

Outstanding limitations:
* Real Postgres-backed adapter fan-out and persistence integration coverage are still follow-on work.
* Reconnect replay is currently unbounded for large operation tails and should gain explicit guardrails in follow-up work.
