---
title: Finite Toroidal Quilt Architecture Decision
description: Product, topology, identity, authorization, migration, and operating budget contract for community quilts
ms.date: 2026-07-27
ms.topic: concept
keywords:
  - quilt topology
  - patch authorization
  - migration
  - realtime collaboration
---

## Status

Accepted for initial implementation. Selection of an authenticated external identity
provider remains a release gate before principal-backed persistence or authorization is
enforced.

## Context

The current product stores bounded canvases, trusts caller-provided connection
identifiers, retains canvas-wide state, and treats tile attribution as an undo aid.
Those properties cannot establish ownership or safely scale to a wrapped collaborative
world. The initial quilt contract must therefore fix product semantics before topology,
persistence, protocol, and rendering work begins.

This decision establishes finite community quilts. A quilt is large enough to support
many adjacent owned regions, but it remains finite so storage, recovery, subscriptions,
and authorization have explicit bounds. Periodic display does not create additional
persisted content.

## Decision

### Tenancy and visible regions

A deployment may host multiple community quilts. A principal may participate in multiple quilts,
with an independent membership and role assignment in each quilt.
Quilts are not personal tenancy containers.

Patches are visible, first-class owned regions. They are product concepts used for
claiming, attribution, authorization, moderation, navigation, and history. Chunks are
implementation partitions for query, cache, and delivery; changing chunk dimensions
must not change patch ownership or transaction boundaries.

### Immutable topology

Each quilt records `patchRows`, `patchColumns`, `patchWidth`, and `patchHeight`.
Deployment configuration supplies the initial row and column counts when a quilt is
created. The initial patch dimensions are the existing largest `vast` canvas
dimensions: 31.2 world units wide and 20.4 world units high.

The canonical quilt width is `patchColumns * patchWidth`, and the canonical quilt
height is `patchRows * patchHeight`. Canonical coordinates use half-open ranges:
`x` is in `[0, quiltWidth)` and `y` is in `[0, quiltHeight)`. Patch row and column
indices also use half-open ranges: rows are in `[0, patchRows)` and columns are in
`[0, patchColumns)`.

Both axes wrap. Canonicalization applies positive modulo independently to `x` and `y`.
A footprint that crosses a canonical edge continues on the opposite edge and may
intersect multiple canonical patches. There is exactly one canonical identity for each
persisted object, regardless of how many periodic images are displayed.

Rows, columns, patch width, and patch height become immutable when the first content,
claim, membership-dependent policy, or durable event is recorded for the quilt. A
configured dimension change after that point requires a new quilt and an explicit
migration. Runtime resizing is not part of this contract.

### Navigation and canonical identity

The camera and interaction surface use unwrapped coordinates so navigation can
continue through any number of periodic images without a visible jump. Persistence,
authorization, search, events, selections, and mutation footprints resolve to canonical
coordinates before use.

Canonical links contain the quilt identifier plus either a canonical location or a
durable object identifier. Links never depend on a camera-relative periodic image.
Opening a canonical-location link chooses the nearest display image to the current
camera when possible. Opening a durable-object link resolves the object's current
canonical identity and then chooses a nearby display image.

The placement grid has one quilt-global origin at canonical `(0, 0)`. Patch boundaries
do not restart grid phase or pattern alignment.

### Repetition, seams, and overview

Normal zoom renders only the periodic images needed to cover the viewport and its
prefetch margin. Far zoom shows a bounded set of nearby repetitions. Repetitions beyond
that bounded neighborhood are omitted, and far-zoom content uses aggregate-only detail
rather than fine tile geometry. The client must not imply that repeated images are new
content or retain state in proportion to visible repetitions.

The primary scene uses subtle seam cues at canonical quilt boundaries. Cues identify
wrap transitions without presenting them as walls. A canonical minimap shows exactly
one canonical quilt, its patch boundaries, ownership or visibility states available to
the viewer, and the camera footprint folded into canonical space. It does not tile
periodic copies.

