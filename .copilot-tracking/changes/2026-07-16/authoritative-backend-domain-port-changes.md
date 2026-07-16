<!-- markdownlint-disable-file -->
# Release Changes: Authoritative Backend Domain Port

**Related Plan**: authoritative-backend-domain-port-plan.instructions.md  
**Implementation Date**: 2026-07-16

## Summary

All four implementation phases are complete. The server now acts as the authoritative source for placement validation, deterministic mutation ordering, reconciliation snapshots, and concurrency convergence tests.

Runtime hardening rework was added after implementation review findings. The server now enforces runtime payload boundaries, safely handles optional/malformed ack callbacks, avoids wildcard credentialed CORS fallback, includes deterministic session cleanup helpers, and aligns contract documentation with authoritative runtime behavior.

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
* .copilot-tracking/plans/2026-07-16/authoritative-backend-domain-port-plan.instructions.md - Added and completed Phase 5 runtime hardening rework steps.
* .copilot-tracking/details/2026-07-16/authoritative-backend-domain-port-details.md - Added detailed implementation guidance for Phase 5 rework scope.
* apps/server/src/index.ts - Added runtime payload guards, safe ack invocation helper, credential-safe CORS origin resolver, and deterministic session cleanup helpers.
* apps/server/src/index.test.ts - Added tests for malformed payload handling, missing/non-function ack safety, CORS origin resolution, and session cleanup behavior.
* apps/server/src/contracts.ts - Aligned bounds documentation with authoritative solver constants and clarified remove_tile tileId semantics comment.

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
* Review-driven rework added a new Phase 5 after original plan closure.
  * Rationale: Implementation quality review identified production hardening gaps requiring targeted follow-up within the same task.
* Validation evidence remains full-command scoped instead of persisted per-phase command transcript blocks.
  * Rationale: Current release process captures final command outcomes; granular transcript persistence remains a process follow-on item.

## Release Summary

Phases 1-5 complete. Implementation includes authoritative domain port, deterministic mutation semantics, reconciliation/concurrency tests, and review-driven runtime hardening.

Files changed for implementation scope:
* Added: 8 server implementation/test files plus server lockfile artifact from dependency install.
* Modified: apps/server/src/index.ts, apps/server/src/index.test.ts, apps/server/src/contracts.ts, apps/server/src/index.concurrency.test.ts, apps/server/tsconfig.json, and .copilot-tracking plan/detail/change logs.
* Removed: 0.

Validation status (post-rework):
* npm --prefix apps/server run lint - pass
* npm --prefix apps/server run test - pass (4 files, 20 tests)
* npm --prefix apps/server run build - pass
