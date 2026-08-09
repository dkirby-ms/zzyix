---
title: Resident Architecture Research
status: in-progress
ms.date: 2026-08-09
---

## Scope

Research issue #176, `feat(agents): prototype quiet witness resident presence`, across the
resident-agent architecture, real-time quilt collaboration, identity and attribution,
non-destructive signaling, reset behavior, persistence, and safety/privacy boundaries.

## Issue Contract

Issue #176 requests subtle glyphs, nearby traces, quiet patch visits, recurring motifs, and
discoverable marks. Its acceptance criteria require non-destructive, explicitly attributable
signals; testing for intrigue, discomfort, invisibility, confusion, and perceived authorship;
and behavior that can be disabled or reset without affecting artist work.

## Architecture Findings

### Resident authority and lifecycle

The accepted resident architecture makes the server the sole authority for
authentication, principal resolution, ownership, tile validation, collision
detection, revisions, idempotency, event ordering, auditing, and replica-safe
transactions. The worker is explicitly barred from direct PostgreSQL writes and
from bypassing authenticated HTTP or Socket.IO contracts. See
`docs/decisions/2026-08-07-resident-agent-architecture.md`, lines 18-24 and
130-160.

The later Fantome architecture supersedes only the original TypeScript worker
runtime. It specifies one durable, serialized resident workflow per quilt,
guarded by a PostgreSQL lease and checkpoint recovery. It retains the same
authority boundary and states that v1 is read-only, with model-generated canvas
mutation unauthorized. See `docs/fantome-resident-agent-architecture.md`, lines
24-47, 49-61, 91-118, and 313-337.

The current implementation matches that contract. `GraphWorkflow` uses
`load_context`, `load_events`, and `draft_proposal` nodes, and its only model
prompt requests an observation-only proposal. The workflow emits a structured
proposal or a feature-gated fallback, not a canvas command. See
`apps/agent-worker/src/workflow.py`, lines 34-64 and 91-163.

The database already supplies a control plane for this behavior:

* `agent_control.agent_assignments` binds an agent principal to a quilt and
	optional patch, carries a policy version, and permits `active`, `paused`, or
	`disabled`. See `apps/server/src/db/schema.ts`, lines 217-250.
* `agent_control.runs`, `quilt_leases`, `trigger_queue`, and `checkpoints`
	provide single-quilt serialization, expiry, bounded trigger state, and
	resumable workflow state. See `apps/server/src/db/schema.ts`, lines 252-389.
* The Python control-plane client claims a trigger only for an active matching
	assignment, starts/resumes a matching run, and conditionally claims a lease.
	See `apps/agent-worker/src/control_plane.py`, lines 244-356.

### Real-time quilt and presence behavior

Presence is an authenticated, visibility-controlled transport surface, not a
public broadcast. Room resolution requires an authenticated principal, maps a
`presence` request through the patch visibility policy, and rejects deleted
patches and unauthorized requests. See `apps/server/src/realtime/quiltRooms.ts`,
lines 16-66 and 101-143. The persisted policy explicitly prohibits public
presence. See `apps/server/src/db/schema.ts`, lines 430-476.

The public client contract defines `ClientPresence` as a client ID, join time,
and optional pointer. Tile state instead has optional `placedBy` attribution.
See `apps/server/src/contracts.ts`, lines 73-85. Client-side collaborator state
is ephemeral: it has `present`, optional pointer and selected tile, a timestamp,
an 8-second TTL, and a one-second cleanup interval. See
`apps/client/src/domain/collaboratorUtils.ts`, lines 3-15 and 40-114.

`App.tsx` sets collaborator presence on `client_joined`, clears its pointer and
selection on `client_left`, derives remote cursors only for active collaborators,
and periodically evicts stale signals. See `apps/client/src/App.tsx`, lines
715-750 and 927-933. The existing cross-replica E2E test verifies that duplicate
sockets for one principal do not emit a duplicate join and that a leave is sent
only after the final socket disconnects. See `e2e/quilt-reconnect.spec.ts`,
lines 124-138.

The renderer provides two suitable visual precedents. Remote cursors render as a
small colored sphere plus ring above the canvas, without modifying a tile. See
`apps/client/src/render/MosaicScene.tsx`, lines 222-238. Durable tile authorship
renders a boundary only when `placedBy` differs from the local ownership
identity. See `apps/client/src/render/MosaicScene.tsx`, lines 134-199.

