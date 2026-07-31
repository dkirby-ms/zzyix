<!-- markdownlint-disable-file -->

# RPI Validation: Canonical Infinite Canvas Convergence Phase 1

## Validation Status

**Partial**

Finding counts: 0 critical, 1 major, 1 minor.

## Scope

Implementation Phase 1 only: canonical control-plane schema, migration, operator selection,
side-effect-free discovery, tests, and migration rehearsal.

Sources reviewed in full:

* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`
* `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`

Implementation files were read and validated for evidence only. No product, plan, research,
details, or changes-log file was modified.

## Phase Requirements

The plan marks all three Phase 1 steps complete at
`.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md:65-74`.
The controlling requirements are specified at
`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:68-225`.

Phase 1 requires:

1. An expand-only singleton pointer for the literal product key `canonical`, with a quilt
	 foreign key, `inactive|active` status, positive generation, Drizzle metadata, and no
	 reverse migration
2. Generation 0 for an absent pointer, provisioning to inactive generation 1, activation
	 from generation 1 to 2, exact compare-and-set mutation, and no increment for exact replay
3. Advisory-locked, atomic provisioning of one compatibility canvas, one protocol-V2
	 toroidal quilt, the complete row-major patch grid, one baseline policy per patch, and no
	 principal, membership, tile, operation, snapshot, spatial-reference, or presence row
4. Full target validation for protocol, topology, compatibility alias, positive geometry,
	 complete addresses, allowed patch lifecycle, authenticated visibility, and claim policy
5. Strict `status`, `provision`, `activate`, and `deactivate` CLI argument validation before
	 repository access, safe versioned JSON output, deterministic exit status, and database
	 closure in `finally`
6. Authenticated, side-effect-free `GET /quilts/canonical`, returning a complete descriptor
	 or retryable HTTP 503 for a missing, inactive, or invalid target
7. Focused contract, route, schema, CLI, PostgreSQL, lint, build, and migration-rehearsal
	 validation, including concurrency and forward routing rollback

## Plan-to-Changes Comparison

The changes log claims the Phase 1 files at
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:24-28`
and `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:43-51`.

| Plan item | Changes-log claim | Verified status |
|---|---|---|
| Step 1.1: singleton pointer schema | Migration, Drizzle schema, checks, foreign key, index, snapshot, and journal entry | Complete |
| Step 1.1: migration compatibility | Migration count and fresh or upgraded pointer checks | Complete by source; database execution blocked |
| Step 1.1: replay and forward rollback rehearsal | Provision replay, stale generation, activation, deactivation, and graph preservation | Complete by source; execution blocked |
| Step 1.2: target validation | Protocol, topology, geometry, alias, address grid, lifecycle, visibility, and claim checks | Complete |
| Step 1.2: atomic provision and replay | Complete graph creation, advisory lock, inactive generation 1, and stable replay IDs | Complete |
| Step 1.2: exact activation CAS | Separate generation-1-to-2 activation of the provisioned target | Partial: activation can create or repoint the pointer |
| Step 1.2: CLI contract | Strict parsing, safe machine output, exit codes, and cleanup | Complete |
| Step 1.2: authenticated read-only discovery | Auth middleware, repeatable-read read-only repository transaction, descriptor, and 503 mapping | Complete |
| Step 1.3: focused tests | Contract, route, schema, and CLI tests pass; PostgreSQL suite unavailable | Partial |
| Step 1.3: lint and build | Server lint and build | Complete |

No Phase 1 implementation file omitted from the changes log was found. Later-phase telemetry
and rollout-gate changes touch the discovery handler but do not add another Phase 1 owner.

## Repository Evidence

### Schema and migration

* The Drizzle table uses the product key as its primary key, restricts quilt deletion, and
	defines status, generation, and product-key checks at
	`apps/server/src/db/schema.ts:144-161`.
* Migration `0007` creates the same additive table, checks, foreign key, and index at
	`apps/server/migrations/0007_canonical_world.sql:1-14`.
* The generated snapshot records the table, index, foreign key, and checks at
	`apps/server/migrations/meta/0007_snapshot.json:260-351`; the migration journal registers
	`0007_canonical_world` at `apps/server/migrations/meta/_journal.json:55-62`.
