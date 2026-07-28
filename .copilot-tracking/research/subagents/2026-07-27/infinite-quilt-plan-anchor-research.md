<!-- markdownlint-disable-file -->
# Infinite Quilt Plan Anchor Research

## Research Scope

Verify the current repository architecture and exact implementation anchors needed
for an actionable staged implementation plan for GitHub issue 53. Use
`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
as the baseline. Focus on relevant source, test, and migration files; package
validation commands; likely exact files to create or modify by stage;
dependencies and sequencing; and mismatches between baseline citations and
current `main`.

Product code is outside this research task and must not be modified.

## Questions

* Which current files directly own topology, persistence, transactional
  placement, real-time subscriptions, client state, rendering, and migrations?
* Which existing tests are the nearest extension points for each stage?
* Which package scripts provide focused and repository-wide validation?
* Which exact files are likely to be created or modified in each implementation
  stage, and what ordering dependencies constrain that work?
* Which baseline citations no longer match current `main`?

## Findings

### Repository State

* `HEAD`, local `main`, and `origin/main` all resolve to commit
  `79147ba27a8c41916ca0c2db77b237a01af4a1ad`
* The checked-out branch is `infinite-canvas`, but it has zero commits ahead of
  or behind `origin/main`; findings therefore apply to current main
* The only worktree changes observed during research are untracked files under
  `.copilot-tracking/research/`; no product code was modified
* GitHub issue 53 only requires an extremely large canvas whose opposite ends
  wrap. Patch ownership, ACLs, quilt tenancy, dimensions, and migration policy
  are architecture decisions introduced by the primary research, not explicit
  issue acceptance criteria

### Current Ownership Boundaries

* `apps/server/src/contracts.ts:26-498` owns the cross-workspace protocol and
  shared domain shapes. Client modules already import this server source file
  directly, so it is the current practical shared-code boundary
* `apps/client/src/domain/math2d.ts:1-115` owns viewport-to-chunk conversion and
  client subscription budgets. It uses signed unwrapped chunk coordinates and
  has no toroidal canonicalization
* `apps/client/src/domain/placementSolver.ts:145-293` and
  `apps/server/src/domain/placementSolver.ts:144-292` are duplicated Euclidean
  placement engines. Both support bounded and unbounded policies, but neither
  understands periodic neighbor images
* `apps/server/src/db/schema.ts:21-157` owns canvas-wide persistence. Tiles have
  one global position and one anchor chunk; canvas revisions, operations, and
  snapshots remain canvas-wide
* `apps/server/src/db/repository.ts:575-994` owns mutation transactions. It
  takes one canvas-wide PostgreSQL advisory lock per mutation
* `apps/server/src/index.ts:1530-1630` validates placement before calling the
  locked repository transaction. This is the exact stale-read race that Stage
  3 must remove
* `apps/server/src/index.ts:1739-1922` owns chunk subscription and snapshot
  delivery. Chunk IDs are deduplicated, but request size, room count, churn,
  authorization, and snapshot bytes are not enforced as protocol limits
* `apps/client/src/App.tsx:519-952` owns flat tile state reconciliation, chunk
  subscriptions, cursors, and orchestration. Fine snapshots replace only tiles
  in incoming chunks, but unsubscribe does not evict retained tile state
* `apps/client/src/render/MosaicScene.tsx:117-603` owns tile meshes, pointer
  mapping, world-sized planes, viewport reporting, and the one orthographic R3F
  scene. It renders one mesh subtree per retained tile and has no alias-to-
  canonical identity mapping
* `apps/server/src/db/repository.ts:995-1090`,
  `apps/server/src/db/snapshots.ts:4-25`, and
  `apps/server/src/jobs/retention.ts:4-26` own recovery and retention. Replay
  starts from an empty tile list when no snapshot exists, while operations and
  snapshots are deleted on independent age cutoffs
* `apps/server/src/db/migrate.ts:14-61` and
  `apps/server/src/index.ts:2040-2137` own migration execution. Every server
  process checks and may apply migrations before listening

### Nearest Existing Tests

* `apps/client/src/domain/placementSolver.test.ts` covers bounded and unbounded
  geometry, but not periodic images or seam collisions
* `apps/client/src/domain/gridPatterns.test.ts` and
  `apps/client/src/domain/gridPlacement.test.ts` cover world-origin grid logic
  that must remain deterministic across aliases
* `apps/client/src/App.test.tsx:547-792` covers fine versus aggregate chunk
  snapshots, resync requests, and capability-gated chunk wiring
* `apps/client/src/render/MosaicScene.test.tsx` covers pointer routing and camera
  pan callbacks, making it the nearest seam interaction and render-alias test
* `apps/client/src/network/useSocketConnection.test.ts` covers protocol event
  registration and cleanup
* `apps/server/src/index.test.ts:126-138` covers the current unbounded policy;
  `apps/server/src/index.integration.test.ts:639-874` covers chunk rooms,
  ordering metadata, aggregate payloads, and chunk parity
* `apps/server/src/index.concurrency.test.ts` is in-memory and sequential. It
  cannot prove transaction locking, deadlock avoidance, or concurrent database
  reads
* `apps/server/src/db/repository.test.ts` only tests pure chunk parity helpers;
  it does not exercise PostgreSQL transactions
* `apps/server/src/jobs/retention.test.ts` only verifies delegation and returned
  counts; it does not prove reconstruction after pruning
* `e2e/multi-user-fixtures.spec.ts` is the nearest collaborative seam behavior
  suite. `playwright.config.ts:3-47` starts exactly one server and one client,
  so multi-replica coverage needs a new harness or config

## Staged File Plan

### Stage 0 Product and Security Contract

Create:

* `docs/decisions/<date>-finite-toroidal-quilt-v01.md` for topology, tenancy,
  identity, ACL, migration, and measurable budget decisions

Modify only if decisions become executable configuration in this stage:

* `apps/server/src/contracts.ts`

Dependency: This stage must resolve whether issue 53 ships as toroidal behavior
only or with first-class owned patches. Schema and authorization work cannot be
made actionable until that distinction is explicit.

### Stage 1 Shared Topology Domain

Create:

* `apps/server/src/domain/quiltTopology.ts`
* `apps/server/src/domain/quiltTopology.test.ts`

Modify:

* `apps/server/src/contracts.ts` for topology types and protocol versioning only
  when the new types cross the wire
* `apps/client/src/domain/math2d.ts` and
  `apps/client/src/domain/math2d.test.ts` to delegate wrapped viewport and chunk
  enumeration to the shared resolver

The new server-owned module is the smallest shared anchor because the client
already imports `apps/server/src/contracts.ts`. Creating a third workspace
package would be cleaner long term, but is not required for the first pure
topology stage. Do not duplicate canonicalization in both placement solvers.

Required functions: positive modulo, point canonicalization, nearest-image
delta, wrapped viewport decomposition, visible periodic image enumeration, and
canonical subscription deduplication.

### Stage 2 Persistence and Identity Expansion

Create:

* `apps/server/migrations/0005_<generated_or_authored_name>.sql`
* `apps/server/src/db/quiltBackfill.ts` for an explicit idempotent backfill if
  data volume or rollout requires work outside one DDL transaction
* `apps/server/src/db/quiltBackfill.test.ts`
* `scripts/run-quilt-backfill.sh` only if deployment needs a repeatable operator
  entry point

Modify:

* `apps/server/src/db/schema.ts`
* `apps/server/src/db/types.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/db/repository.test.ts`
* `apps/server/migrations/meta/_journal.json` and generated snapshot metadata
* `package.json` and `apps/server/package.json` if a dedicated backfill or
  verification command is added
* Deployment workflow or infrastructure that runs migrations as one job;
  current Bicep does not define the application Container Apps, so that anchor
  is outside `infra/bicep/` unless added in a separate deployment change

The migration must add quilt, patch, principal or membership, patch operation,
patch snapshot, and tile spatial-reference storage as nullable or additive
structures first. Backfill and parity verification precede constraints.
Provision the Socket.IO adapter `socket_io_attachments` table in this stage.

Migration metadata needs explicit care: `_journal.json` records migrations
`0003` and `0004`, but `apps/server/migrations/meta/` contains snapshots only
through `0002`. Run `db:generate` in a clean branch and review its output before
accepting generated metadata or author the next migration consistently with the
existing hand-authored SQL.

### Stage 3 Patch-Scoped Correctness and Recovery

Create:

* `apps/server/src/db/repository.postgres.integration.test.ts` for real
  concurrent connections, seam conflicts, sorted lock order, and distant patch
  writes
* `apps/server/src/db/recovery.postgres.integration.test.ts` for snapshot and
  retention reconstruction invariants

Modify:

* `apps/server/src/db/repository.ts`
* `apps/server/src/index.ts`
* `apps/server/src/domain/placementSolver.ts`
* `apps/server/src/domain/placementSolver.port.test.ts`
* `apps/server/src/db/snapshots.ts`
* `apps/server/src/jobs/retention.ts`
* `apps/server/src/jobs/retention.test.ts`
* `apps/server/src/index.concurrency.test.ts` only for pure lock-order helpers;
  do not treat it as database concurrency proof

Move canonicalization, affected-patch discovery, authorization, nearby tile
reads, and placement validation inside one repository transaction. Acquire
affected patch locks in stable sorted order. Fix recovery before relying on
patch history: either authoritative tile rows remain the recovery source or
retention preserves a baseline no newer than the earliest retained event.

### Stage 4 Protocol V2 Area-of-Interest Delivery

Create:

* `apps/server/src/realtime/quiltRooms.ts`
* `apps/server/src/realtime/quiltRooms.test.ts`
* `playwright.multi-replica.config.ts` or a dedicated non-Playwright load harness
  when two real server processes are required
* `e2e/quilt-reconnect.spec.ts`

Modify:

* `apps/server/src/contracts.ts`
* `apps/server/src/index.ts`
* `apps/server/src/index.integration.test.ts`
* `apps/client/src/network/useSocketConnection.ts`
* `apps/client/src/network/useSocketConnection.test.ts`
* `apps/client/src/App.tsx`
* `apps/client/src/App.test.tsx`
* `apps/server/README.md` for flags, limits, and recovery behavior

Add authenticated quilt handshake data, bounded and authorized subscriptions,
accepted or rejected subscription acknowledgements, patch cursors, and
application-level reconnect recovery. Keep v1 session-wide events available
only behind an explicit compatibility gate and prevent duplicate v1 plus v2
durable mutation delivery.

### Stage 5 Client Virtualization and Seam Rendering

Create:

* `apps/client/src/domain/quiltCache.ts`
* `apps/client/src/domain/quiltCache.test.ts`
* `apps/client/src/render/periodicImages.ts`
* `apps/client/src/render/periodicImages.test.ts`
* `e2e/quilt-seams.spec.ts`

Modify:

* `apps/client/src/interaction/controller.ts`
* `apps/client/src/interaction/controller.test.ts`
* `apps/client/src/domain/placementSolver.ts`
* `apps/client/src/domain/placementSolver.test.ts`
* `apps/client/src/domain/gridPatterns.ts`
* `apps/client/src/domain/gridPatterns.test.ts`
* `apps/client/src/domain/gridPlacement.ts`
* `apps/client/src/domain/gridPlacement.test.ts`
* `apps/client/src/App.tsx`
* `apps/client/src/App.test.tsx`
* `apps/client/src/render/MosaicScene.tsx`
* `apps/client/src/render/MosaicScene.test.tsx`
* `apps/client/src/render/GridOverlay.tsx`
* `e2e/multi-user-fixtures.spec.ts`

Replace the flat retained tile array with patch and chunk keyed state, cursors,
optimistic-operation pins, undo pins, and explicit eviction. Keep one R3F scene,
but render camera-relative periodic images with display keys that resolve to one
canonical tile ID. Convert pointer hits back to canonical identity before
placement, selection, removal, presence, or links.

### Stage 6 Migration, Canary, and Retirement

Create:

* `apps/server/src/db/quiltParity.ts`
* `apps/server/src/db/quiltParity.test.ts`
* `scripts/verify-quilt-migration.sh`
* A later contract migration that removes legacy columns only after canary exit

Modify:

* `apps/server/src/db/repository.ts` for dual-read parity and telemetry
* `apps/server/src/index.ts` for feature gates and protocol retirement
* `apps/client/src/App.tsx` for controlled v1 fallback removal
* `apps/server/README.md`, root `README.md`, and deployment configuration for
  rollout flags and operational procedure
* `playwright.config.ts` only if multi-replica coverage is folded into the
  default E2E suite; otherwise keep the dedicated config from Stage 4

Retire whole-canvas snapshots, session-wide durable fanout, legacy coordinate
columns, and v1 protocol handling only after migration parity, reconnect,
recovery, lock-wait, room-churn, payload, and client cache budgets pass.

## Validation Commands

Existing package scripts support these repository-wide gates:

```bash
npm run lint
npm run build
npm run test
npm run test:e2e:ci
```

Use focused commands while implementing each stage:

```bash
npm run lint:client
npm run lint:server
npm run build:client
npm run build:server
npm run test:client -- src/domain/quiltTopology.test.ts
npm run test:server -- src/domain/quiltTopology.test.ts
npm run test:server -- src/db/repository.postgres.integration.test.ts
npm run test:server -- src/db/recovery.postgres.integration.test.ts
npm run test:client -- src/render/periodicImages.test.ts src/render/MosaicScene.test.tsx
npx playwright test e2e/quilt-seams.spec.ts --reporter=line
```

The exact new test names are recommendations and do not exist yet. Existing
workspace scripts forward arguments to Vitest. Database integration and E2E
commands require PostgreSQL; the documented local service is
`docker compose up -d postgres`. The current E2E default uses
`postgresql://postgres:postgres@127.0.0.1:5432/zzyix` and refuses non-loopback
test databases.