### Presence and roster

Fine presence is scoped to the principal's authorized area of interest. A client may
receive cursor or activity detail only for subscribed patches where the viewer is
authorized to receive fine presence. The quilt-level roster is summarized and may show
that authorized principals are participating in the quilt, but it must not reveal a
hidden patch, a hidden principal-to-patch association, or activity within a hidden
patch.

Presence is ephemeral and cannot grant ownership, membership, or mutation permission.
Participation in a quilt is not evidence of access to every patch.

### Undo and copy or paste

Undo metadata pins every entity required to validate and apply an undo through client
cache eviction. Eviction must not discard the canonical object identity, operation
identity, footprint, prior state, or patch references required by the undo contract.
At execution time, every patch intersected by the original operation must still
authorize the undo. An unauthorized or partially reconstructable undo fails without
changing any patch.

Copy is a read operation governed by fine-data visibility for every selected source.
Paste is a new atomic mutation, not a replay of the source operation. The server
canonicalizes the destination footprint and requires mutation permission from every
intersected patch. If any patch denies permission or validation fails, no pasted object,
spatial reference, history entry, or event is committed.

### Legacy migration

Legacy canvases remain bounded with their existing edge semantics. A legacy canvas must
not be silently reinterpreted as a one-by-one torus because doing so would make formerly
distant edges adjacent.

Migration requires either explicit owner opt-in to a selected quilt placement or a
deterministic packing process with a reviewed mapping. The process preserves durable
object identity where possible, records source-to-destination provenance, detects
collisions before commit, and supports parity verification and rollback. Unmigrated
legacy canvases remain available through the bounded legacy path during staged rollout.

## Identity and authorization contract

### Stable principals

Every authorized action requires a stable authenticated external principal mapped to an
internal principal identifier. The mapping is server-controlled, durable across devices
and reconnects, unique within an identity-provider namespace, and auditable. The server
must reject authorization when the external identity cannot be mapped unambiguously.

The concrete identity provider remains unresolved and is a release gate. The release
that enables patch claims or ACL enforcement must select the provider, define account
linking and recovery, validate issuer and audience, and document principal deletion and
provider outage behavior.

`clientId`, `placedBy`, socket identity, display name, and participation records are not
principal identifiers and must not grant ownership. `placedBy` remains attribution data
only.

### Patch roles and capabilities

Roles are scoped to a quilt and patch unless explicitly described as quilt-wide.
Quilt moderators receive moderation powers through a separate, audited assignment and
do not become patch owners.

| Capability | Member | Owner | Moderator |
|---|---|---|---|
| Read fine patch data | When patch visibility or ACL permits | Yes | Yes for a documented moderation purpose |
| Create, update, delete, undo, or paste content | When patch ACL grants the mutation | Yes, subject to suspension and policy | Yes for an audited moderation action |
| Invite or remove patch members | No | Yes | Yes for moderation or recovery |
| Change member capabilities | No | Yes | Yes for moderation or recovery |
| Transfer patch ownership | No | Initiate or accept | Approve, cancel, or recover |
| Suspend mutation access | No | No | Yes |
| Delete or restore a patch | No | Request deletion | Approve, execute, or restore |
| Moderate content and durable events | No | Report or remove own content when authorized | Yes, with an audit reason |
| Claim an eligible patch | Eligible quilt member | Not while already owned | Resolve disputed or exceptional claims |

An owner may delegate mutation capabilities to members but cannot delegate ownership or
moderator status through a member grant. Moderation access is least-privilege, reasoned,
audited, and limited to the action under review.

### Patch lifecycle

An eligible authenticated quilt member may atomically claim an unclaimed patch. The
claim creates ownership and its durable event together. Concurrent claims have one
winner.

