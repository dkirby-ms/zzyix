---
title: Task Research - Collaboration UX Primitives
description: Research and implementation analysis for issue #15 collaboration UX primitives in zzyix.
author: GitHub Copilot
ms.date: 2026-07-21
ms.topic: reference
keywords:
  - collaboration
  - realtime
  - cursor-presence
  - selection-indicators
estimated_reading_time: 12
---

<!-- markdownlint-disable-file -->
## Task Research: Collaboration UX Primitives

Research for issue #15 in dkirby-ms/zzyix: Add foundational collaboration UI elements such as presence, cursors, and remote selection indicators.

## Task Implementation Requests

* Show active users in the current canvas session.
* Render remote cursor and selection indicators.
* Keep indicators responsive to join, leave, and reconnect events.
* Ensure visual behavior remains usable under moderate contention.

## Scope and Success Criteria

* Scope: Analyze current client/server architecture for session and realtime updates; identify current data contracts and UI extension points; recommend an implementation approach for presence list, remote cursor rendering, and remote selection cues.
* Assumptions:
  * Existing websocket/session plumbing can be extended without replacing transport.
  * Collaboration signals can be represented as ephemeral session state.
  * Moderate contention means multiple users emitting updates concurrently, not high-scale load testing.
* Success Criteria:
  * A clear architecture for presence, cursor, and selection data flow is documented.
  * API/schema deltas and UI integration points are identified with concrete file references.
  * At least two viable alternatives are evaluated with one selected approach and rationale.

## Outline

1. Baseline architecture and existing collaboration/session patterns.
2. Data contract and event model options for presence and transient pointer/selection state.
3. Client rendering options and performance behavior under contention.
4. Failure and churn handling for join/leave/reconnect.
5. Selected approach and implementation plan inputs.

## Potential Next Research

* Benchmark pointer update fanout under simulated peer counts.
  * Reasoning: Needed to set evidence-based throttle defaults for moderate contention.
  * Reference: apps/client/src/App.tsx, apps/server/src/index.ts
* Validate remote selection rendering strategy.
  * Reasoning: Determines whether Three.js overlay or DOM overlay yields better frame-time behavior.
  * Reference: apps/client/src/render/MosaicScene.tsx
* Define stale-state TTL and identity behavior for reconnect and multi-tab usage.
  * Reasoning: Prevents persistent ghost cursors and ambiguous collaborator identity.
  * Reference: apps/client/src/network/session.ts, apps/client/src/network/useSocketConnection.ts

## Research Executed

### File Analysis

* apps/server/src/contracts.ts
  * Collaboration protocol already includes pointer and presence primitives:
    * client event pointer_move at line 316
    * server events pointer_update, client_joined, client_left at lines 338, 340, 336
    * session_snapshot includes clients list at line 274
* apps/server/src/index.ts
  * Server emits collaboration events today:
    * snapshot and join emission at lines 762 and 764
    * pointer fanout from pointer_move at lines 943 and 954
    * leave fanout at line 995
* apps/client/src/network/useSocketConnection.ts
  * Socket auth includes session and client identity at line 31.
  * Client currently subscribes to session_snapshot, tile_placed, tile_removed, resync_required at lines 51 to 55.
  * Client does not subscribe to pointer_update, client_joined, client_left.
* apps/client/src/App.tsx
  * Snapshot application currently uses tiles and revision fields but does not consume snapshot clients at lines 146 to 151.
  * Pointer lifecycle hook points exist for outbound collaboration emission at lines 286 and 301.
  * Existing status area can host active-user presence UI at line 409.
* apps/client/src/render/MosaicScene.tsx
  * Pointer interaction plane and event hooks are centralized at lines 129 and 161, suitable for overlay integration.
* apps/server/src/db/schema.ts and apps/server/src/db/repository.ts
  * participants persistence and reconnect upsert behavior already support join/leave churn handling.

### Code Search Results

* query: pointer_update|client_joined|client_left
  * server contract and runtime matches in apps/server/src/contracts.ts and apps/server/src/index.ts
  * no client handler usage in apps/client/src/App.tsx
* query: payload.clients|clients
  * session snapshot clients field exists in server contract
  * no corresponding state usage in client snapshot handler
* query: pointer_move
  * contract and runtime support already present
  * no regular client emission path wired to network

### External Research

* No external documentation was required for architectural fit. Findings are codebase-derived and validated through direct file inspection.

### Project Conventions

* Standards referenced:
  * /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md
  * /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md
* Instructions followed:
  * Task Researcher mode requirements.
  * Prompt: task-research.prompt.md requirements.

## Key Discoveries

### Project Structure

