<!-- markdownlint-disable-file -->

# Release Changes: Canonical Infinite Canvas Convergence

**Related Plan**: canonical-infinite-canvas-convergence-plan.instructions.md
**Implementation Date**: 2026-07-29

## Summary

Implementation review found the canonical product path present but release-blocked. Phase 8
closes the final child-attempt integrity, long-lived reconnect, compiled-contract,
live-boundary, Playwright-isolation, release-reporting, and ADR findings.

## Changes

### Added

* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/research/subagents/2026-07-29/infinite-canvas-convergence-research.md`
* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`
* `apps/server/migrations/0007_canonical_world.sql` - Added the expand-only canonical pointer schema
* `apps/server/migrations/meta/0007_snapshot.json` - Recorded the canonical pointer schema snapshot
* `apps/server/src/cli/selectCanonicalWorld.ts` - Added strict status, provision, activate, and deactivate operator actions
* `apps/server/src/cli/selectCanonicalWorld.test.ts` - Covered CLI parsing and safe machine results
* `apps/server/src/db/canonicalWorld.postgres.integration.test.ts` - Covered canonical validation, generation, concurrency, replay, and discovery behavior
* `apps/client/src/network/canonicalWorld.test.ts` - Covered authenticated canonical descriptor mapping and unavailable errors
* `apps/server/migrations/0008_nostalgic_maximus.sql` - Added expiring per-socket canonical quilt presence leases
* `apps/server/migrations/meta/0008_snapshot.json` - Recorded the presence lease schema snapshot
* `apps/server/src/operations/canonicalRetirementReportCli.ts` - Added strict NDJSON evidence validation and deterministic digest-bound retirement reports
* `apps/server/src/operations/canonicalRetirementReportCli.test.ts` - Covered deduplication, rates, percentiles, rollback windows, strict validation, and repeated runtime samples
* `apps/server/src/domain/legacySession.ts` - Retained internal-only database compatibility types outside the public runtime contract
* `apps/server/src/migration/canonicalAttempts.ts` - Added PostgreSQL-backed, principal-bound canonical attempt issuance and atomic consumption
* `apps/server/src/migration/canonicalAttempts.postgres.integration.test.ts` - Covered cross-replica issuance, concurrency, ownership, expiry, and child lineage
* `apps/server/migrations/0009_charming_siren.sql` - Added expand-only shared canonical attempt persistence
* `apps/server/migrations/meta/0009_snapshot.json` - Recorded the canonical attempt schema snapshot

### Modified

