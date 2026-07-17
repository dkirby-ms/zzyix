<!-- markdownlint-disable-file -->
# Task Research: Multi-Client Session Management

Research how to evolve the current partially integrated client/server authority model so multiple clients can collaborate on the same canvas with predictable consistency, reconciliation, and session lifecycle behavior.

## Task Implementation Requests

* Review current client and server session management architecture.
* Identify gaps that prevent robust multi-client collaboration on one canvas.
* Recommend concrete session model and sync protocol updates.
* Provide code-touch references and migration steps.

## Scope and Success Criteria

* Scope: Client and server session state, socket lifecycle, operation propagation, sequencing/ordering, conflict handling, and reconnection behavior for shared canvas collaboration.
* Assumptions:
  * The system remains server-authoritative for canonical canvas state.
  * Existing optimistic local application remains desirable for responsive UX.
  * Transport is websocket-based and should be retained unless evidence indicates otherwise.
* Success Criteria:
  * Document current state with verified file-level evidence.
  * Define at least two viable approaches and select one.
  * Provide a concrete recommended protocol for multi-client operation flow.
  * Include actionable implementation plan with file references.

## Outline

1. Baseline current session/sync architecture (client + server)
2. Identify collaboration gaps and failure modes
3. Evaluate alternatives
4. Select approach and propose incremental implementation plan
5. Define test strategy updates for multi-client collaboration

## Potential Next Research

* Validate cross-tab identity strategy for clientId reuse
  * Reasoning: clientId is persisted in localStorage, likely shared across tabs.
  * Reference: apps/client/src/network/session.ts:15
* Verify retention window safety for snapshot + operation-log replay
  * Reasoning: replay correctness depends on operation logs retained beyond latest snapshot.
  * Reference: apps/server/src/db/repository.ts:838, apps/server/src/db/snapshots.ts:4
* Decide undo semantics for multi-client sessions
  * Reasoning: current undo targets latest settled tile globally, not per author.
  * Reference: apps/client/src/App.tsx:169

## Research Executed

### File Analysis

* apps/client/src/App.tsx
  * Session bootstrap, optimistic placement/remove flows, gap-triggered reconnect snapshot recovery.
* apps/client/src/interaction/controller.ts
  * Sequenced reconciliation model (`lastOpSeq`, `requiresSnapshot`) and optimistic ack merge logic.
* apps/client/src/network/session.ts
  * Session ID and client ID persistence behavior.
* apps/client/src/network/useSocketConnection.ts
  * Socket auth, reconnect policy, subscribed server events.
* apps/server/src/contracts.ts
  * Shared protocol contract for mutation payloads, acks, snapshot, and sequenced deltas.
* apps/server/src/index.ts
  * Socket auth, join/snapshot flow, revision precheck, mutation ack + broadcast behavior.
* apps/server/src/db/repository.ts
  * Transactional authoritative persistence, advisory-lock sequencing, idempotency, replay model.
* apps/server/src/db/schema.ts
  * Data constraints for canvases, participants, operation log, idempotency keys, snapshots.
* apps/server/src/index.concurrency.test.ts
  * Deterministic first-write-wins and sequencing expectations.
* apps/client/src/interaction/controller.test.ts
  * Client dedupe/gap/optimistic reconciliation expectations.

### Code Search Results

* `expectedRevision`
  * Present in protocol and server validation: apps/server/src/contracts.ts:205, apps/server/src/index.ts:673
  * Missing from current client outbound place/remove payloads: apps/client/src/App.tsx:238, apps/client/src/App.tsx:264
* `session_snapshot`
  * Emitted on connection from server replay: apps/server/src/index.ts:638
  * Consumed client-side as full sequenced reset: apps/client/src/App.tsx:86
* `opSeq`
  * Monotonic server sequencing and client ordering checks: apps/server/src/db/repository.ts:559, apps/client/src/interaction/controller.ts:106
* `idempotent`
  * Server suppresses duplicate rebroadcast for replayed mutations: apps/server/src/index.ts:729, apps/server/src/index.ts:796

### External Research

* None required for current recommendation; selected approach is strongly codebase-grounded.

### Project Conventions

* Standards referenced: existing TypeScript modular split (`client`/`server`), shared protocol contracts, deterministic test coverage for domain and sequencing.
* Instructions followed: Task Researcher mode constraints, .copilot-tracking-only edits, evidence-first recommendations, plain-text path references.

## Key Discoveries

### Project Structure

* Client and server are separated under apps/client and apps/server, with protocol cohesion in apps/server/src/contracts.ts.
* Session identity uses two IDs:
  * `sessionId` in sessionStorage created via REST if absent: apps/client/src/network/session.ts:3
  * `clientId` in localStorage (persistent identity): apps/client/src/network/session.ts:15
