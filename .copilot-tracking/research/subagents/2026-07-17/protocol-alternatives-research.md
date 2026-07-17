---
title: Protocol alternatives research
description: Protocol-level alternatives for multi-client canvas collaboration based on current zzyix architecture
author: Researcher Subagent
ms.date: 2026-07-17
ms.topic: reference
keywords:
  - collaboration
  - protocol
  - op-log
  - revision
  - socket.io
estimated_reading_time: 9
---

## Scope and questions

Research-only analysis for protocol-level alternatives for multi-client canvas collaboration in the current zzyix architecture.

Questions:

* What is the current protocol behavior and consistency model in code and tests?
* How do these alternatives compare?
  * A) Naive last-write-wins snapshot broadcast
  * B) Operation-log with monotonic server revision + client ack/rebase
  * C) CRDT or OT-style approach
* For each option, what are complexity, correctness risks, migration effort, and fit with existing files?
* What specific protocol changes are needed in contracts and events for the recommended path?

## Current architecture baseline

### Protocol and event model

* Bidirectional protocol already includes per-operation sequencing and revision-aware acknowledgements.
  * Place and remove payload/ack include expectedRevision, opSeq, and idempotent support.
  * Evidence: apps/server/src/contracts.ts:226, apps/server/src/contracts.ts:236, apps/server/src/contracts.ts:247, apps/server/src/contracts.ts:256.
* Session bootstrap and reconciliation are snapshot plus incremental event stream.
  * session_snapshot carries lastOpSeq; tile_placed and tile_removed carry opSeq.
  * Evidence: apps/server/src/contracts.ts:264, apps/server/src/contracts.ts:270, apps/server/src/contracts.ts:276, apps/server/src/contracts.ts:311.

### Server conflict and ordering behavior

* Server validates expectedRevision preconditions and rejects stale or out-of-order requests before mutation.
  * Evidence: apps/server/src/index.ts:673, apps/server/src/index.ts:683, apps/server/src/index.ts:764, apps/server/src/index.ts:770.
* Server emits tile events only for newly applied mutations, not idempotent replays.
  * Evidence: apps/server/src/index.ts:731, apps/server/src/index.ts:798.
* Persistence layer enforces per-session transactional ordering with advisory locks and monotonic opSeq.
  * Evidence: apps/server/src/db/repository.ts:543, apps/server/src/db/repository.ts:559, apps/server/src/db/repository.ts:611, apps/server/src/db/repository.ts:751.
* Persistence layer includes idempotency-key replay and request hash mismatch protection.
  * Evidence: apps/server/src/db/repository.ts:429, apps/server/src/db/repository.ts:441, apps/server/src/db/repository.ts:455, apps/server/src/db/repository.ts:649, apps/server/src/db/repository.ts:661, apps/server/src/db/repository.ts:675.

### Client reconciliation behavior

* Client maintains lastOpSeq and detects gaps; gaps trigger full snapshot recovery.
  * Evidence: apps/client/src/interaction/controller.ts:25, apps/client/src/interaction/controller.ts:106, apps/client/src/interaction/controller.ts:114, apps/client/src/interaction/controller.ts:128, apps/client/src/interaction/controller.ts:136.
* Client integration triggers reconnect-based snapshot request on sequencing gap.
  * Evidence: apps/client/src/App.tsx:76, apps/client/src/App.tsx:95, apps/client/src/App.tsx:110.
* Client currently emits place_tile and remove_tile without expectedRevision.
  * Evidence: apps/client/src/App.tsx:238, apps/client/src/App.tsx:246, apps/client/src/App.tsx:264.

### Test-grounded behavior

* Server tests explicitly assert deterministic first-write-wins for conflicting placements.
  * Evidence: apps/server/src/index.concurrency.test.ts:6, apps/server/src/index.concurrency.test.ts:40, apps/server/src/index.concurrency.test.ts:67.
* Client tests assert duplicate suppression and gap-to-snapshot fallback semantics.
  * Evidence: apps/client/src/interaction/controller.test.ts:100, apps/client/src/interaction/controller.test.ts:117, apps/client/src/interaction/controller.test.ts:130, apps/client/src/interaction/controller.test.ts:144.

## Alternative A: Naive last-write-wins snapshot broadcast

### Definition in this context

Clients send whole canvas snapshots or whole tile arrays. Server accepts the latest write and broadcasts full snapshot state to all peers.

### Complexity

* Implementation complexity: Low.
* Operational complexity: Medium to high at scale due to high payload churn and frequent full-state fanout.

### Correctness risks

* High risk of silent lost updates when concurrent writes race and overwrite unrelated edits.
* Harder to preserve per-tile causality and deterministic undo semantics already based on operation ordering.
* Weak replay diagnostics compared with opSeq and idempotency audit trail.

### Migration effort

* Medium code change in protocol handlers and client store logic.
* High behavioral regression risk because existing tests and logic assume op-level sequencing.
  * Would invalidate assumptions in apps/client/src/interaction/controller.ts:106 and apps/server/src/index.concurrency.test.ts:40.

### Fit with existing files

* Poor fit.
* Conflicts with existing event contracts and persistence architecture built around operation log, opSeq, and revision.
  * Evidence anchor: apps/server/src/contracts.ts:264 and apps/server/src/db/repository.ts:559.

## Alternative B: Operation-log with monotonic server revision plus client ack and rebase

### Definition in this context

Keep server-authoritative operation log. Client sends mutations with expectedRevision. Server atomically validates expectedRevision, applies mutation, increments revision and opSeq, returns ack, and broadcasts ordered events. Client rebases optimistic state when ack or broadcasts arrive; on gap, request snapshot.

### Complexity

* Implementation complexity: Medium.
* Most primitives already exist in contracts, handlers, and persistence.