Migration validation sequence:

```bash
npm run build:server
npm run db:apply
npm run test:server -- src/db/quiltBackfill.test.ts
npm run test:server -- src/db/repository.postgres.integration.test.ts
```

`npm run db:apply` mutates the configured database and must use a disposable
test database during implementation. `npm run db:generate --workspace=apps/server`
is available, but its output requires review because of the migration metadata
gap described above.

## Citation Verification

* Every local file and line-range citation in the primary research resolves on
  current main. No target is missing and no range exceeds its file length
* The baseline command citation remains accurate: root `package.json:15-30`
  defines lint, build, test, and E2E gates
* The baseline single-server Playwright claim remains accurate at
  `playwright.config.ts:3-47`
* The stale-validation claim remains accurate, but the sharpest current anchors
  are `apps/server/src/index.ts:1530-1601` and
  `apps/server/src/db/repository.ts:575-589`
* The recovery claim remains accurate at
  `apps/server/src/db/repository.ts:1041-1090`; the baseline also cites
  `apps/server/src/jobs/retention.ts`, but the destructive selection and delete
  behavior lives in the repository, not the cron wrapper
* Current main has explicit `{ mode: 'unbounded' }` support in contracts and
  both placement solvers. This does not implement wraparound, but it is a useful
  feature-gated precursor that the primary recommendation does not call out
