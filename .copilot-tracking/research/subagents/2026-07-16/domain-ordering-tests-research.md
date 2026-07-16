---
title: Domain Ordering and Concurrency Test Research
description: Focused second-pass research on deterministic ordering and concurrency testing for authoritative server state.
ms.date: 2026-07-16
ms.topic: reference
---

## Status

Complete with gaps noted.

## Research Scope

1. Determine actual ordering guarantees in server runtime and related infrastructure.
2. Identify where to add server tests for concurrent `place_tile`/`remove_tile`.
3. Propose deterministic tie-break strategy consistent with contracts.
4. Provide minimal test matrix mapped to acceptance criteria.

## 1) Verified Ordering Guarantees

### Single-process message ordering

* The server runs as a single Node.js process with one Socket.IO `Server` attached to one HTTP server instance in `apps/server/src/index.ts:20-41` and startup at `apps/server/src/index.ts:151-153`.
* `place_tile` and `remove_tile` handlers are currently synchronous (no `await`, no async callback chaining) in `apps/server/src/index.ts:78-108`.
* Result: callback execution order is effectively event-loop dispatch order inside one process. There is no explicit operation queue, transaction log, or sequence number in runtime code.

### Per-socket sequencing

* Runtime code defines no per-socket sequence field, nonce, or monotonic counter in `SocketData` (`apps/server/src/contracts.ts:198-202`) and no payload sequence in `PlaceTilePayload`/`RemoveTilePayload` (`apps/server/src/contracts.ts:208-221`).
* Current implementation therefore relies on transport/library ordering behavior and callback dispatch order, not an app-level per-socket ordering protocol.

### Global sequencing

* Contract text requires deterministic conflict resolution based on order received and current authoritative state, first-write-wins (`apps/server/src/contracts.ts:315-320`).
* Runtime does not yet implement authoritative session state mutation for place/remove (TODOs + placeholders in `apps/server/src/index.ts:81-83`, `apps/server/src/index.ts:100-101`, `apps/server/src/index.ts:84-107`).
* Multi-replica ordering is explicitly deferred in ADR; sticky sessions are initial strategy and cross-replica sync is out-of-scope (`docs/decisions/2026-07-15-deployment-architecture-v01.md:92-95`, `docs/decisions/2026-07-15-deployment-architecture-v01.md:143`).
* `InterServerEvents` is reserved for Redis adapter but unused (`apps/server/src/contracts.ts:288-289`).

## 2) Where to Add Concurrency Tests and Existing Harness

### Existing harness/tools

* Server package already uses Vitest scripts and coverage: `apps/server/package.json:11-12`.
* Vitest dependency exists: `apps/server/package.json:21`, `apps/server/package.json:26`.
* TypeScript config includes `vitest/globals`: `apps/server/tsconfig.json:21`.
* No server test files currently exist under `apps/server/src` (file inventory currently only `index.ts` and `contracts.ts`).

### Recommended test locations

* Add socket/integration ordering tests at `apps/server/src/index.concurrency.test.ts`.
* Add deterministic tie-break unit tests for reducer/domain logic at `apps/server/src/domain/ordering.test.ts` once `apps/server/src/domain/` exists (architecture already expects this location: `apps/server/README.md:38`).

### Harness gap for socket integration tests

* `socket.io-client` is referenced in contract usage examples (`apps/server/src/contracts.ts:20`) but is not listed in `apps/server/package.json` devDependencies.
* For realistic concurrent event tests, add `socket.io-client` as a dev dependency in server package.

## 3) Deterministic Tie-break Strategy (Contract-consistent)

Proposed strategy aligns with contract text "order received" + "first-write-wins" (`apps/server/src/contracts.ts:317-320`).

### Strategy

* Maintain per-session monotonic `opSeq` in authoritative server state.
* On each incoming mutating operation (`place_tile`, `remove_tile`), atomically assign `opSeq = ++session.lastOpSeq` at dequeue time.
* Apply operation against current `Session.tiles` (`apps/server/src/contracts.ts:59-64`) in `opSeq` order.
* Conflict rule:
  * `place_tile` vs overlapping existing tile: earlier `opSeq` wins, later op gets `{ placed: null, rejected: true, reason: "PLACEMENT_REJECTED" }` (shape already supported by `PlaceTileAck`: `apps/server/src/contracts.ts:215-217`).
  * `remove_tile` for missing/already-removed tile: `{ removed: false }` (`apps/server/src/contracts.ts:223-225`), optionally mapped to `TILE_NOT_FOUND` in REST layer (`apps/server/src/contracts.ts:119-121`).
  * `place_tile`/`remove_tile` racing on same tile ID: whichever op has lower `opSeq` is authoritative.

### Why this is minimal and compatible

* No contract shape changes required.
* Preserves current ack contracts and formal agreement semantics.
* Determinism becomes testable by asserting `opSeq`-ordered outcomes.

## 4) Minimal Test Matrix (Acceptance Criteria Mapped)

### Acceptance criteria

* AC1: Deterministic ordering for concurrent mutating operations in single-process server.
* AC2: Conflicting concurrent placements resolve as first-write-wins.
* AC3: Concurrent place/remove on same tile converges to one authoritative result.
* AC4: Acks and broadcasts are consistent with authoritative state.

### Tests

1. `server_concurrency_place_tile_conflict_first_write_wins`
* Covers: AC1, AC2, AC4
* Setup: two clients in same session emit colliding `place_tile` concurrently.
* Expected:
  * Exactly one ack with `rejected:false` and one ack with `rejected:true`.
  * Final authoritative session has exactly one of the colliding tiles.
  * Exactly one `tile_placed` broadcast for the accepted tile.

2. `server_concurrency_place_tile_non_conflict_both_commit`
* Covers: AC1, AC4
* Setup: two clients emit non-overlapping `place_tile` concurrently.
* Expected:
  * Both acks `rejected:false`.
  * Authoritative session ends with both tiles.
  * Two `tile_placed` broadcasts; order matches server apply order.

3. `server_concurrency_remove_tile_vs_remove_tile_idempotent`
* Covers: AC1, AC3, AC4
* Setup: start with one tile; two clients concurrently `remove_tile` same `tileId`.
* Expected:
  * One ack `{ removed:true }`, one ack `{ removed:false }`.
  * Final authoritative session has tile absent.
  * At most one `tile_removed` broadcast.

4. `server_concurrency_place_tile_vs_remove_tile_same_tile_seq_ordered`
* Covers: AC1, AC3, AC4
* Setup: race `place_tile` and `remove_tile` targeting same tile identity/state transition boundary (using deterministic server sequencing in test harness).
* Expected:
  * Lower `opSeq` operation determines final state.
  * Ack/broadcast stream is internally consistent with resulting authoritative `Session.tiles`.

## Gaps and Blockers

* Runtime authoritative state is not yet implemented for place/remove in `apps/server/src/index.ts:81-83` and `apps/server/src/index.ts:100-101`; concurrency tests will require introducing session state and mutation logic first.
* No existing `apps/server/src/domain/` implementation despite architecture intent (`apps/server/README.md:38`).
* No explicit app-level sequence fields currently exist in contract payloads or `SocketData` (`apps/server/src/contracts.ts:198-202`, `apps/server/src/contracts.ts:208-221`).
* Multi-replica ordering remains out of scope by ADR; this matrix intentionally targets single-process determinism only.
