---
title: Infinite Quilt Canvas Phase 1 Validation
description: Evidence-based validation of Phase 1 implementation claims against the plan and research requirements
author: GitHub Copilot
ms.date: 2026-07-27
ms.topic: reference
---

## Validation Status

Status: Partial

The conversation context claims Phase 1 is complete. This validation treats that
statement as a claim rather than evidence. The ADR covers most required product and
security decisions, but the available repository evidence does not establish the
required product and threat-model approval. It also leaves quilt row and column counts
to later deployment configuration. Downstream mutation authorization does not enforce
the ADR's member-capability condition.

## Validation Scope

* Plan: `.copilot-tracking/plans/2026-07-27/infinite-quilt-canvas-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md`
* Research: `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* Phase: 1

## Phase 1 Requirement Matrix

### Step 1.1 Immutable topology and migration decisions

* Complete: Community-quilt tenancy and product-visible patches are defined in
  `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:29-39`.
* Partial: Patch width and height are fixed at 31.2 by 20.4 world units, but initial
  patch row and column counts are delegated to deployment configuration rather than
  decided by the contract. The plan requires the ADR to fix rows, columns, patch width,
  and patch height (`.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:12-14`),
  while the ADR leaves two of those values unspecified
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:43-47`).
* Complete: Both axes wrap, canonical coordinates and patch addresses use half-open
  ranges, and persisted objects have one canonical identity
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:49-62`).
* Complete: Dimensions become immutable after content or policy state exists, and any
  later dimension change requires a new quilt and explicit migration
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:64-68`).
* Complete: Unwrapped navigation, canonical links, and a quilt-global grid origin are
  specified (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:72-89`).
* Complete: Far-zoom repetition, seam cues, and canonical minimap behavior are
  specified (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:93-109`).
* Complete: Presence, roster, undo, copy, and paste semantics cover visibility,
  eviction, canonical identity, and boundary authorization
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:113-139`).
* Complete: Legacy canvases remain bounded and require explicit opt-in or reviewed
  deterministic packing (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:141-151`).
* Complete: Database, protocol, recovery, cache, scene, and frame-time threshold
  categories each name an owner, measurement method, and rollout gate
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:249-264`).
* Missing exit-gate evidence: Research requires approved invariants and a threat model
  (`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md:276-280`),
  and the plan makes product approval a dependency
  (`.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:33-34`).
  The ADR still lists product and security review as future rollout gates
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:266-270`).

### Step 1.2 Principal, patch, and boundary authorization policy

* Complete: Stable authenticated principal mapping is server-controlled and explicitly
  excludes `clientId`, `placedBy`, socket identity, display name, and participation as
  authorization identities (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:157-174`).
* Complete: Member, owner, and moderator capabilities are defined, including claims,
  transfer, suspension, deletion, restoration, and moderation
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:178-229`).
* Complete: One visibility matrix covers patch existence, fine and aggregate data,
  presence, roster, search, and durable events
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:231-251`).
* Complete at contract level: Every geometry mutation requires authorization from all
  footprint-intersected patches and rolls back all authoritative rows, references,
  histories, and events on failure
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:253-276`).
* Deviates in downstream implementation: Any membership row currently satisfies the
  placement authorization check. The query does not select or evaluate membership role
  or a mutation capability (`apps/server/src/db/repository.ts:793-807`). The schema
  stores only `member` and `owner` roles and has no per-member capability field
  (`apps/server/src/db/types.ts:11-13`, `apps/server/src/db/schema.ts:143-160`).

## Verified File And Test Evidence

* The changes log claims the ADR defines immutable topology, migration, principal and
  patch authorization, visibility, atomic boundary mutations, and rollout gates
  (`.copilot-tracking/changes/2026-07-27/infinite-quilt-canvas-changes.md:15-17`).
  The file exists and contains each claimed contract section.
* Additive persistence implements principals, external principal mappings, quilt
  dimensions, patch ownership and lifecycle state, and patch memberships
  (`apps/server/src/db/schema.ts:45-78`, `apps/server/src/db/schema.ts:91-163`).
* Legacy backfill creates one bounded compatibility quilt and an unclaimed patch rather
  than silently creating a torus or inferring a user owner
  (`apps/server/src/db/quiltBackfill.ts:73-116`).
