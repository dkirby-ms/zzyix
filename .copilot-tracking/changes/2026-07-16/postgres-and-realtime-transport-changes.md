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

### Modified

* apps/server/package.json - Added Postgres, Drizzle, retention, adapter, and integration-test dependencies plus migration scripts
* package-lock.json - Recorded workspace dependency and lockfile updates for the Phase 1 server foundation

### Removed

## Additional or Deviating Changes

* Normalized the initial migration baseline after Drizzle first generated placeholder-based CHECK constraint values.
	* Reason: The corrected schema and regenerated artifacts leave Phase 1 with a single clean initial migration instead of a baseline plus immediate corrective migration.

## Release Summary
