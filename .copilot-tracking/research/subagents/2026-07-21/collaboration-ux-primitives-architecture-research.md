---
title: Collaboration UX Primitives Architecture Research
description: Deep research findings for issue #15 active-user presence, remote cursor indicators, and remote selection indicators in zzyix.
ms.date: 2026-07-21
ms.topic: reference
---

<!-- markdownlint-disable-file -->

## Research Scope

* Issue: #15 Add collaboration UX primitives
* Repository: /home/saitcho/zzyix
* Goals:
  * Determine implementation options for active-user presence
  * Determine implementation options for remote cursor indicators
  * Determine implementation options for remote selection indicators
  * Focus on realtime contracts, data flow boundaries, and churn handling

## Research Questions

* What Socket.IO events and message envelopes already exist?
* How are session identity and participant identity established and persisted?
* Where can remote cursor and selection state be injected with minimal disruption?
* What protocol extensions fit existing architecture with lowest churn?
* What implementation alternatives exist, and what are the tradeoffs?

## Progress Log

* Initialized research document and scope.
* Completed codebase scan for realtime contracts, session identity, and client rendering boundaries.
* Completed line-level evidence capture for join, leave, reconnect, pointer transport, and current client consumption gaps.

## Findings

## Realtime Protocol and Event Inventory

Current typed Socket.IO protocol already includes presence and cursor events:

* Client to server events include pointer_move in addition to place_tile, remove_tile, request_snapshot.
  * apps/server/src/contracts.ts:316
  * apps/server/src/contracts.ts:324
* Server to client events include session_snapshot, tile_placed, tile_removed, pointer_update, client_joined, client_left, resync_required.
  * apps/server/src/contracts.ts:328
  * apps/server/src/contracts.ts:336
  * apps/server/src/contracts.ts:338
  * apps/server/src/contracts.ts:340
* SessionSnapshotPayload already carries clients[] as ClientPresence[] alongside session state and revisioning.
  * apps/server/src/contracts.ts:272
  * apps/server/src/contracts.ts:274

Server runtime actually emits client presence and cursor events:

* On connect: joins room, emits session_snapshot to connecting socket, and broadcasts client_joined to peers.
  * apps/server/src/index.ts:749
  * apps/server/src/index.ts:762
  * apps/server/src/index.ts:764
* On pointer_move: broadcasts pointer_update to peers only.
  * apps/server/src/index.ts:943
  * apps/server/src/index.ts:954
* On disconnect: persists leave and broadcasts client_left.
  * apps/server/src/index.ts:987
  * apps/server/src/index.ts:994
  * apps/server/src/index.ts:995

## Session and User Identity Handling

Identity and session flow is already explicit and stable:

* Client persists clientId in localStorage and sessionId in sessionStorage.
  * apps/client/src/network/session.ts:4
  * apps/client/src/network/session.ts:5
  * apps/client/src/network/session.ts:30
  * apps/client/src/network/session.ts:88
* Socket connection auth payload uses { sessionId, clientId }.
  * apps/client/src/network/useSocketConnection.ts:31
* Server enforces presence of both auth fields and stores them in socket.data.
  * apps/server/src/index.ts:701
  * apps/server/src/index.ts:711
  * apps/server/src/index.ts:721
  * apps/server/src/index.ts:722

Presence persistence is backed by database participants:

* participants table has composite primary key (canvasId, clientId), joinedAt, leftAt.
  * apps/server/src/db/schema.ts:49
  * apps/server/src/db/schema.ts:56
  * apps/server/src/db/schema.ts:57
  * apps/server/src/db/schema.ts:60
* Reconnect upserts participant record and clears leftAt, making churn robust.
  * apps/server/src/db/repository.ts:347
  * apps/server/src/db/repository.ts:357
  * apps/server/src/db/repository.ts:360

## Current Client Consumption Gap

The client subscribes only to tile and resync events, not to collaboration presence events:

* Subscribed handlers are session_snapshot, tile_placed, tile_removed, resync_required.
  * apps/client/src/network/useSocketConnection.ts:51
  * apps/client/src/network/useSocketConnection.ts:52
  * apps/client/src/network/useSocketConnection.ts:53
  * apps/client/src/network/useSocketConnection.ts:55
