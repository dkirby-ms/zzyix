<!-- markdownlint-disable-file -->
# Release Changes: Authoritative Backend Domain Port

**Related Plan**: authoritative-backend-domain-port-plan.instructions.md  
**Implementation Date**: 2026-07-16

## Summary

All four implementation phases are complete. The server now acts as the authoritative source for placement validation, deterministic mutation ordering, reconciliation snapshots, and concurrency convergence tests.

## Changes

### Added

* apps/server/src/domain/math2d.ts - Added server-side geometry primitive helpers.
* apps/server/src/domain/tileGeometry.ts - Added server-side shape transform and decomposition logic.
* apps/server/src/domain/placementSolver.ts - Added server-side placement validation engine with validatePlacement export.
* apps/server/src/domain/placementSolver.port.test.ts - Added parity tests for overlap rejection and out-of-bounds handling.
* apps/server/src/index.test.ts - Added deterministic reject mapping and authoritative mutation behavior tests.
* apps/server/src/index.concurrency.test.ts - Added deterministic first-write-wins concurrency matrix tests.
* apps/server/src/index.integration.test.ts - Added snapshot and reconnect reconciliation tests from authoritative server state.
* apps/server/package-lock.json - Added lockfile generated during server dependency install for validation command execution.

### Modified

* .copilot-tracking/plans/2026-07-16/authoritative-backend-domain-port-plan.instructions.md - Marked Phases 1-4 steps complete.
* apps/server/src/index.ts - Implemented authoritative per-session state, operation sequencing, validation-based place handling, and idempotent remove handling.
* apps/server/src/contracts.ts - Added closed reject reason type for place acknowledgements.
* apps/server/tsconfig.json - Updated module target to a valid TypeScript compiler option for successful server builds.
* apps/server/src/index.concurrency.test.ts - Extended deterministic convergence coverage with repeat-run stability assertions.

### Removed

* None.

## Additional or Deviating Changes

* Validation required installing server dependencies before lint/test could run.
  * This produced apps/server/package-lock.json and apps/server/coverage artifacts not explicitly called out in the implementation plan.
* Phase 2 testability improvement gated server listen behavior under NODE_ENV=test in apps/server/src/index.ts.
  * This keeps tests deterministic by preventing network listener side effects during unit runs.
* Phase 4 surfaced TypeScript build failures from invalid module compiler option and runtime typing mismatches.
  * Fixed by setting module to esnext in apps/server/tsconfig.json and tightening listener code in apps/server/src/index.ts.
* No out-of-scope blockers remain after Phase 4 validation.

## Release Summary

Phases 1-4 complete. Added 8 implementation files plus one lockfile artifact, modified 6 implementation files and tracking artifacts, and removed 0 files. Validation passed for full server scope: `npm --prefix apps/server run lint`, `npm --prefix apps/server run test`, and `npm --prefix apps/server run build`.