* Server authority is effectively database-backed even though in-memory maps exist for runtime bookkeeping:
  * Socket mutation handlers persist via repository methods: apps/server/src/index.ts:710, apps/server/src/index.ts:776
  * Replay uses latest snapshot + op tail: apps/server/src/db/repository.ts:838

### Implementation Patterns

* Pattern 1: Optimistic local apply + authoritative ack reconcile.
  * Client appends temp tile immediately and reconciles via ack success/failure: apps/client/src/App.tsx:230, apps/client/src/App.tsx:248
* Pattern 2: Snapshot bootstrap + ordered delta stream.
  * Client resets from `session_snapshot` and applies `tile_placed`/`tile_removed` by strict `opSeq`: apps/client/src/App.tsx:86, apps/client/src/interaction/controller.ts:106
* Pattern 3: Server-side transactional ordering with per-session lock and monotonic sequence.
  * Advisory lock and `max(op_seq)+1` allocation: apps/server/src/db/repository.ts:387, apps/server/src/db/repository.ts:559
* Pattern 4: Idempotent mutation replay protection.
  * Duplicate requests can return deterministic replay outcomes; server avoids duplicate broadcasts: apps/server/src/db/repository.ts:430, apps/server/src/index.ts:731

Critical gaps discovered:

* Client does not send `expectedRevision`, despite contract and server support.
* Client has no explicit pending-operation queue for replay/rebase beyond immediate optimistic patching.
* Gap recovery depends on reconnect side effect rather than explicit snapshot request protocol.
* Current undo semantics are session-global latest tile, problematic for multiple active users.

### Complete Examples

```ts
// Current optimistic placement without expectedRevision in outbound payload.
const optimisticTile = composeOptimisticTile({...});
setSequencedState((prev) => appendOptimisticPlacement(prev, optimisticTile));
socketRef.current.emit(
  "place_tile",
  {
    tileId: createServerTileId(),
    x: placement.x,
    y: placement.y,
    rotation: placement.rotation,
    shape,
    material,
    // expectedRevision missing today
  },
  (ack) => {
    setSequencedState((prev) => reconcilePlacementAck(prev, optimisticTile.id, ack));
  },
);
```

### API and Schema Documentation

* Socket auth requires both `sessionId` and `clientId`: apps/server/src/index.ts:588
* Mutation payload contracts support `expectedRevision`: apps/server/src/contracts.ts:205
* Snapshot and delta contracts include ordered mutation stream (`lastOpSeq`, event `opSeq`):
  * apps/server/src/contracts.ts:264
  * apps/server/src/contracts.ts:270
  * apps/server/src/contracts.ts:276
* DB uniqueness and ordering constraints:
  * `operation_log` unique `(canvas_id, op_seq)`: apps/server/src/db/schema.ts:106
  * `snapshots` unique `(canvas_id, op_seq)`: apps/server/src/db/schema.ts:147
  * participant key `(canvas_id, client_id)`: apps/server/src/db/schema.ts:60

### Configuration Examples

```yaml
protocol:
  authority: server
  sync_model: snapshot_plus_ordered_deltas
  ordering:
    field: opSeq
    source: server_transaction
  optimistic_client:
    enabled: true
    reconcile_on_ack: true
  concurrency_guard:
    field: expectedRevision
    currently_used_by_client: false
```

## Technical Scenarios

### Current Session Flow Baseline

Client/session lifecycle and mutation flow already support multi-client fundamentals but are incomplete in client protocol usage:

* On app bootstrap: client ensures `clientId`, ensures/creates `sessionId`, then connects socket with both identifiers.
* On connect: server joins room and emits `session_snapshot` from replayed authoritative state.
* On edits: client applies local optimistic tile immediately, then submits mutation and reconciles ack.
* On remote updates: client applies sequenced deltas by `opSeq`; sequencing gaps trigger reconnect-based snapshot recovery.
* Server enforces canonical mutation outcomes with transaction-ordered `opSeq`, idempotency, and optional revision preconditions.

**Requirements:**

* Understand current session creation/join/update path
* Identify current authority boundaries

**Preferred Approach:**

* Keep current server-authoritative model and extend protocol completeness rather than replacing the architecture.

```text
Client Browser
  -> ensureClientId() [localStorage]
  -> ensureSession() [REST create/read sessionId]
  -> socket auth {sessionId, clientId}
Server
  -> join room(sessionId)
  -> load replay record (snapshot + op log)
  -> emit session_snapshot
Client edit
  -> optimistic local mutate
  -> emit place/remove
Server
  -> validate + persist + assign opSeq (+ revision)
  -> ack emitter + broadcast sequenced event to room
Clients
  -> apply sequenced deltas; recover via snapshot on gap
```

**Implementation Details:**

* Strong building blocks already exist for multi-client consistency:
  * Sequencing: apps/server/src/db/repository.ts:559
  * Snapshot replay: apps/server/src/db/repository.ts:838
  * Client gap detection: apps/client/src/interaction/controller.ts:117
