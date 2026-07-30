<!-- markdownlint-disable-file -->

# Planning Log: Canonical Infinite Canvas Convergence

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

No planning-relevant research item is omitted. Invalid UUID and generation handling, fixed
provision output shape, exact terminal telemetry discriminants, and strict unknown-field
evidence rejection are specified in implementation details.

Legacy archive, import, provenance, and identity mapping are intentionally absent. The user
removed legacy content from the product scope on 2026-07-29, so these are not unaddressed
research items.

### Plan Deviations from Research

* DD-01: Do not preserve a legacy-content product path
	* Research recommends: Decide whether legacy canvases remain accessible, become archives, or enter an import program
	* Plan implements: No legacy access, archive, import, migration, or preservation workflow; old clients receive an unsupported or upgrade-required response after cutover
	* Rationale: The user explicitly stated that the infinite canvas is the only important app experience
* DD-02: Use read-committed isolation for advisory-locked canonical mutations
	* Plan specifies: Validate selection in one repeatable transaction
	* Implementation differs: Side-effect-free discovery uses repeatable-read, while provision, activate, and deactivate use read-committed under the required transaction advisory lock
	* Rationale: A repeatable-read snapshot established while waiting for the lock cannot observe the winning transaction's commit; read-committed preserves deterministic serialized CAS behavior

### Final Validation Status

Status: Passed. Phase 7 corrected the three critical, four major, and one minor resumed
review findings. Shared attempt persistence, deployment evidence, live boundaries, standard
and multi-replica Playwright, migration rehearsal, lint, builds, and workspace tests pass.

### Implementation Review Deviations

* DD-03: Retirement was not coupled to mandatory immutable evidence
	* Plan specifies: Retirement startup fails without valid measured promotion evidence
	* Implementation differs: Retired routes can run while evidence validation is optional and CD does not deploy the evidence contract
	* Rationale: No valid deviation; tracked for correction in Phase 6
* DD-04: Final runtime retained canary and legacy compatibility surfaces
	* Plan specifies: Canonical entry is unconditional and retired runtime paths are removed
	* Implementation differs: Discovery and entry controls plus compiled legacy handlers and contracts remain
	* Rationale: No valid deviation; tracked for correction in Phase 6
* DD-05: Telemetry does not provide trustworthy attempt lineage or complete terminals
	* Plan specifies: Authenticated terminal telemetry supports promotion decisions
	* Implementation differs: Client-selected attempt IDs, missing failure terminals, and fabricated world identity can bias reports
	* Rationale: No valid deviation; tracked for correction in Phase 6

### Implementation Review Remediation

* Phase 6 closed IV-001, IV-002, IV-005, IV-006, IV-008, and IV-009
* Phase 7 closed IV-003, IV-004, IV-007, IV-010, IV-011, IV-012, IV-013, and IV-014
* Canonical attempts use shared PostgreSQL persistence so non-sticky replicas can issue and atomically consume lineage
* Release readiness is restored after complete Phase 7 validation

## Implementation Paths Considered

### Selected: Database-Backed Canonical Pointer and Direct Entry

* Approach: Select one validated protocol-V2 toroidal quilt through an additive singleton pointer, discover it after authentication, enter automatically, and retire session compatibility after acceptance
* Rationale: This reuses quilt, patch, chunk, claim, authorization, recovery, and delivery boundaries already present on the branch while making canonical tenancy environment- and restore-safe
* Evidence: `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md` (Decision and Target Entry Flow)

### IP-01: Compile a Fixed Canonical UUID into the Client

* Approach: Configure the client to connect directly to one known quilt or compatibility canvas ID
* Trade-offs: Minimal discovery code, but database identities vary across development, test, restore, staging, and production; target validation and generation changes remain unsolved
* Rejection rationale: The client cannot safely own a database identity or validate the full target contract

### IP-02: Treat Existing Sessions as Spatial Shards

* Approach: Present separate canvases as regions of one visual world and route users among them
* Trade-offs: Reuses session creation, but overlapping coordinates, independent persistence, presence, sequencing, and quilt identity prevent one canonical topology
* Rejection rationale: Patches and chunks already provide the correct spatial and delivery partitions inside one quilt

### IP-03: Immediate Destructive Replacement

* Approach: Delete session APIs, lobby code, compatibility identity, and legacy schema in one release
* Trade-offs: Reaches the final surface quickly, but removes canary rollback and couples control-plane, client, realtime, and schema risks
* Rejection rationale: Forward-only additive rollout allows the same final product without destructive recovery risk

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Remove inert legacy database structures after retention approval - Create a separate contract migration only after canonical runtime references are absent and audit retention permits deletion (low priority, medium effort)
	* Source: Phase 4 compatibility retirement
	* Dependency: Canonical cutover, socket quilt-identity adoption, and retention approval
