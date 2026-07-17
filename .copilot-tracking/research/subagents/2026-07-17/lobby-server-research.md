---
title: Lobby Server Research
description: Server architecture findings for lobby listing and join support in zzyix
author: Researcher Subagent
ms.date: 2026-07-17
ms.topic: reference
keywords:
  - server
  - lobby
  - websocket
  - session
  - postgres
estimated_reading_time: 7
---

## Research Scope

Questions investigated:

* Which server routes/contracts, websocket/session flows, and DB entities govern canvases/sessions.
* Where lobby metadata can be sourced: canvas name, connected user count, size, availability.
* Whether existing endpoints/events support list/join and what additions are still needed.
* What server-side alternatives exist, with trade-offs.
* What tests should be added or updated.

## Key Findings

### 1. Listing support exists server-side, but data integrity for canvas name is currently inconsistent

Evidence:

* Contract already defines lobby list DTOs via `CanvasSummary` and `ListSessionsResponse` in apps/server/src/contracts.ts:67-76 and apps/server/src/contracts.ts:155-157.
* Server route exists for listing sessions: `GET /sessions` in apps/server/src/index.ts:547-555.
* Route uses repository method `listCanvasSummaries` imported from DB module in apps/server/src/index.ts:22-34 and apps/server/src/index.ts:547-550.
* Repository summary model includes required lobby fields in apps/server/src/db/repository.ts:96-105.
* Summaries are computed in `listCanvasSummaries` using canvases + participant counts + tile counts in apps/server/src/db/repository.ts:368-393.

Critical inconsistency:

* Repository expects `canvas.name` and inserts `name` during session creation in apps/server/src/db/repository.ts:139 and apps/server/src/db/repository.ts:340.
* Current schema for `canvases` does not define a `name` column in apps/server/src/db/schema.ts:36-43.
* Existing migrations also do not add a `name` column (`0000` creates `canvases` with only id/created_at/updated_at; `0002` only adds `version`) in apps/server/migrations/0000_overjoyed_lila_cheney.sql:1-5 and apps/server/migrations/0002_flat_cable.sql:13.

Implication:

* Lobby name metadata is not reliably backed by current DB schema/migrations and may fail at runtime/build depending on migration state.

### 2. Join support exists via Socket.IO handshake and room join, not via explicit REST join endpoint

Evidence:

* Socket auth requires `sessionId` + `clientId` in middleware in apps/server/src/index.ts:604-623, matching contract `ConnectionAuth` in apps/server/src/contracts.ts:209-212.
* On connect, server joins Socket.IO room with `socket.join(sessionId)` and emits snapshot in apps/server/src/index.ts:645 and apps/server/src/index.ts:658.
* Presence join persisted through `markParticipantJoined` + replay snapshot load in apps/server/src/index.ts:646-650 and apps/server/src/index.ts:395-412.
* Join broadcast to peers uses `client_joined` in apps/server/src/index.ts:660 and contract in apps/server/src/contracts.ts:346.

Implication:

* Functional join path exists today, but only as a websocket connect flow. No dedicated REST join endpoint exists for preflight or availability decisions.

### 3. Contract and implementation are partially out of sync for REST session routes

Evidence:

* Contract comments describe `GET /sessions/:sessionId`, `POST /sessions/:sessionId/tiles`, `DELETE /sessions/:sessionId/tiles/:tileId` in apps/server/src/contracts.ts:86-89.
* In the current server, implemented REST routes are `GET /health`, `GET /sessions`, and `POST /sessions` in apps/server/src/index.ts:543-555 and apps/server/src/index.ts:558-573.
* No handlers for `app.get('/sessions/:sessionId')`, `app.post('/sessions/:sessionId/tiles')`, or `app.delete('/sessions/:sessionId/tiles/:tileId')` were found in apps/server/src/index.ts.
* Mutations are currently websocket-first via `place_tile` and `remove_tile` events in apps/server/src/index.ts:674-837 and apps/server/src/contracts.ts:324-333.

Implication:

* Client list/join can proceed with existing route + websocket join, but API docs/comments and generated expectations need alignment to avoid integration confusion.

### 4. Lobby metadata sourcing details

Evidence and derived source plan:

* Canvas name:
  * Intended source is `canvases.name` via `mapCanvasSummary` in apps/server/src/db/repository.ts:133-140.
  * Current schema lacks `canvases.name` in apps/server/src/db/schema.ts:36-43.
* Connected user count:
  * Derived from `participants` where `left_at IS NULL`, grouped by `canvas_id` in apps/server/src/db/repository.ts:373-376.
  * Presence lifecycle maintained by `markParticipantJoined` and `markParticipantLeft` in apps/server/src/db/repository.ts:395-420.
* Size:
  * Currently hardcoded summary dimensions `width: 10.4`, `height: 6.8` in apps/server/src/db/repository.ts:142-143.
  * These values align conceptually with placement bounds noted in contract comments (`x ∈ [-5.2, 5.2]`, `y ∈ [-3.4, 3.4]`) in apps/server/src/contracts.ts:108.