* Current main has chunk parity and aggregate canary coverage in
  `apps/server/src/index.integration.test.ts:639-874` and
  `apps/client/src/App.test.tsx:547-792`. These narrow the Stage 4 starting point
  beyond the broader ranges in the primary research
* No primary citation is false on current main. The actionable mismatch is
  omission rather than invalidity: the primary sequence does not name exact new
  files, the shared-module location, migration metadata gap, or focused commands

## Dependencies and Sequencing

1. Resolve the Stage 0 product boundary before durable schema work. A toroidal
   canvas can be implemented without ownership, while owned patches require
   stable principals, ACL semantics, and multi-patch authorization.
2. Land pure topology and property tests before schema or rendering. Every
   later layer must use the same canonicalization and nearest-image rules.
3. Expand schema additively before changing mutation or protocol reads. Backfill
   legacy canvases without silently making opposite legacy edges adjacent.
4. Establish real PostgreSQL transaction and recovery correctness before
   protocol v2. Otherwise scoped delivery can expose state that cannot be
   serialized or reconstructed correctly.
5. Land bounded, authorized protocol v2 before client eviction. Eviction is
   unsafe while reconnect still depends on whole-canvas snapshots or missing
   cursors.
6. Land client cache identity before periodic render aliases. Aliases must not
   become duplicate authoritative rows, optimistic operations, selections, or
   undo entries.