* WI-02: Add operational canonical-world dashboards and alerts - Visualize descriptor failures, protocol fallback rejection, reconnect exhaustion, room-resubscription lag, and presence lease health (medium priority, medium effort)
	* Source: Canonical retirement telemetry contract
	* Dependency: Canonical metrics and threshold ownership
* WI-03: Preserve machine-readable release evidence - Retain PostgreSQL, Playwright, and migration-rehearsal outputs for independent verification (high priority, low effort)
  * Source: Implementation review validation gaps
  * Dependency: Phase 6 validation

## User Decisions

* ID-01: Canonical topology - Use a newly provisioned 32-by-32 finite torus with 31.2-by-20.4 world-unit patches and origin at canonical `(0, 0)`
	* Rationale: Provides 1,024 claimable patches with bounded provisioning and preserves the accepted finite-torus model
* ID-02: Entry and ownership contract - Enter at row 0, column 0; use quilt and stable patch identities for links; discover eligible patches in row-major order; focus successful claims; retain one active owned patch per principal per quilt and global claim-rate windows
	* Rationale: Produces deterministic entry, discovery, and claim behavior without compatibility identities in durable navigation
* ID-03: Replica-wide presence - Use database-backed ephemeral per-socket leases with expiry, heartbeat, and transactional last-lease decisions
	* Rationale: Makes presence lifecycle replica-correct without granting durable authorization or ownership

## Validation Record

* Researcher Subagent verified architecture owners, migration conventions, deployment gaps, tests, and phase actionability
* Focused research validation passed 57 server tests and 37 client tests before plan revision
* Editor diagnostics report no errors in the revised research, details, and plan artifacts
* Validator findings for config ownership, telemetry gates and report evidence, provisioning and control-plane contracts, disposable database validation, HTTP and socket old-client rejection, and Phase 3 parallelization are addressed in the revised details
* Phase 1 focused server validation passed 67 tests
* Canonical PostgreSQL integration validation passed 5 tests
* Migration compatibility validation passed 4 tests
* Server lint, server build, shell syntax, diff whitespace, and quilt migration rehearsal passed
* Phase 2 client network and App validation passed 52 tests
* Phase 2 server startup and rollout validation passed 13 tests
* Release-contract validation passed 9 tests
* Client and server lint and builds passed; the client build reported only the existing bundle-size warning
* Phase 3 focused server acceptance passed 71 tests
* Phase 3 focused client acceptance passed 52 tests
* Full client validation passed 169 tests; full server validation passed 252 tests with one skipped
* Standard Playwright acceptance passed 14 tests and multi-replica Playwright acceptance passed one test
* Phase 3 client and server lint and builds passed; ports 3001 and 5173 were clear after validation
* Phase 4 focused server validation passed 96 tests
* Phase 4 focused client validation passed 34 tests with eight retired-path tests skipped
* Phase 4 full workspace validation passed 419 tests with nine skipped
* Phase 4 release-contract validation passed nine tests and multi-replica Playwright acceptance passed one test
* Phase 4 client and server lint and builds passed; ports 3001 and 5173 were clear after validation
* Canonical retirement reporter regression validation passed five tests, including repeated runtime samples for one entry attempt
* Phase 5 lint and builds passed after isolated fixture repairs
* Phase 5 full validation passed 420 tests with nine skipped
* Phase 5 standard Playwright acceptance passed 14 tests and multi-replica acceptance passed one test
* Phase 5 release-contract validation passed nine tests
* Phase 5 migration and recovery rehearsal passed 10 recovery tests and removed its disposable database
* Final `git diff --check` and editor diagnostics passed; ports 3001 and 5173 were clear and no test containers remained
* Phase 6 focused server validation passed 40 tests
* Phase 6 focused client validation passed 33 tests with eight retired-path tests skipped
* Phase 6 release-contract validation passed nine tests
* Phase 6 lint and production builds passed with the existing Vite bundle-size warning
* Phase 6 canonical PostgreSQL integration passed seven tests
* Phase 6 full workspace validation passed 214 tests with one skipped
* Phase 6 standard Playwright acceptance passed 14 tests and multi-replica acceptance passed one test
* Phase 6 migration and recovery rehearsal passed 10 tests
* Phase 6 final lint, production builds, and nine release-contract checks passed; the existing Vite bundle-size warning remains non-blocking
* Phase 6 `git diff --check` passed, and ports 3001 and 5173 were clear
* Phase 7 release-contract validation passed nine tests
* Phase 7 focused server validation passed 49 tests
* Phase 7 focused client validation passed 27 tests with 16 retired-path tests skipped
* Phase 7 canonical attempt schema, migration, and PostgreSQL validation passed 15 tests
* Phase 7 full workspace validation passed 367 tests with 17 skipped
* Phase 7 standard Playwright acceptance passed 14 tests and multi-replica acceptance passed one test
* Phase 7 migration and recovery rehearsal passed 10 tests
* Phase 7 lint, production builds, `git diff --check`, diagnostics, and port checks passed