Ownership transfer uses an explicit pending transfer to a stable internal principal.
The recipient must accept before ownership changes. Until acceptance, the current owner
retains responsibility. Moderators may cancel, approve, or recover a transfer when
policy, account loss, or abuse requires intervention. Every transition is durable and
audited.

Suspension blocks mutations, claims, transfers, membership changes, and fine presence
publication for the suspended scope. It does not erase content or history. Visibility
during suspension follows the matrix below and any moderation hold.

Patch deletion is a moderated, recoverable lifecycle transition before final erasure.
A deletion request blocks new mutations. Approval hides fine data and presence, retains
data required for recovery and audit, and emits only events visible under the matrix.
Final erasure occurs only after the separately approved retention policy permits it.

Legacy content without a verified owner is system-owned and unclaimed. The system owner
is not a user principal and cannot perform interactive actions. Such a patch remains
read-only until an authenticated principal completes the claim or transfer process.
Import provenance and legacy attribution do not establish ownership.

### Visibility matrix

Each patch has an effective visibility policy and lifecycle state. The same server-side
matrix controls snapshots, subscriptions, queries, search indexing, presence fanout,
and durable event delivery. Authorization is evaluated for the viewer at request and
publication time.

| Surface | Public viewer | Authorized patch member or owner | Quilt moderator |
|---|---|---|---|
| Patch existence | Visible only when policy publishes existence | Visible | Visible for assigned moderation scope |
| Fine data | Visible only when policy grants public fine access | Visible according to ACL | Visible only for a documented moderation purpose |
| Aggregate data | Coarsened aggregate when policy publishes it; hidden otherwise | Visible at authorized resolution | Visible for assigned moderation scope |
| Fine presence | Never public | Only within authorized area of interest | Only for a documented moderation purpose |
| Quilt roster | Public summary only when quilt policy permits; no hidden patch activity | Quilt-level summary without hidden patch associations | Summary plus scoped moderation signals |
| Search | Only public fields from surfaces visible to the viewer | Authorized fine or aggregate results | Scoped moderation search with audit reason |
| Durable events | Only events whose subject and payload are public | Events redacted to the viewer's current visibility | Scoped moderation events with audit reason |

A hidden patch contributes no public count, occupancy signal, search result, presence,
or event that would reveal its existence or activity. Aggregate output must be coarse
enough to avoid reconstructing fine content or hidden patch activity. Role possession
does not bypass lifecycle suspension or purpose limits except through an audited
moderation action.

### Boundary authorization and atomicity

For every create, update, delete, undo, paste, move, or other geometry mutation, the
server computes the complete canonical footprint before authorization. It derives all
intersected canonical patches, deduplicates them, locks them in deterministic order,
and rechecks identity, lifecycle, ACL, geometry, and collision rules inside one database
transaction.

Cross-patch writes are all-or-nothing and require authorization from every
footprint-intersected patch. A denial, stale precondition, collision, missing entity, or
transaction failure rolls back the authoritative object, every spatial reference,
every patch history entry, and every durable event. The server publishes no success or
partial event before commit.

No client-side check is authoritative. A geometry's anchor patch, creator, attribution,
majority area, or destination patch cannot substitute for authorization from all
intersected patches.

## Operating budget gates

Numeric thresholds are intentionally deferred until representative measurement. Each
threshold below must be recorded in deployment configuration or a release artifact only
after its owner reviews the stated evidence. A rollout cannot advance through the gate
while its threshold is absent or violated.