7. Add multi-replica and long-traversal tests before canary expansion. The
   current single-server Playwright harness cannot validate adapter recovery or
   cross-replica room behavior.
8. Remove v1 fanout and legacy columns last, after parity and rollback windows.

Cross-stage blockers:

* Patch dimensions and wrapped axes determine canonicalization and schema keys
* Identity and ACL policy determine handshake, subscriptions, mutation checks,
  aggregate visibility, and migration ownership defaults
* Boundary-crossing geometry policy determines spatial references, lock sets,
  authorization, and atomicity
* Legacy opt-in or packing policy determines whether existing edge content gains
  new neighbors
* Recovery source-of-truth choice determines snapshot schema and retention
* Measured room, payload, cache, scene, and latency budgets determine limits;
  source inspection cannot supply production values

## Remaining Gaps

* No production workload or tile-density data exists to set patch, chunk, room,
  snapshot, cache, or frame-time budgets
* No identity provider or stable principal contract exists in the repository
* No deployment definition for client or server Container Apps exists under
  `infra/bicep/`; migration-job placement cannot be pinned to a current file
* No real PostgreSQL concurrency test harness exists. Current server tests are
  predominantly pure, mocked, or in-memory
* No two-replica Socket.IO test harness exists
* Drizzle metadata lacks snapshots for the two newest migrations
* Issue 53 does not state whether both axes wrap, what dimensions apply, or how
  existing canvases migrate

## Clarifying Questions

* Is issue 53 intended to deliver wraparound navigation only, or must the first
  release also introduce user-owned patches and ACLs?
* Do both axes wrap, and are quilt rows, columns, patch width, and patch height
  immutable after creation?
* May one tile footprint cross a patch boundary, and if so must every intersected
  patch authorize the operation atomically?
* Should existing canvases remain bounded until opt-in, migrate into nonwrapped
  legacy quilts, or be packed into a new torus?
* Which authenticated principal provider and ownership lifecycle should replace
  caller-supplied `clientId` attribution?
* Is the authoritative tile table the recovery source of truth, or must patch
  snapshots plus retained operations reconstruct all state independently?