* Placement canonicalizes the footprint, derives every intersected patch, locks patches
  in sorted order, and rejects unauthorized writes before inserting the tile
  (`apps/server/src/db/repository.ts:742-816`).
* The PostgreSQL integration test verifies that a principal with no membership persists
  no tile, spatial reference, or operation
  (`apps/server/src/db/repository.postgres.integration.test.ts:160-190`). It does not
  verify a member without mutation capability or mixed authorization across a boundary.
* Protocol room tests cover public, principal, presence, event, and lifecycle outcomes
  (`apps/server/src/realtime/quiltRooms.test.ts:46-82`), but access values are supplied
  as precomputed booleans and do not prove the ADR matrix is persisted or role-derived.
* Focused executable validation passed for the topology, repository-helper, and room
  authorization suites: 3 test files and 7 tests passed. The PostgreSQL integration
  suite was not rerun because no PostgreSQL service was listening on the configured
  loopback port during this read-only validation.
* `git status` showed no uncommitted implementation files related to Phase 1. The only
  untracked paths were review artifacts, so no additional unlisted Phase 1 product
  changes were available for inspection.

## Findings

### Critical

1. Downstream placement authorization treats membership existence as mutation
  permission. The accepted ADR permits member mutation only when the patch ACL grants
  that capability (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:182-185`).
  Runtime code selects only `patchId` for a principal's memberships and authorizes any
  matching membership (`apps/server/src/db/repository.ts:793-807`). Persistence offers
  no capability representation beyond `member` or `owner`
  (`apps/server/src/db/types.ts:11-13`). A read-only member policy therefore cannot be
  represented or enforced, and the existing outsider-only test cannot detect this
  authorization bypass (`apps/server/src/db/repository.postgres.integration.test.ts:160-190`).

### Major

1. Required product and threat-model approval is not evidenced. The research Stage 0
  exit gate requires approved invariants and a threat model
  (`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md:276-280`),
  and Step 1.1 depends on product approval
  (`.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:33-34`).
  Although the ADR status says it is accepted for initial implementation
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:13-17`), the same ADR lists
  product and security acceptance as future gates
  (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:266-270`). No separate
  approval or threat-model artifact references this decision. The conversation claim
  that Phase 1 is complete does not satisfy this gate.

2. Quilt row and column counts remain unresolved. Research identifies rows, columns,
  and patch dimensions as product decisions
  (`.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md:365-369`),
  and Step 1.1 requires the initial topology contract to fix all four dimensions
  (`.copilot-tracking/details/2026-07-27/infinite-quilt-canvas-details.md:12-14`). The
  ADR fixes patch width and height but says deployment configuration supplies row and
  column counts (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:43-47`). This
  is a provisioning mechanism, not a recorded initial product decision.

### Minor

None.

## Coverage Assessment

The ADR covers 17 of 18 assessed Phase 1 contract areas completely and one partially,
for approximately 94% contract-document coverage. Step 1.2 is textually complete, and
Step 1.1 is partial because row and column counts are not fixed. Phase completion is
still `Partial` because the Stage 0 approval exit gate lacks evidence and executable
authorization deviates from the recorded member-capability policy. Those findings are
more significant than the raw document-coverage percentage.

## Clarifying Questions

1. Who accepted the ADR's product contract, and where is that approval and associated
  threat-model review recorded?
2. What initial `patchRows` and `patchColumns` values, or constrained provisioning rule,
  did product stakeholders approve?
3. Is every patch `member` intentionally a mutation-capable editor? If so, should the
  ADR remove conditional ACL language; if not, what persisted capability model should
  the transaction enforce?

## Validation Boundaries And Next Checks

* Rerun `apps/server/src/db/repository.postgres.integration.test.ts` against disposable
  loopback PostgreSQL.
* Add and run a database-backed test for a member without mutation permission.
* Add and run a seam-footprint test where the principal may mutate one intersected
  patch but not the other, proving complete rollback.
* Validate a persisted visibility-policy model against snapshots, aggregates, presence,
  search, and durable events after that policy is implemented.
* Obtain and cross-reference the product approval and security threat-model artifacts.