### Attribution and identity

Agent identity is a pre-provisioned, active principal mapped to an external
subject. `resolveAgentPrincipal` rejects non-app-agent tokens, unmapped IDs,
non-agent kinds, and inactive principals. See
`apps/server/src/auth/principalContext.ts`, lines 103-137. This yields a
durable agent principal ID for audit and a safe display name held in the
`principals` table, rather than relying on arbitrary socket client IDs.

The durable tile schema stores a nullable `placed_by` string, while patch
operations separately store `actor_principal_id` and authorization audits store
actor, subject, quilt, patch, request, socket, operation, source channel, and
before/after state. See `apps/server/src/db/schema.ts`, lines 620-650 and
557-601. A resident mark must not use either tile or patch-operation fields,
because that would make it artist-visible as an authoritative canvas mutation
and bring it into undo, revision, replay, retention, and ownership semantics.

### Read scope, privacy, and retention

The worker has only typed GET tools for quilt context, patch snapshots, and
patch events. It validates UUIDs and limits before issuing a request. See
`apps/agent-worker/src/tools.py`, lines 20-95. Worker-side redaction reduces
quilt context to topology and patch count, snapshots to IDs/revision/count, and
events to IDs, sequence, type, and timestamp. It caps serialized tool responses
at 64 KB. See `apps/agent-worker/src/tools.py`, lines 129-184.

The server independently requires assignment before agent reads, restricts
quilt context to assigned patches, checks the requested patch assignment, bounds
data size, and writes authorization-audit records for allowed and denied reads.
See `apps/server/src/routes/agentReads.ts`, lines 24-29, 99-161, and 168-266.

The accepted architecture also requires prompt minimization and memory-disabled
v1 operation: no user-authored content, secrets, raw claims, private patch
data, internal authorization metadata, or unredacted telemetry may enter model
prompts. Raw prompts and responses are not retained by default. See
`docs/fantome-resident-agent-architecture.md`, lines 197-259. Existing server
retention snapshots patch state before pruning operations and snapshots; defaults
are 7 and 30 days respectively. See `apps/server/src/jobs/retention.ts`, lines
1-26. Principal deletion is fail-closed until explicit retention approval. See
`apps/server/src/jobs/principalDeletion.ts`, lines 10-47.

## Relevant History

The pertinent implementation history is recent and focused:

* `ba2637a` on 2026-08-07 recorded the resident-agent architecture design.
* `f7a38fa` on 2026-08-07 introduced the read-only Fantome worker.
* `e155398` on 2026-08-08 added the Microsoft Agent Framework implementation.
* `3a16212` on 2026-08-08 hardened resident recovery and access controls.
* `00ebdfb` on 2026-08-08 removed a test-only worker runtime environment
	variable.

No history indicates that a resident-presence or mark transport already exists.

## Risks and Constraints

* Persisting witness marks as tiles violates the issue's non-destructive goal,
	contaminates author attribution, and makes reset affect canonical artwork.
* Adding marks to patch operations causes durable replay, revision, retention,
	and visibility-policy consequences that the issue does not need.
* Using an arbitrary `clientId` for attribution is weak: client IDs are
	connection-facing, while the agent principal is the verified durable identity.
* Broadcasting witness activity through an unrestricted room or using a public
	presence policy would conflict with the existing authenticated-only presence
	constraint.
* Sending exact artwork, user text, or private patch data to the model would
	exceed the present read-tool redaction and the accepted no-user-content prompt
	policy.
* Disabling only client rendering is insufficient. The worker could continue to
	emit signals, and different clients could disagree about whether the resident
	is present.
* A persistent visual trace needs an explicit expiry and reset ownership model.
	Without one, it becomes durable resident memory, an unapproved capability.

## Implementation Recommendation

Implement issue #176 as an explicitly attributed, temporary `resident_signal`
presence extension. Keep it entirely outside tiles, `patch_operations`, and
artist ownership.

### Server and protocol

1. Add an optional, versioned resident-signal payload to the existing
	 authenticated `presence` room contract, for example:

	 ```ts
	 type ResidentSignal = {
		 agentPrincipalId: string
		 displayName: string
		 kind: 'glyph' | 'trace' | 'visit' | 'motif'
		 position: Vec2
		 motifId?: string
		 signalId: string
		 expiresAt: number
	 }
	 ```

	 The server derives `agentPrincipalId` and the safe display name from the
	 authenticated agent principal. It must never trust caller-supplied identity,
	 expiry, patch, or permission data.

