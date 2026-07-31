<!-- markdownlint-disable-file -->

# Canonical Infinite Canvas Convergence Research

## User Request

Define how to move from a lobby where users create and join separate canvases to one
product-level infinite canvas where users claim patches.

The canonical infinite canvas is the only product experience that must be preserved.
Legacy canvas content does not require archive, import, migration, or continued access.

## Current State

The branch has already built most of the correct runtime boundary for the target model:

* Quilts provide one durable world identity and finite toroidal topology.
* Patches provide ownership, authorization, history, and consistency boundaries.
* Chunks provide viewport-scoped query, cache, and realtime delivery partitions.
* Tiles retain one canonical identity even when periodic images repeat on screen.

The remaining product entry flow still exposes the older session model:

* `apps/client/src/App.tsx` opens a lobby, lists sessions, and allows finite preset creation.
* `apps/client/src/network/session.ts` persists and connects through a selected session ID.
* `apps/server/src/index.ts` lists all canvases and creates a bounded canvas plus one patch.
* Socket authentication uses `sessionId`, which protocol V2 resolves indirectly through
  `quilts.legacy_canvas_id`.

Patch claims are already keyed by stable patch ID and resolved to a quilt in the database.
They do not need to become canvas-scoped or be re-keyed for canonical entry.

## Decision

Use one database-backed canonical-world pointer discovered through an authenticated API.
The pointer selects one protocol-V2 toroidal quilt and its existing compatibility canvas
ID. During rollout, the client continues passing that canvas ID to the socket handshake.

Do not compile a literal canonical UUID into the client. Database identities differ across
development, test, restored, staging, and production environments. Do not federate legacy
sessions as spatial shards. Patches and chunks already provide the correct spatial and
delivery partitions inside one quilt.

The initial change is routing, not content migration. Preserve the selected quilt, patch,
tile, operation, snapshot, policy, claim, and audit IDs. Legacy canvases receive no product
access, migration, import, archive UX, or identity-preservation work.

## Target Entry Flow

1. Authentication resolves the stable principal.
2. The client requests the canonical world descriptor.
3. The server validates and returns the active quilt, compatibility canvas ID, topology,
   protocol version, and initial canonical location.
4. The client connects through the compatibility canvas ID and requires protocol V2.
5. The client subscribes only to visible patch and chunk rooms.
6. An unowned principal discovers an eligible patch and claims it by stable patch ID.
7. Navigation, placement, reconnect, and history remain quilt and patch based.

## Required Product Decisions

These decisions cannot be inferred safely from the repository:

* Confirm that “infinite” remains the accepted finite torus rather than an unbounded plane.
* Choose canonical topology dimensions before the first production claim or content write.
* Choose whether production adopts an existing protocol-V2 quilt or provisions a new one.
* Define root entry location, deep-link identity, patch discovery, and claim navigation.
* Confirm the one-active-patch-per-principal-per-quilt ownership limit.
* Define the unsupported or upgrade-required response for older clients that call session
  list and creation APIs after cutover.

## Runtime Gates

Canonical entry must fail closed unless the pointer resolves to exactly one active target
with a protocol-V2 toroidal quilt, a compatibility canvas ID, complete patch addresses,
and required policies. Product session creation must remain available until the canonical
entry canary proves stable.

Before general rollout, fix ordinary network reconnection and V2 presence lifecycle.
Current browser sockets retry only authentication failures, and last-socket detection is
process-local across replicas.

## Recommended Sequence

### Phase 0: Product Contract and Inventory

Amend the accepted quilt ADR for one product-level canonical quilt. Inventory deployed
canvases and quilts, select topology and target, and complete backup and restore checks.

### Phase 1: Canonical Control Plane

Add an expand-only singleton pointer migration, explicit idempotent provision or select
command, startup validation, authenticated discovery endpoint, and conflict tests. Keep
the lobby and session APIs unchanged.

### Phase 2: Canary Entry

Add an independent client and server flag that replaces lobby loading with canonical
discovery and automatic entry. Require protocol V2 for the canonical target. Keep the
lobby and session storage code available for immediate application rollback.

### Phase 3: Runtime Hardening

Make V2 presence symmetric and multi-replica correct. Add bounded ordinary reconnect,
token renewal, cursor resubscription, and protected-cache clearing. Run seam, ownership,
recovery, retention, cache-budget, and cross-replica tests against a canonical fixture.

### Phase 4: Product Cutover

Expand canonical entry, disable new product session creation for supported clients, and
replace lobby create and join controls with navigation, patch discovery, and claiming.

### Phase 5: Compatibility Retirement

Move socket identity from compatibility canvas ID to quilt ID. Retire canvas-wide rooms,
snapshots, sequencing, session cache, lobby storage, and legacy REST APIs only after rollout
and recovery gates pass.

## Rollback Principle

Rollback disables canonical entry and restores the lobby while keeping writes reachable
through the same compatibility canvas ID. Never roll back by dropping additive schema,
deleting the canonical quilt, or repointing users to a second writable quilt.

## Evidence

* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`
* `.copilot-tracking/research/subagents/2026-07-29/infinite-canvas-convergence-research.md`
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* `apps/client/src/App.tsx`
* `apps/client/src/network/session.ts`
* `apps/client/src/network/useSocketConnection.ts`
* `apps/server/src/index.ts`
* `apps/server/src/db/schema.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/migration/quiltRollout.ts`