* A policy's patch ID is its primary key, enforcing at most one persisted policy per patch,
	at `apps/server/src/db/schema.ts:234-249`.
* Migration compatibility expects all eight current migrations and rejects pending or
	ahead-of-image states at `apps/server/src/db/migrate.test.ts:5-31`.

### Validation, provision, and discovery

* Target validation derives the compatibility alias through the quilt, requires protocol
	V2 and toroidal positive finite geometry, and rejects a missing alias at
	`apps/server/src/db/repository.ts:2802-2842`.
* It checks exact patch count, unique in-range addresses, `unclaimed|active` lifecycle,
	authenticated visibility, claim enablement, complete row-major addresses, and row-0,
	column-0 entry at `apps/server/src/db/repository.ts:2844-2926`.
* Provision acquires the required transaction advisory lock, checks generation 0, returns
	exact inactive generation-1 replays without writes, and atomically creates only the
	canonical graph at `apps/server/src/db/repository.ts:2954-2956` and
	`apps/server/src/db/repository.ts:3082-3148`.
* Discovery accepts only an active pointer and returns the validated descriptor from a
	repeatable-read, read-only transaction at `apps/server/src/db/repository.ts:2967-2988`.
* The route authenticates before calling discovery at `apps/server/src/index.ts:1658-1661`.
	Missing, inactive, and invalid targets receive HTTP 503, `Retry-After: 30`, and
	`canonical_world_unavailable` at `apps/server/src/index.ts:1595-1630`.
* The descriptor contract includes quilt ID, derived compatibility canvas ID, topology,
	protocol, geometry, generation, and initial patch identity and address at
	`apps/server/src/contracts.ts:239-261`.

### Operator command

* CLI parsing rejects malformed pairs, duplicate, unknown, missing, empty, incompatible,
	unsafe numeric, and invalid UUID arguments at
	`apps/server/src/cli/selectCanonicalWorld.ts:46-149`.
* Repository access occurs only after parsing; output is one safe JSON object and database
	closure occurs in `finally` at `apps/server/src/cli/selectCanonicalWorld.ts:161-216`.
* Root and server package scripts expose the compiled operator at `package.json:16` and
	`apps/server/package.json:14`.

### Tests and rehearsal

* PostgreSQL tests cover atomic graph creation, stable no-write replay, sequential CAS,
	active-only discovery, target invalidation, concurrent provision, and restart stability
	at `apps/server/src/db/canonicalWorld.postgres.integration.test.ts:49-285`.
* Route tests cover retryable unavailability, disabled discovery, authentication-first
	behavior, and safe internal errors at `apps/server/src/index.integration.test.ts:94-157`.
* CLI tests cover fixed provision parsing, representative invalid arguments, versioned
	output, pre-repository rejection, and cleanup failure sanitization at
	`apps/server/src/cli/selectCanonicalWorld.test.ts:17-124`.
* Rehearsal verifies an empty additive pointer after fresh and upgraded migration, exact
	1,024-patch provision, stable replay IDs, stale activation rejection, generation-2
	activation, generation-3 deactivation, and preserved graph state at
	`scripts/verify-quilt-migration.sh:252-397` and
	`scripts/verify-quilt-migration.sh:432-451`.

Session validation results:

* Direct four-file Phase 1 test slice: 4 files and 70 tests passed
* `npm run lint:server`: passed
* `npm run build:server`: passed
* `bash -n scripts/verify-quilt-migration.sh`: passed
* Canonical PostgreSQL integration: blocked before tests because no server listens on
	`127.0.0.1:5432`; 6 tests were discovered and skipped after setup failure
* Migration rehearsal: blocked before disposable database creation by the same connection
	refusal; no cleanup was needed

## Findings

### Critical

None.

### Major

#### M-01: Activation bypasses the provision-then-activate state machine

Phase 1 defines an absent pointer as generation 0, provisioning as inactive generation 1,
and activation as a separate compare-and-set from generation 1 to 2 at
`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:76-83`
and `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:108-126`.