| Category | Unresolved threshold | Owner | Measurement method | Rollout gate |
|---|---|---|---|---|
| Database | Transaction latency, lock wait, intersected-patch count, query rows, index growth, and storage growth | Data and server owners | Load tests against production-like PostgreSQL plus query plans, lock telemetry, and migration parity reports | Block patch-scoped write canary until representative seam and distant-write workloads meet approved limits |
| Protocol | Snapshot and event bytes, subscription count, churn rate, acknowledgement lag, and reconnect transfer | Realtime protocol owner | Instrument encoded payloads and connection telemetry during scripted pan, zoom, reconnect, and multi-user workloads | Block protocol-v2 expansion until approved client classes stay within negotiated limits |
| Recovery | Replay length, snapshot age, reconstruction time, recovery point, and recovery completeness | Reliability owner | Restore drills from authoritative rows, snapshots, and events, including quiet and partially retained histories | Block retention changes and production recovery enablement until drills satisfy approved objectives |
| Cache | Canonical chunks, tiles, aggregates, pinned entities, memory use, and eviction churn | Client state owner | Browser telemetry and deterministic camera traversals with selection, optimistic state, and undo pins | Block bounded-cache rollout until memory stabilizes and required pins survive eviction |
| Scene | React objects, draw calls, materials, visible periodic images, and fine versus aggregate geometry | Rendering owner | Browser profiling and scene counters across seam, far-zoom, minimap, and dense-content scenarios | Block far-zoom and periodic rendering rollout until approved scene limits hold |
| Frame time | Interaction, canonicalization, update, and render duration by target device class | Client performance owner | Automated frame traces and input-latency profiles on the supported device matrix | Block general availability until approved percentile objectives hold for every supported class |

Threshold approval must identify the measured workload, device or deployment class,
measurement window, percentile or failure criterion, and rollback trigger. A threshold
for one class must not be copied to another without measurement.

## Rollout and release gates

1. Product review accepts the topology, migration, visibility, moderation, undo, and
   copy or paste semantics in this decision.
2. Security review selects the external identity provider and accepts principal mapping,
   account lifecycle, audit, and moderator controls.
3. Additive persistence work proves deterministic legacy mapping, parity, and rollback
   before any legacy canvas opts in.
4. Patch-scoped transaction tests prove atomic seam conflicts, deterministic lock order,
   and parallel distant-patch writes before cross-patch mutation is enabled.
5. Protocol-v2 recovery and authorization tests prove scoped snapshots, redaction,
   reconnect reconstruction, and no hidden-activity leakage before area-of-interest
   delivery expands.
6. Every operating budget category has an approved measured threshold and passes its
   rollout gate before general availability.

## Consequences

### Positive consequences

* Product-visible ownership aligns with the authorization and history boundary.
* Canonical persistence prevents periodic display aliases from duplicating identity.
* Immutable dimensions make modulo arithmetic, links, recovery, and migration stable.
* One visibility matrix reduces disagreement among realtime, search, and API surfaces.
* Atomic footprint authorization prevents partial cross-boundary changes.

### Costs and risks

* Stable external identity and account lifecycle become prerequisites for ownership.
* Cross-patch operations require multi-resource locking and may cost more than local
  operations.
* Hidden patches require careful aggregate, event, roster, and search redaction.
* Legacy migration requires explicit consent or reviewed deterministic packing.
* Production capacity remains gated on measurements that are not yet available.

## Alternatives considered

### One global quilt

A single deployment-wide quilt simplifies discovery but couples every community to one
visibility, moderation, topology, and migration domain. It also prevents a principal
from joining independently governed quilts. This option was rejected.

### One quilt per user

Personal quilts avoid shared ownership but do not provide adjacent community-owned
regions. This option was rejected as the default tenancy model.

### Patch-local persistence with duplicated seam objects

Duplicating an object into each periodic image or intersected patch makes identity,
undo, links, and events ambiguous. One canonical object with patch spatial references
was selected instead.

### Silent one-by-one torus migration

Treating every legacy canvas as a one-by-one torus is mechanically convenient but
changes edge adjacency and collision behavior. Explicit opt-in or deterministic packing
was selected instead.

## References

* [Infinite quilt canvas research](../../.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md)
* [Production deployment architecture](./2026-07-15-deployment-architecture-v01.md)
* [GitHub issue 53](https://github.com/dkirby-ms/zzyix/issues/53)