2. Permit emission only when the matching `agent_assignments` record is
	 `active`, the agent owns the current per-quilt lease, and the target patch
	 grants authenticated `presence` visibility. Cap rate, count, payload size,
	 and TTL. Treat signals as idempotent by `signalId` within their TTL.

3. Store no canonical witness signal. Broadcast the validated payload to the
	 same authorized presence room, and retain only a redacted authorization/audit
	 event plus metric counters. An in-memory/Redis TTL cache is appropriate for
	 cross-replica deduplication and reconnect snapshots; it is not a source of
	 canonical artwork truth. Do not route this through the worker model.

4. Extend current assignment transitions so `paused` and `disabled` immediately
	 suppress new signal emission and clear live cache entries. Existing sockets
	 may expire normally, consistent with the approved agent lifecycle. Expose an
	 administrator reset action that clears only this cache/audit correlation
	 scope, never tiles, patches, ownership, snapshots, or user state.

### Worker and policy

1. Add a deterministic `QuietWitnessPolicy` invoked after the existing
	 read-only context load. It chooses a sparse signal from approved topology,
	 assignment, and policy configuration. It does not examine or transmit raw
	 user content and does not call the model gateway.

2. Version policy and motif configuration, record the policy version and
	 trigger ID in redacted telemetry, and use the existing lease guard before
	 every emission. On lease loss, pause, disable, authorization failure, or
	 rate exhaustion, emit nothing and checkpoint the result.

3. Keep the present model prompt and read-tool contract unchanged for this
	 issue. The resident presence is deterministic system behavior, not an LLM
	 creative decision.

### Client

1. Add a separate `ResidentSignalMap`, not a `RemoteCollaborator` or
	 `TileInstance` field. Expire it on `expiresAt`, clear it on explicit reset,
	 room unsubscription, assignment disabled/paused notice, and auth loss.

2. Render a subdued, non-interactive glyph/ring/short dashed trace at a higher
	 Z position, following `RemoteCursorMesh` rather than `TileMesh`. Include an
	 accessible label such as `Fantome, quiet witness` and a visible attribution
	 affordance that reveals agent name and signal type. Never place it in tile
	 selection, collision, minimap occupancy, undo, or author-boundary paths.

3. Use a dedicated client setting to hide resident signals locally. This is a
	 display preference only; an administrator disable/reset remains the shared
	 control. Instrument impressions using event names and categorical choices,
	 not free-text canvas content: intrigue, discomfort, invisibility, confusion,
	 and perceived authorship.

### Verification matrix

* Unit tests: client expiry/reset, explicit attribution, setting-based hide,
	no tile-cache or undo changes; server validates agent identity, assignment,
	visibility, TTL, rate, and payload schema; worker policy is deterministic and
	silent when lease/assignment checks fail.
* Integration tests: active assigned agent reaches only authorized presence
	rooms; paused/disabled agent cannot create a signal; reset removes all live
	signals while a checksum of tile, patch, ownership, and revision state is
	unchanged; agent read authorization remains unchanged.
* Multi-replica E2E: one witness signal is deduplicated across replicas,
	reconnect receives only unexpired signals, final expiry/disable clears the
	signal once, and authorized observers alone see it.
* Human evaluation: use the issue's five outcome measures, reveal attribution
	before authorship questions, and capture consent/withdrawal for any free-text
	feedback separately from product telemetry.

## Open Gaps and Clarifying Decisions

* The issue does not specify who can invoke shared disable/reset, whether it is
	quilt owner, administrator, or both. The control-plane schema supports the
	state transition, but the authorization endpoint and UI do not yet exist.
* The issue does not define the intended lifetime or cadence of a trace/visit.
	Start with a short fixed TTL and a very low rate, then measure the requested
	visibility and discomfort outcomes before making it durable.
* The existing protocol provides generic collaborator presence but no verified
	agent-presence event or room cache. Adding a new versioned payload is lower
	risk than overloading human cursor data, but requires contract/version and
	multi-replica implementation work.
* It is not established whether resident signals should appear in the minimap.
	The recommendation excludes them from minimap occupancy in v1 to preserve the
	non-destructive distinction.

## Research Status

Complete. The repository has sufficient architecture, safety, persistence, and
test evidence to recommend a transient, authenticated resident-presence signal
without modifying canonical artwork.