`activateCanonicalWorld` instead treats a missing pointer as generation 0, validates any
supplied quilt, and inserts an active generation-1 pointer. For an existing inactive
pointer, it updates `quilt_id` to any structurally valid supplied quilt while incrementing
generation. It also returns an active same-quilt replay before checking the caller's expected
generation. These paths are at `apps/server/src/db/repository.ts:3151-3188`.

This is a specification deviation, not an acceptable implementation detail. It permits an
operator to skip atomic canonical provisioning or repoint the singleton to another valid
quilt, bypassing the required inactive generation-1 provenance and separate generation-2
activation. It also weakens the promise that every mutation requires the exact generation.

Recommended correction: require an existing inactive generation-1 pointer, require
`input.quiltId` to equal that pointer's quilt ID, check `expectedGeneration` before every
idempotent return, and update only status and generation. Define target replacement as a
separate planned operation if it is required.

### Minor

#### N-01: Concurrency coverage stops at provisioning

The Phase 1 success criteria require concurrent selection to produce one deterministic active
generation at
`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:140-147`.
The only concurrent test invokes `provisionCanonicalWorld` twice and verifies one success
plus one replay at `apps/server/src/db/canonicalWorld.postgres.integration.test.ts:258-266`.
Activation is tested only sequentially at
`apps/server/src/db/canonicalWorld.postgres.integration.test.ts:147-190`, and rehearsal also
activates once at `scripts/verify-quilt-migration.sh:355-366`.

The advisory lock provides a credible serialization mechanism, so this is a test gap rather
than a second functional finding. Add concurrent activation tests for the same target,
different targets, and stale expected generations after correcting M-01.

## Acceptable Implementation Details

* Read-committed isolation for advisory-locked mutations at
	`apps/server/src/db/repository.ts:3071`, `apps/server/src/db/repository.ts:3148`, and
	`apps/server/src/db/repository.ts:3188` is the documented DD-02 deviation at
	`.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:21-30`.
	It allows a blocked contender to observe the winner's commit and does not weaken the lock.
* Repeatable-read read-only discovery at `apps/server/src/db/repository.ts:2967-2988` satisfies
	side-effect-free control-plane discovery. Later telemetry emission in the HTTP handler at
	`apps/server/src/index.ts:1637-1655` is observability, not canonical-world mutation.
* Returning the derived `legacyCanvasId` in Phase 1 is required rollout compatibility, not a
	second writable pointer or a legacy product workflow.
* Parameterized provision geometry is consistent with the operator contract. The Phase 1
	defect is activation's ability to skip or replace the provisioned target, not the use of
	validated numeric CLI arguments.
* The absence of reverse SQL is intentional forward-only migration behavior. Routing
	rollback deactivates the pointer and preserves the graph.

## Coverage Assessment

Step 1.1 is complete by source evidence. Step 1.2 is complete for target validation,
provisioning, replay, CLI safety, authentication, and read-only discovery, but activation is
only partial because it does not enforce the specified state transition. Step 1.3 is partial:
70 focused tests, lint, build, and shell syntax pass, while PostgreSQL integration and the
rehearsal could not be rerun in this environment.

Overall Phase 1 status is **Partial** until M-01 is corrected and database-backed activation
and migration behavior are rerun against disposable PostgreSQL.

## Clarifying Questions

1. Is generation-0 activation or quilt replacement an intentional recovery operation? If
	 so, which approved specification supersedes the Phase 1 provision-then-activate contract?
2. Can a disposable loopback PostgreSQL service be provided for rerunning the six canonical
	 integration tests and complete migration rehearsal? Docker and native server binaries
	 were unavailable in this validation environment.

## Recommended Next Validations

* [ ] Validate that activation rejects a missing pointer, a quilt-ID mismatch, a non-inactive
	pointer, and every expected generation other than 1
* [ ] Validate concurrent same-target and different-target activation after correcting M-01
* [ ] Rerun `src/db/canonicalWorld.postgres.integration.test.ts` against disposable PostgreSQL
* [ ] Rerun `./scripts/verify-quilt-migration.sh rehearse` and confirm disposable database
	cleanup
* [ ] Revalidate exact idempotent activation semantics and safe CLI error output after the
	state-machine correction