* Missing client-side use of `expectedRevision` is the key correctness gap for concurrent clients.

```ts
// Recommended direction: include expectedRevision from client state in mutation payloads.
socket.emit("place_tile", {
  tileId,
  x,
  y,
  rotation,
  shape,
  material,
  expectedRevision: sequencedState.revision,
});
```

#### Considered Alternatives

* Full-snapshot last-write-wins protocol
  * Rejected: loses operation-level causality, weak conflict semantics, poor fit with existing op-log architecture.
* CRDT/OT-centric redesign
  * Rejected for near-term: high complexity and weak fit with strict geometry constraints already validated server-side.

### Recommended Multi-Client Session Model

Selected approach: **operation-log with monotonic server revision + client ack/rebase completion** (incremental hardening of existing model).

Why this approach:

* Highest alignment with current system design and tests.
* Lowest migration risk with clear incremental rollout.
* Preserves optimistic UX while tightening concurrency correctness.

Primary changes:

1. Client must send `expectedRevision` on place/remove.
2. Client state should track authoritative `revision` alongside `lastOpSeq`.
3. Acks should include `newRevision` for deterministic client advancement.
4. Replace reconnect-as-resync-trigger with explicit snapshot request/resync event.
5. Define undo semantics for multi-client (recommended: per-author undo by default).

**Requirements:**

* Multiple clients on one canvas
* Server-authoritative consistency with optimistic UX
* Deterministic rebase and rollback behavior

**Preferred Approach:**

* Incrementally harden existing protocol (Option B) rather than introducing a new consistency model.

```text
Phase 1 (compatibility-safe)
  - Add revision to client sequenced state.
  - Send expectedRevision from client when available.
  - Return newRevision on successful ack.
  - Keep missing expectedRevision accepted on server.

Phase 2 (protocol hardening)
  - Server rejects missing expectedRevision for mutation events.
  - Add explicit snapshot_request/resync_required events.

Phase 3 (UX and semantics)
  - Author-aware undo and conflict-specific feedback.
  - Presence/pointer support or contract removal.
```

**Implementation Details:**

Target file touch points for implementation planning:

* apps/client/src/App.tsx
  * Include `expectedRevision` in mutation payloads.
  * Stop forcing reconnect for snapshot recovery; prefer explicit resync event.
  * Update undo behavior to per-author (or product-chosen semantics).
* apps/client/src/interaction/controller.ts
  * Extend `SequencedTilesState` to include `revision`.
  * Update snapshot and ack reconciliation helpers to advance revision safely.
* apps/client/src/network/useSocketConnection.ts
  * Support additional socket events (`resync_required`, potentially `snapshot_response`).
* apps/server/src/contracts.ts
  * Extend ack/snapshot contracts with `revision/newRevision`.
  * Add optional explicit resync events and mutation correlation fields.
* apps/server/src/index.ts
  * Enforce revision policy rollout and return new revision in acks.
* apps/server/src/index.integration.test.ts
  * Add real multi-client session tests for ack/broadcast ordering and reconnect.
* apps/client/src/interaction/controller.test.ts
  * Add revision progression and conflict-specific rollback tests.

```ts
// Suggested contract-direction example (illustrative).
type PlaceTileAck =
  | { accepted: true; tile: TileDto; opSeq: number; newRevision: number; idempotent?: boolean }
  | { accepted: false; reason: "OVERLAP" | "OUT_OF_BOUNDS" | "STALE_REVISION" | "NOT_FOUND"; message: string; revision?: number };
```

#### Considered Alternatives

1. A) Naive last-write-wins full snapshot broadcast
  * Pros: low initial implementation effort.
  * Cons: high risk of lost updates and poorer fit with operation-log persistence.
  * Decision: rejected.
2. B) Operation-log + monotonic revision + ack/rebase
  * Pros: aligned with current architecture, deterministic, testable, incremental.
  * Cons: requires completing client revision usage and additional integration tests.
  * Decision: selected.
3. C) CRDT/OT redesign
  * Pros: strong convergence properties in some domains.
  * Cons: very high migration and validation cost for geometry-constrained placement model.
  * Decision: rejected for near-term roadmap.

## Final Recommendation

Adopt Option B as the canonical multi-client session management strategy and complete the missing client-side protocol pieces first (`expectedRevision`, revision tracking, deterministic resync), then harden server enforcement in a phased rollout.

## Actionable Next Steps

* Immediate (high impact, low disruption):
  * Add `revision` to client sequenced state and include `expectedRevision` in outbound mutations.
  * Extend mutation acks with `newRevision` and wire it into client reconciliation.
* Near-term:
  * Introduce explicit `snapshot_request`/`resync_required` protocol to avoid reconnect side effects.
  * Add integration tests with two real socket clients against the same session.
* Product decision points:
  * Confirm per-author undo semantics.
  * Confirm same-clientId multi-tab behavior.