* Availability:
  * No persisted field or contract field explicitly represents availability.
  * `CanvasSummary` lacks availability/capacity properties in apps/server/src/contracts.ts:67-76.
  * Current implicit availability is effectively always joinable if client has a session ID, because join path accepts auth/session and initializes state on connect in apps/server/src/index.ts:604-623 and apps/server/src/index.ts:645-650.

## Data Model and Contract Implications

### Needed data model updates for robust lobby support

* Add and migrate `canvases.name` (required for current repository and contract expectations).
* Decide whether dimensions remain constant (hardcoded) or become persisted per-canvas fields.
* If availability must be explicit, add one of:
  * `maxParticipants` + derived `isJoinable`.
  * `status` enum (open, full, archived, locked).

### Needed contract updates

* If join gating is introduced, extend `CanvasSummary` with availability fields, for example:
  * `isJoinable: boolean`
  * `maxParticipants?: number`
  * `joinDeniedReason?: 'FULL' | 'LOCKED' | 'ARCHIVED'`
* Align REST route comments/types in apps/server/src/contracts.ts with actual implementation (or add missing REST handlers to match comments).

## Existing Support Assessment

### What already supports lobby list/join

* Listing: `GET /sessions` returns repository-backed canvas summaries in apps/server/src/index.ts:547-550.
* Join: websocket handshake auth + room join + snapshot + presence broadcast in apps/server/src/index.ts:604-660.

### What additions are still needed

* Resolve schema/migration gap for canvas name.
* Add explicit availability semantics (contract + DB + list derivation).
* Optionally add explicit join endpoint/preflight path if product requires deterministic join failure reasons before websocket connect.
* Reconcile contract docs/comments and server implementation for REST endpoints.

## Design Alternatives and Trade-offs

### Alternative A: REST list + Socket join with join preflight endpoint

Design:

* Keep `GET /sessions` as lobby source.
* Add `POST /sessions/:sessionId/join` (or `GET /sessions/:sessionId/joinability`) returning joinability and optional join token.
* Websocket connection remains authoritative for real-time state and broadcasts.

Pros:

* Clear UX: client can show immediate join failure reasons before opening socket.
* Keeps lobby list and join checks simple for web/mobile clients.
* Minimal disruption to existing socket mutation protocol.

Cons:

* Introduces another API surface to keep consistent with websocket auth path.
* Must avoid race between preflight success and websocket join (requires re-check at socket connect).

Best fit:

* Product needs explicit, explainable join-denial outcomes and stable REST integration points.

### Alternative B: Socket-first list and join orchestration

Design:

* Add server-to-client event for lobby updates (for example `lobby_snapshot` / `lobby_delta`).
* Client fetches/receives list through socket namespace and joins through a typed `join_session` request/ack event.
* REST list can remain as fallback but not primary path.

Pros:

* Single real-time channel for list freshness and join state transitions.
* Easier to keep lobby counts synchronized with active sockets.

Cons:

* Higher client complexity (socket lifecycle required for lobby browsing).
* Less cache/CDN friendly than REST list endpoint.
* Harder interoperability for non-websocket consumers.

Best fit:

* Real-time lobby churn is high and product benefits from push updates over pull refresh.

## Suggested Tests to Add or Update

### High-priority tests

* Add route-level test for `GET /sessions` returning `ListSessionsResponse` shape and sorting by `updatedAt` (apps/server/src/index.ts:547-555, apps/server/src/contracts.ts:155-157).
* Add repository test for `listCanvasSummaries` to validate:
  * active participant counting (`leftAt IS NULL`) from apps/server/src/db/repository.ts:373-376.
  * tile count aggregation from apps/server/src/db/repository.ts:378-380.
  * mapping of width/height/name in apps/server/src/db/repository.ts:133-146.
* Add migration/schema consistency test to catch use of non-existent `canvases.name` (apps/server/src/db/repository.ts:139 and apps/server/src/db/schema.ts:36-43).

### Join/availability behavior tests

* Add websocket integration test asserting join path emits `session_snapshot` and `client_joined` on successful connect (apps/server/src/index.ts:658-660).
* If availability is introduced, add denial-path tests for full/locked sessions on both preflight (if added) and websocket connect path.
* Add contract test to ensure `CanvasSummary` and server JSON payload remain aligned after availability field changes.

### Contract alignment tests

* Add tests (or lint checks) that fail when route comments/contracts drift from actual `express` handlers, given current mismatch between comments and implementation in apps/server/src/contracts.ts:86-89 vs apps/server/src/index.ts:543-573.

## Open Questions Requiring Product or Platform Decisions

* Should lobby availability be capacity-based, status-based, or both?
* Must clients know joinability before websocket connection, or is socket-time rejection acceptable?
* Are canvas dimensions globally fixed (10.4 x 6.8) or expected to vary per session in the future?

## Executive Summary

The server already has baseline lobby listing (`GET /sessions`) and websocket join behavior. The largest immediate risk is data model inconsistency around canvas names: repository and contract assume name metadata, but current schema/migrations shown here do not define that column. After fixing schema consistency, the next architectural choice is whether to keep join checks implicit in socket connect (simpler) or introduce explicit joinability semantics with preflight (clearer UX, slightly more complexity).