* The collaboration transport and event taxonomy already exist on the server and in typed contracts.
* The primary implementation gap is client adoption and rendering state, not backend architecture.
* Current client architecture has clean boundaries:
  * network connection hook for event subscriptions
  * App-level session and pointer orchestration
  * MosaicScene rendering/interaction surface

### Implementation Patterns

* Canonical game state (tiles, revision, sequencing) is separated from ephemeral interaction signals.
* Reconnect handling uses snapshot and resync pathways already covered by integration tests.
* User attribution is already embedded in placedBy flow and can inform remote selection cues.

### Complete Examples

```ts
// Contract extension (additive) aligned with existing payload style.
export type SelectionUpdatePayload = {
  canvasId: string;
  clientId: string;
  tileId?: string;
  cursor?: Vec2;
  updatedAt: number;
};

export interface ClientToServerEvents {
  selection_update: (payload: SelectionUpdatePayload) => void;
}

export interface ServerToClientEvents {
  selection_update: (payload: SelectionUpdatePayload) => void;
}
```

### API and Schema Documentation

* Existing collaboration contract anchors:
  * apps/server/src/contracts.ts:316
  * apps/server/src/contracts.ts:338
  * apps/server/src/contracts.ts:340
* Existing runtime anchors:
  * apps/server/src/index.ts:943
  * apps/server/src/index.ts:954
  * apps/server/src/index.ts:995
* Existing client integration anchors:
  * apps/client/src/network/useSocketConnection.ts:51
  * apps/client/src/App.tsx:146
  * apps/client/src/App.tsx:286
  * apps/client/src/render/MosaicScene.tsx:161

### Configuration Examples

```ts
// Client-side remote state cache suggestion.
type RemoteCollaborator = {
  clientId: string;
  joinedAt?: string;
  pointer?: { x: number; y: number };
  selectionTileId?: string;
  lastSeenAt: number;
};

type RemoteCollaboratorMap = Record<string, RemoteCollaborator>;
```

## Technical Scenarios

### Presence, Cursor, and Selection Collaboration Signals

Issue #15 is best addressed by extending the existing ephemeral collaboration event model rather than refactoring authoritative snapshot semantics. Server-side protocol coverage is already strong for presence and cursor movement, while client consumption is the missing layer.

**Requirements:**

* Presence roster updates on join, leave, and reconnect.
* Near realtime remote cursor and selection updates.
* Stable behavior with concurrent updates from multiple participants.

**Preferred Approach:**

* Recommended: incremental adoption of existing presence/cursor events plus one additive selection_update event.

```text
apps/server/src/contracts.ts
apps/server/src/index.ts
apps/client/src/network/useSocketConnection.ts
apps/client/src/App.tsx
apps/client/src/render/MosaicScene.tsx
```

**Implementation Details:**

1. Presence adoption with existing events:
  * Initialize active collaborators from session_snapshot.clients.
  * Apply client_joined and client_left deltas for near realtime roster updates.
2. Cursor adoption with existing events:
  * Emit pointer_move from local pointer lifecycle with client-side throttling (target 20 to 30 Hz).
  * Consume pointer_update into lightweight remote cursor state keyed by clientId.
3. Selection addition:
  * Add selection_update to typed contracts and server fanout handler.
  * Emit selection updates when local selected or hovered tile changes materially.
  * Render remote selection cue as tile outline or halo in MosaicScene.
4. Churn hardening:
  * Evict stale remote pointer/selection entries by lastSeenAt TTL.
  * Merge reconnect snapshot presence before applying transient updates.
5. Testing:
  * Add client tests for presence and remote state reducers.
  * Extend server integration tests for selection_update fanout and reconnect behavior.

```text
// Event handling sketch in client network layer.
socket.on("pointer_update", onPointerUpdate);
socket.on("client_joined", onClientJoined);
socket.on("client_left", onClientLeft);
socket.on("selection_update", onSelectionUpdate);

// Emit sketch in App pointer and selection lifecycle.
socket.emit("pointer_move", { canvasId, position, emittedAt: Date.now() });
socket.emit("selection_update", { canvasId, clientId, tileId, updatedAt: Date.now() });
```

#### Considered Alternatives

* Alternative A: Incremental event adoption plus additive selection_update event.
  * Outcome: Selected.
  * Reasoning: Lowest disruption, aligns with existing transport, smallest backend delta.
* Alternative B: Make collaboration state authoritative within session snapshots.
  * Outcome: Rejected.
  * Reasoning: Higher server complexity and test surface, unnecessary for issue scope.
* Alternative C: Infer selection entirely from existing tile/pointer behavior without new event.
  * Outcome: Rejected.
  * Reasoning: Ambiguous user intent and weak UX reliability under contention.