* `.github/workflows/cd.yml` - Deployed immutable retirement evidence and removed final canonical canary controls
* `apps/client/Dockerfile` - Removed retired canonical-entry runtime configuration
* `apps/client/public/auth-config.template.json` - Removed the retired canonical-entry setting
* `apps/client/src/App.tsx` - Removed final-state entry gating and bound canonical telemetry delivery
* `apps/client/src/auth/AuthSessionProvider.tsx` - Removed the retired entry-gate session contract
* `apps/client/src/auth/TestAuthProvider.tsx` - Updated test authentication for unconditional canonical entry
* `apps/client/src/auth/useAuthSession.tsx` - Removed the retired entry-gate session field
* `apps/client/src/config/runtimeConfig.ts` - Removed canonical-entry feature parsing
* `apps/client/src/network/useSocketConnection.ts` - Delivered terminal telemetry through the authenticated socket attempt
* `apps/server/Dockerfile` - Materialized immutable retirement evidence before server startup
* `apps/server/src/contracts.ts` - Removed retired public session runtime contracts and tightened canonical telemetry contracts
* `apps/server/src/db/repository.ts` - Restricted activation to the provisioned inactive generation-1 pointer
* `apps/server/src/index.ts` - Removed retired runtime state and handlers, bound telemetry identity, and enforced presence lease loss
* `apps/server/src/migration/quiltTelemetry.ts` - Added explicit pre-world telemetry identity semantics
* `apps/server/src/operations/canonicalRetirementReportCli.ts` - Recomputed promotion conclusions from accepted evidence
* `apps/server/src/startup/rolloutGates.ts` - Required retirement evidence for every production start
* `playwright.config.ts` - Removed retired canonical canary configuration
* `scripts/release-contract.test.mjs` - Enforced immutable evidence wiring and absence of final canary flags
* Focused client and server tests - Covered evidence derivation, telemetry binding, live HTTP and Socket.IO boundaries, activation provenance, lease loss, and unconditional entry
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Corrected keyword frontmatter indentation
* `.github/workflows/cd.yml` - Installed immutable retirement evidence in both existing-app and create deployment branches
* `scripts/release-contract.test.mjs` - Distinguished and enforced evidence installation in both deployment branches
* `apps/server/src/contracts.ts` - Removed residual public session and snapshot contracts and added attempt lineage contracts
* `apps/server/src/index.ts` - Enforced shared attempt ownership and consumption across live HTTP and Socket.IO boundaries
* `apps/server/src/index.integration.test.ts` - Composed real authentication, compatibility, telemetry, navigation, claim, and presence boundaries
* `apps/server/src/operations/canonicalRetirementReportCli.ts` - Accepted unique child attempt terminals while preserving parent entry eligibility
* `apps/client/src/network/useSocketConnection.ts` - Requested server-issued reconnect and resubscribe child attempts
* `apps/client/src/App.tsx` - Removed residual retired snapshot handling and restored durable placement accounting
* `e2e/quilt-reconnect.spec.ts` - Acquired authenticated server-issued attempts for cross-replica reconnect
* `e2e/quilt-seams.spec.ts` - Acquired authenticated server-issued attempts for direct socket coverage
* `apps/server/src/db/schema.ts` - Added canonical attempt table constraints and indexes
* `apps/server/src/db/schema.test.ts` - Covered canonical attempt schema invariants
* `apps/server/src/db/migrate.test.ts` - Updated migration-count compatibility for migration 0009
* `apps/server/migrations/meta/_journal.json` - Registered migration 0009
* `scripts/verify-quilt-migration.sh` - Extended migration rehearsal through canonical attempt persistence
* `apps/server/src/migration/canonicalAttempts.ts` - Added rotating durable lineage and atomic server-observed cycle consumption
* `apps/server/src/migration/canonicalAttempts.postgres.integration.test.ts` - Covered expiry, rotation, replay, ownership, and cross-replica cycle consumption
* `apps/server/src/contracts.ts` - Removed compiled session-era public contracts and defined secure lineage messages
* `apps/server/src/auth/httpAuth.ts` - Removed the retired `/me` session command field
* `apps/server/src/auth/httpAuth.test.ts` - Covered the reduced authenticated command contract
* `apps/server/src/index.ts` - Bound reconnect and resubscribe attempts to live observed socket cycles
* `apps/server/src/index.test.ts` - Covered retired contract and attempt behavior
* `apps/server/src/index.integration.test.ts` - Exercised navigation, claim, and presence through live authenticated boundaries
* `apps/client/src/network/useSocketConnection.ts` - Rotated reconnect lineage and consumed server-observed child cycles
* `apps/client/src/network/useSocketConnection.test.ts` - Covered lineage rotation, expiry, and observed-cycle handling
* `apps/client/src/App.tsx` - Removed remaining retired session assumptions from canonical runtime state
* `apps/client/src/App.test.tsx` - Updated canonical application assertions for the retired contract
* `apps/client/src/auth/useAuthSession.test.tsx` - Updated authentication expectations after command retirement
* `e2e/multi-user-fixtures.spec.ts` - Asserted authoritative exact convergence without order-dependent optimistic state
* `e2e/quilt-reconnect.spec.ts` - Used rotating server-observed reconnect lineage
* `e2e/quilt-seams.spec.ts` - Used the final canonical socket contract
* `e2e/support/multiUser.ts` - Isolated multi-user canonical fixture state
* `e2e/support/testState.ts` - Reset authoritative fixture state between standard Playwright cases
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Corrected and YAML-validated keyword indentation

* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` - Established one newly provisioned 32-by-32 canonical quilt, durable navigation and claim behavior, ownership limits, and database-backed presence leases
* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md` - Marked Phase 0 complete
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md` - Recorded approved product and runtime decisions
* `apps/server/migrations/meta/_journal.json` - Registered migration 0007
* `apps/server/package.json` - Exposed the compiled canonical-world operator command
* `apps/server/src/contracts.ts` - Added canonical descriptor and unavailable response contracts
* `apps/server/src/contracts.test.ts` - Covered canonical descriptor serialization
* `apps/server/src/db/migrate.test.ts` - Updated migration-count compatibility
* `apps/server/src/db/repository.ts` - Added canonical validation, provisioning, CAS mutation, status, and discovery operations
* `apps/server/src/db/schema.ts` - Added the singleton canonical pointer table
* `apps/server/src/db/schema.test.ts` - Covered canonical pointer constraints and indexes
* `apps/server/src/index.ts` - Added authenticated canonical discovery
* `apps/server/src/index.integration.test.ts` - Covered canonical discovery authentication and unavailable mapping
* `package.json` - Exposed the root canonical-world command
* `scripts/verify-quilt-migration.sh` - Added pointer upgrade, replay, stale-generation, inactive, and routing-rollback rehearsal
* `.github/workflows/cd.yml` - Propagated fail-closed canonical discovery, canonical entry, protocol-V2, and mutation gates
* `apps/client/Dockerfile` - Required and emitted the runtime canonical-entry JSON boolean
* `apps/client/public/auth-config.template.json` - Documented the canonical-entry deployment value
* `apps/client/src/App.tsx` - Added authenticated canonical discovery, automatic entry, controlled unavailable state, rollback lobby, and protected-state clearing
* `apps/client/src/App.test.tsx` - Covered canonical root entry, reload, authentication transitions, unavailable targets, V1 rejection, and rollback
* `apps/client/src/auth/AuthProvider.test.tsx` - Updated runtime configuration fixtures
* `apps/client/src/auth/AuthSessionProvider.tsx` - Exposed canonical entry configuration through authenticated state
* `apps/client/src/auth/TestAuthProvider.tsx` - Exposed deterministic canonical entry configuration in tests
* `apps/client/src/auth/msalConfig.test.ts` - Updated runtime configuration fixtures
* `apps/client/src/auth/useAuthSession.tsx` - Carried canonical entry configuration through the auth session contract
* `apps/client/src/auth/useAuthSession.test.tsx` - Covered the extended auth session contract
* `apps/client/src/config/runtimeConfig.ts` - Required a real runtime canonical-entry boolean
* `apps/client/src/config/runtimeConfig.test.ts` - Rejected missing, string-valued, and unresolved canonical-entry values
* `apps/client/src/network/session.ts` - Added canonical discovery without selected-session storage access
* `apps/client/src/network/useSocketConnection.ts` - Required protocol V2 for canonical entry
* `apps/client/src/network/useSocketConnection.test.ts` - Covered expected-V2 negotiation rejection
* `apps/client/src/test/canvasTestApi.ts` - Extended test controls for canonical entry states
* `apps/client/src/ui/AppHeader.tsx` - Reflected canonical loading and unavailable states
* `apps/server/src/index.ts` - Applied the independent canonical discovery gate
* `apps/server/src/index.integration.test.ts` - Covered gated canonical discovery behavior
* `apps/server/src/startup/rolloutGates.ts` - Validated production canonical gate combinations
* `apps/server/src/startup/rolloutGates.test.ts` - Covered invalid canonical production combinations
* `scripts/release-contract.test.mjs` - Verified deployment flag wiring and fail-closed defaults
* `apps/server/migrations/meta/_journal.json` - Registered migration 0008
* `apps/server/src/contracts.ts` - Added canonical eligible-patch and durable navigation contracts
* `apps/server/src/db/repository.ts` - Added deterministic eligible-patch reads and transactional cross-replica presence lease operations
* `apps/server/src/db/schema.ts` - Added expiring per-socket quilt presence leases
* `apps/server/src/db/schema.test.ts` - Covered presence lease constraints and indexes
* `apps/server/src/db/ownership.postgres.integration.test.ts` - Covered cross-replica first- and last-lease decisions
* `apps/server/src/index.ts` - Added canonical patch routes and symmetric lease-backed V2 presence lifecycle
* `apps/server/src/index.integration.test.ts` - Covered canonical navigation, claims, and presence lifecycle
* `apps/client/src/App.css` - Styled canonical patch discovery, navigation, and claim controls
* `apps/client/src/App.tsx` - Added reconnect resubscription, canonical rediscovery, durable navigation, patch discovery, claim, and focus behavior
* `apps/client/src/App.test.tsx` - Covered canonical discovery, claiming, durable navigation, and protected-state cleanup
* `apps/client/src/auth/TestAuthProvider.tsx` - Supported isolated canonical acceptance fixtures
* `apps/client/src/network/session.ts` - Added canonical eligible-patch and navigation API calls
* `apps/client/src/network/useSocketConnection.ts` - Added bounded reconnect, token renewal, and connection epochs
* `apps/client/src/network/useSocketConnection.test.ts` - Covered reconnect bounds, renewal, and terminal authentication loss
* `apps/client/src/render/MosaicScene.tsx` - Preserved durable tile attribution in canonical snapshots
* `apps/client/src/test/canvasTestApi.ts` - Exposed deterministic canonical navigation and claim test controls
* `e2e/authentication.spec.ts` - Used isolated canonical authentication fixtures
* `e2e/multi-user-fixtures.spec.ts` - Verified isolated canonical ownership and collaboration fixtures
* `e2e/quilt-reconnect.spec.ts` - Verified cross-replica reconnect, cursor resubscription, and presence
* `e2e/quilt-seams.spec.ts` - Used canonicalized patch coordinates
* `e2e/smoke.spec.ts` - Entered and claimed directly in the canonical fixture
* `e2e/support/multiUser.ts` - Added canonical multi-user fixture helpers
* `e2e/support/testState.ts` - Provisioned complete canonical patch addresses for acceptance tests
* `playwright.config.ts` - Aligned isolated canonical E2E setup and reset limits
* `package.json` - Exposed the canonical retirement evidence command
* `apps/server/package.json` - Exposed the compiled canonical retirement reporter
* `apps/server/src/auth/httpAuth.ts` - Preserved bearer and principal-status enforcement before compatibility rejection
* `apps/server/src/auth/httpAuth.test.ts` - Covered authentication and principal-status ordering before compatibility rejection
* `apps/server/src/contracts.ts` - Versioned supported sockets around canonical quilt identity and defined exact upgrade and telemetry contracts
* `apps/server/src/db/repository.ts` - Removed compatibility lookup from the supported canonical socket path
* `apps/server/src/index.ts` - Added authenticated deterministic HTTP 426 responses, quilt-ID socket registration, and canonical retirement telemetry
* `apps/server/src/index.test.ts` - Covered exact HTTP and Socket.IO upgrade responses
* `apps/server/src/index.integration.test.ts` - Covered rejection ordering, side-effect absence, canonical telemetry, and quilt-ID runtime behavior
* `apps/server/src/migration/quiltTelemetry.ts` - Added discriminated canonical terminal, safety, rejection, and runtime sample telemetry
* `apps/server/src/migration/quiltRollout.ts` - Loaded and verified digest-bound retirement evidence
* `apps/server/src/migration/quiltRollout.test.ts` - Covered retirement report schema, digest, recommendation, and derived approvals
* `apps/server/src/startup/rolloutGates.ts` - Derived production retirement gates from an eligible promotion report
* `apps/server/src/startup/rolloutGates.test.ts` - Covered report path, digest, schema, recommendation, and derived gate failures
* `apps/client/src/App.tsx` - Made canonical entry unconditional and removed the rollback lobby branch
* `apps/client/src/App.test.tsx` - Covered canonical-only supported entry
* `apps/client/src/network/session.ts` - Removed session catalog, creation, and selected-session storage from supported product calls
* `apps/client/src/network/useSocketConnection.ts` - Sent schema, protocol, generation, and durable quilt identity in the supported handshake
* `apps/client/src/network/useSocketConnection.test.ts` - Covered quilt-ID handshake and exact unsupported-client handling
* `e2e/quilt-reconnect.spec.ts` - Verified quilt-identity reconnect and resubscription across replicas
* `apps/server/src/index.ts` - Reset authoritative canonical fixture state before direct quilt setup
* `e2e/support/testState.ts` - Used canonical quilt identity for multi-user fixture setup
* `e2e/quilt-seams.spec.ts` - Used the canonical V2 handshake and baseline claim policy

### Removed

* `apps/server/src/index.concurrency.test.ts` - Removed tests for retired process-local session runtime state
* `apps/client/src/ui/LobbyScreen.tsx` - Removed the obsolete session lobby surface

## Additional or Deviating Changes

* The 2026-07-29 implementation review invalidated the prior release-ready conclusion
	* Five critical, six major, and one minor finding are tracked in Phase 6
* Phase 6 environment-backed validation resumed after loopback PostgreSQL became available
	* Canonical PostgreSQL, full workspace, standard Playwright, multi-replica Playwright, and migration rehearsal all passed

* Local Markdown lint was skipped because `markdownlint-cli2` is not installed
	* `git diff --check` and VS Code diagnostics passed for the ADR
* Canonical mutation transactions use read-committed isolation after acquiring the transaction advisory lock
	* A repeatable-read snapshot established before lock acquisition would prevent a blocked contender from observing the winner's commit; side-effect-free discovery remains repeatable-read
* Existing quilt rollout tests required no changes
	* They already cover global protocol-V2 enablement independently from canonical discovery and entry gates
* Canonical snapshots now preserve `placedBy` attribution and fine-room delivery starts before aggregate startup
	* Durable attribution and room ordering were required for collaborative convergence during canonical E2E acceptance
* Test-only reset rate limits were raised for isolated canonical acceptance runs
	* The full Playwright suite creates independent fixtures and exceeded the previous test-only reset ceiling
* Runtime samples are excluded from terminal `(name, attemptId)` uniqueness
	* Multiple frame samples belong to one authenticated entry attempt; event-ID uniqueness and strict sample validation remain enforced
* Final E2E validation required canonical fixture alignment after session retirement
	* Direct quilt reset now clears authoritative state, multi-user setup uses quilt identity, and seam sockets use the V2 schema and baseline claim policy
* The first full test run could not reach loopback PostgreSQL
	* The repository PostgreSQL service was started for validation, all tests passed, and the container was removed afterward
* Initial Phase 7 attempt storage used a process-local registry
	* Multi-replica routing requires shared authorization, so the final implementation uses PostgreSQL with atomic cross-replica consumption

## Release Summary

All eight implementation phases are complete. Phase 8 closes IV-004, IV-007, IV-010,
IV-011, IV-012, IV-015, and IV-016 with observed single-use socket cycles, rotating durable
lineage, retired public session contracts, live authenticated boundary coverage, isolated
acceptance fixtures, and corrected release artifacts. Validation passed 146 client tests
with 16 skipped, 221 server tests with one skipped, two consecutive 14-of-14 standard
Playwright runs, one multi-replica Playwright test, 10 recovery rehearsal tests, nine
release-contract checks, ADR YAML parsing, lint, production builds, and `git diff --check`.
Ports 3001 and 5173 are clear.