* No client consumption of pointer_update, client_joined, client_left was found.
  * apps/client/src/App.tsx (no matches for pointer_update/client_joined/client_left)

Snapshot clients[] is currently ignored in App state application:

* onSnapshot applies only tiles, lastOpSeq, revision.
  * apps/client/src/App.tsx:146
  * apps/client/src/App.tsx:149
* No use of payload.clients in App.
  * apps/client/src/App.tsx (no matches for payload.clients)

## Rendering and UI Boundaries for Injection

Client boundaries are favorable for adding remote overlays with low disruption:

* MosaicScene already centralizes pointer plane interactions via onPointerMove/onPointerDown/onPointerUp.
  * apps/client/src/render/MosaicScene.tsx:129
  * apps/client/src/render/MosaicScene.tsx:161
  * apps/client/src/render/MosaicScene.tsx:176
  * apps/client/src/render/MosaicScene.tsx:193
* App already owns pointer updates and place attempts, making it a good host for outbound pointer and selection events.
  * apps/client/src/App.tsx:286
  * apps/client/src/App.tsx:301
* Existing status strip and debug overlay in App provide immediate UI insertion points for active-user presence counts and per-user badges.
  * apps/client/src/App.tsx:409
  * apps/client/src/App.tsx:441

Remote selection indicator anchor points:

* Tile entities already carry placedBy on both server contract and client tile type.
  * apps/server/src/contracts.ts:55
  * apps/client/src/domain/placementSolver.ts:23
* Undo logic already filters by placedBy, proving user attribution is live in state.
  * apps/client/src/App.tsx:245
  * apps/client/src/App.tsx:333
  * apps/client/src/interaction/controller.test.ts:380

## Churn Handling and Reconnect Behavior

Churn and reconnection groundwork already exists and is test-covered:

* Client transport reconnection configured with backoff and capped attempts.
  * apps/client/src/network/useSocketConnection.ts:33
  * apps/client/src/network/useSocketConnection.ts:34
  * apps/client/src/network/useSocketConnection.ts:36
* Server exposes request_snapshot and resync_required flow for sequence/revision divergence.
  * apps/server/src/index.ts:960
  * apps/server/src/index.ts:975
* App reacts to requiresSnapshot and resync_required by requesting snapshot.
  * apps/client/src/App.tsx:164
  * apps/client/src/App.tsx:180
  * apps/client/src/App.tsx:188
  * apps/client/src/App.tsx:190
* Integration tests explicitly cover reconnect snapshot semantics and presence lifecycle calls.
  * apps/server/src/index.integration.test.ts:55
  * apps/server/src/index.integration.test.ts:93
  * apps/server/src/index.integration.test.ts:123

## Protocol Extension Options with Minimal Disruption

## Option A: Incremental event adoption plus selection event

Summary:

* Reuse existing pointer_move and pointer_update events as-is for remote cursor indicators.
* Reuse existing client_joined, client_left, and snapshot clients[] for active presence list.
* Add new selection_update event pair for remote selection indicators.

Likely contract changes:

* New payload type:
  * SelectionUpdatePayload = { clientId: string; tileId?: string; transform?: Transform2D; updatedAt: number }
* New events:
  * ClientToServerEvents.selection_update(payload)
  * ServerToClientEvents.selection_update(payload)

Client changes:

* Extend useSocketConnection to subscribe to pointer_update/client_joined/client_left/selection_update.
  * apps/client/src/network/useSocketConnection.ts:51
* In App, add remoteCollab state keyed by clientId with { joinedAt, pointer?, selection?, lastSeenAt }.
* Emit pointer_move from updatePointer with throttling.
  * apps/client/src/App.tsx:286
* Emit selection_update when user hovers nearest tile or starts drag-select.
* Render remote cursor glyphs and optional remote selection outlines in MosaicScene.

Server changes:

* Keep pointer behavior stateless broadcast as implemented.
* Add selection_update broadcast handler similar to pointer_move.
* Optional TTL cleanup task for stale ephemeral states if server holds them.

Pros:

* Lowest disruption to current architecture.
* Preserves existing sequencing model for canonical tile mutations.
* Uses already-defined collaboration primitives that are currently unused.

Cons:

* Presence state split across snapshot clients[] plus ephemeral updates.
* Selection is eventually consistent and may temporarily show stale target after reconnect until next update.

Complexity estimate:

* Client: medium
* Server: low to medium
* Contract/test updates: medium

## Option B: Authoritative collaboration state in snapshot

Summary:

* Extend SessionSnapshotPayload with a collaboration map for pointer and selection, maintained server-side.
* On reconnect, clients receive full remote cursor and selection state immediately.

Likely contract changes:

* SessionSnapshotPayload.collaboration: Record<clientId, { pointer?: Vec2; selection?: SelectionRef; updatedAt: number }>
* Keep pointer_move and selection_update as inbound events to mutate authoritative collaboration state.

Server changes:

* Maintain per-session ephemeral collaboration map in memory and optionally persist short-lived snapshots.
* Merge map into session_snapshot response.
* Clear map entries on client_left.

Client changes:

* Apply collaboration state from snapshot and merge live updates.

Pros:

* Strong reconnect consistency for collaboration overlays.
* Single source of truth for remote UI primitives.

Cons:

* Increased server memory and synchronization burden.
* Higher implementation scope and test surface.
* Potential mismatch with current design where only tile/session state is authoritative.

Complexity estimate:

* Client: medium
* Server: medium to high
* Contract/test updates: high

## Option C: Client-only inferred presence from events

Summary:

* No protocol additions.
* Build active presence from session_snapshot.clients, client_joined, client_left, and infer cursor recency from pointer_update only.
* For selection indicator, infer from latest tile_placed removedBy placedBy behavior or local heuristics.

Pros:

* Minimal protocol churn.

Cons:

* Remote selection is weak or misleading without explicit event.
* Inference logic becomes brittle and ambiguous.

Complexity estimate:

* Client: medium
* Server: very low
* Product quality risk: high

## Recommended Approach

Recommend Option A.

Rationale:

* Existing protocol already has most required primitives but the client does not consume them yet.
* Existing churn model already handles join, leave, reconnect, and snapshot resync safely.
* Adding a single explicit selection_update event closes the largest capability gap without overhauling authoritative state boundaries.
* Keeps tile mutation sequencing and revision logic unchanged.

Expected implementation complexity:

* End-to-end: medium
* Main work: client state/store wiring and scene overlay rendering
* Secondary work: contract extension and server event fanout for selection_update

## Risks and Performance Considerations

Functional risks:

* Stale remote cursors or selections after abrupt disconnect if no TTL expiry exists on client cache.
* UI contention when many peers update cursors at high frequency.
* Identity collisions if localStorage client ID is manually duplicated across tabs/devices.

Performance and contention:

* pointer_move can be very high volume. Add client-side throttle (for example 20 to 30 Hz) and server-side fanout safeguards.
* Render cost scales with remote peers. Cursor and selection overlays should be lightweight, pooled, and culled outside bounds.
* Network burst on reconnect can trigger rapid join plus snapshot plus pointer updates. Merge updates by timestamp and debounce UI redraw.

Correctness considerations:

* Do not include collaboration events in opSeq revision stream. Keep them ephemeral to avoid causing resync_required.
* Keep stale-entry eviction deterministic using lastSeenAt TTL on client state.

## Concrete Injection Plan

Phase 1, no contract changes:

* Subscribe in useSocketConnection to pointer_update/client_joined/client_left.
* In App, track remote users and pointer positions.
* Show active user count and simple remote cursor markers.

Phase 2, additive contract extension:

* Add selection_update event in contracts and server handler.
* Emit selection_update from App when hovered/target tile changes.
* Render remote selection indicator as tile outline or halo in MosaicScene.

Phase 3, churn hardening:

* Add TTL eviction for remote pointer and selection cache.
* Add tests for reconnect state recovery and stale overlay cleanup.

## Recommended Next Research

* Validate preferred visualization for remote selection in three.js layer versus DOM overlay and measure impact on frame time.
* Benchmark pointer update rates under 5, 20, 50 simulated peers to set throttle defaults.
* Determine whether per-tab identity should be distinct from per-browser identity for same user UX.
* Confirm whether collaboration events should be ignored while in lobby mode only or globally.

## Clarifying Questions

No blocking clarifying questions found for architecture-level implementation planning.