### Correctness risks

* Moderate risk centered on client usage gaps, not core design.
* Primary current risk is that client does not populate expectedRevision, reducing stale-write protection to best-effort event sequencing only.
  * Evidence: apps/client/src/App.tsx:238 and apps/server/src/index.ts:673.
* Additional risk is reconnect-based snapshot fetch cost under packet loss bursts.

### Migration effort

* Low to medium incremental effort.
* Mostly client integration and small protocol refinements.
* Existing tests can be extended rather than replaced.

### Fit with existing files

* Strong fit.
* Aligns directly with current contracts, db operation_log, idempotency behavior, and sequenced client reconciler.
  * Evidence: apps/server/src/contracts.ts:236, apps/server/src/index.ts:710, apps/server/src/db/repository.ts:543, apps/client/src/interaction/controller.ts:106.

## Alternative C: CRDT or OT-style approach

### Definition in this context

Represent canvas state as commutative operations (CRDT) or transform concurrent operations (OT) so merges converge without central first-writer arbitration.

### Complexity

* Implementation complexity: High to very high.
* Requires redesign of tile constraints logic because placement validity is geometry-constrained and currently server-validated against authoritative settled tiles.

### Correctness risks

* High risk of semantic mismatch.
* CRDT eventual convergence does not naturally encode hard geometric rejection constraints such as overlap and boundary validity without custom conflict policies.
* OT for 2D geometry with collision constraints is specialized and difficult to validate.

### Migration effort

* High.
* Requires substantial protocol, persistence, and domain-model rework, plus new test strategy.

### Fit with existing files

* Low fit for current product scope.
* Current server domain validation pipeline and first-write-wins semantics would be largely replaced.
  * Evidence: apps/server/src/index.ts:693 and apps/server/src/index.concurrency.test.ts:40.

## Comparative summary

| Option | Complexity | Correctness risk | Migration effort | Fit to current architecture |
| --- | --- | --- | --- | --- |
| A) Naive LWW snapshot | Low code, higher runtime cost | High lost-update risk | Medium | Poor |
| B) Op-log + revision + ack/rebase | Medium (incremental) | Low to moderate | Low to medium | Strong |
| C) CRDT or OT | High to very high | High domain-policy complexity | High | Low |

## Recommended option

Option B: operation-log with monotonic server revision plus client ack and rebase.

Rationale:

* It is already the dominant architecture pattern in the codebase.
  * Contract-level types, server checks, and db persistence all support this model today.
* It preserves deterministic behavior required by current conflict and sequencing tests.
* It minimizes migration risk while materially improving correctness by actually using expectedRevision from the client.

## Protocol changes needed for the recommended path

Changes below are scoped to contracts and event handling behavior for Option B hardening.

### Contract changes

1. Strengthen mutation payload correlation.

* Add a clientMutationId to PlaceTilePayload and RemoveTilePayload for explicit ack correlation across retries and reconnects.
* Keep expectedRevision optional short-term for compatibility, then plan to make it required once all clients ship.
* File impact: apps/server/src/contracts.ts.

2. Add revision to success acks and snapshot.

* Extend PlaceTileAck success and RemoveTileAck success with newRevision.
* Extend SessionSnapshotPayload with revision.
* This allows client to maintain both lastOpSeq and authoritative revision without an extra fetch.
* File impact: apps/server/src/contracts.ts.

3. Optional explicit resync event.

* Add server_to_client event resync_required with reason codes such as OPSEQ_GAP and REVISION_MISMATCH.
* Reduces reconnect side effects as a snapshot trigger mechanism.
* File impact: apps/server/src/contracts.ts.

### Server behavior changes

1. Enforce expectedRevision usage policy in socket handlers.

* Phase 1: If missing expectedRevision, accept but include warning telemetry.
* Phase 2: Reject missing expectedRevision with explicit reason, once client rollout is complete.
* File impact: apps/server/src/index.ts.

2. Return newRevision in mutation ack paths.

* Populate from persistTilePlacement and persistTileRemoval result revision values.
* File impact: apps/server/src/index.ts and apps/server/src/db/repository.ts.

3. Keep idempotent replay behavior unchanged.

* Preserve no-rebroadcast rule for idempotent acks.
* Existing behavior is correct and should remain.
* Evidence: apps/server/src/index.ts:731 and apps/server/src/index.ts:798.

### Client behavior changes

1. Send expectedRevision on every place and remove mutation.

* Use local revision updated from snapshot and successful acks.
* File impact: apps/client/src/App.tsx.

2. Track revision in sequenced client state.

* Extend SequencedTilesState with revision and update in applySequencedSnapshot plus ack reconciliation.
* File impact: apps/client/src/interaction/controller.ts.

3. Prefer explicit snapshot request event over reconnect side effect.

* If resync_required or gap detected, request authoritative snapshot via event rather than disconnect/connect.
* File impact: apps/client/src/App.tsx and apps/client/src/network/useSocketConnection.ts.

## Unresolved questions

* Should expectedRevision become required immediately, or use a two-phase rollout to avoid breaking older clients?
* Is cross-tab editing by the same clientId supported, and if so should clientMutationId include a tab/session suffix to avoid idempotency collisions?
* What is the acceptable maximum snapshot frequency under gap conditions before introducing an explicit snapshot_request event?
* Is there a product requirement for offline mutation queue replay beyond current reconnect semantics?

## Recommended next research

* Validate whether any non-browser clients exist that consume the current contracts before making expectedRevision mandatory.
* Model network-loss scenarios to estimate reconnect-based snapshot cost versus explicit snapshot_request event.
* Define and test revision update invariants in client state transitions, especially ack-before-broadcast and broadcast-before-ack races.
* Add protocol conformance tests that assert revision and opSeq monotonicity together across retry paths.
