---
title: Server Session Authority Research
description: Research on server-side session authority and multi-client handling in apps/server
author: GitHub Copilot Researcher Subagent
ms.date: 2026-07-17
ms.topic: reference
keywords:
  - websocket
  - session authority
  - concurrency
  - snapshots
  - idempotency
estimated_reading_time: 10
---

## Research Scope

1. Session creation and join semantics and identifiers.
2. Canonical state ownership and persistence boundaries.
3. WebSocket event routing and broadcast behavior.
4. Operation sequencing, versioning, and conflict handling.
5. Reconnection and resync behavior.
6. Data model and schema constraints for sessions and snapshots.
7. Existing tests and coverage gaps for concurrent multi-client behavior.

## Findings

### Session Creation and Join Semantics and Identifiers

* Session IDs are server-generated UUIDs at `POST /sessions`, then both memory and database initialization are performed before response: apps/server/src/index.ts:542, apps/server/src/index.ts:544, apps/server/src/index.ts:545, apps/server/src/index.ts:548.
* Socket auth requires both `sessionId` and `clientId` in handshake auth; missing either rejects the connection in middleware: apps/server/src/index.ts:588, apps/server/src/index.ts:598, apps/server/src/index.ts:605, apps/server/src/index.ts:606.
* On connect, server joins the socket to a room keyed by `sessionId`, persists participant join, emits `session_snapshot` to the connecting socket, then emits `client_joined` to peers: apps/server/src/index.ts:629, apps/server/src/index.ts:630, apps/server/src/index.ts:638, apps/server/src/index.ts:640.
* Presence is persisted by `(canvasId, clientId)` upsert semantics, so reconnecting with same `clientId` in same session updates a single presence row instead of creating duplicates: apps/server/src/db/repository.ts:339, apps/server/src/db/repository.ts:349, apps/server/src/db/schema.ts:49, apps/server/src/db/schema.ts:60.

### Canonical State Ownership and Persistence Boundaries

* Runtime includes an in-memory `sessions` map with cleanup rules, but mutation authority for live tile operations is database-backed via repository calls: apps/server/src/index.ts:50, apps/server/src/index.ts:286, apps/server/src/index.ts:302, apps/server/src/index.ts:710, apps/server/src/index.ts:776.
* The canonical session model includes server-owned `Session` tiles plus participant presence and sequencing metadata (`lastOpSeq`, `revision`) returned from persistence: apps/server/src/db/repository.ts:8, apps/server/src/db/repository.ts:11, apps/server/src/db/repository.ts:12, apps/server/src/db/repository.ts:307.
* Session replay state is reconstructed from latest snapshot plus operation log tail, indicating database is authoritative for rehydration and reconnect sync: apps/server/src/db/repository.ts:838, apps/server/src/db/repository.ts:839, apps/server/src/db/repository.ts:844.
* Contract comments state server authoritative ownership and client reconciliation expectations explicitly: apps/server/src/contracts.ts:45, apps/server/src/contracts.ts:156, apps/server/src/contracts.ts:173.

### WebSocket Event Routing and Broadcast Behavior

* `place_tile` and `remove_tile` are request-response events using acknowledgements; mutation broadcasts are separate room emits: apps/server/src/contracts.ts:299, apps/server/src/contracts.ts:301, apps/server/src/contracts.ts:303, apps/server/src/index.ts:654, apps/server/src/index.ts:749.
* Accepted non-idempotent placement emits `tile_placed` to full session room; accepted non-idempotent removal emits `tile_removed` to full session room: apps/server/src/index.ts:731, apps/server/src/index.ts:732, apps/server/src/index.ts:798, apps/server/src/index.ts:799.
* Presence routing behavior is asymmetric by design: `client_joined` uses `socket.to(sessionId)` (exclude sender), `client_left` uses `io.to(sessionId)` (include room recipients), pointer updates are sender-excluded room broadcasts: apps/server/src/index.ts:640, apps/server/src/index.ts:839, apps/server/src/index.ts:823.
* Replayed/idempotent acks intentionally suppress duplicate rebroadcast and duplicate snapshot writes: apps/server/src/index.ts:729, apps/server/src/index.ts:731, apps/server/src/index.ts:796, apps/server/src/index.ts:798.

### Operation Sequencing, Versioning, and Conflict Handling

* Two concurrency controls are layered:
  1. Revision preconditions (`expectedRevision`) reject stale and future mutations before commit.
  2. Per-session operation sequence (`opSeq`) assigns total order for committed operations.
* Revision checks occur both at handler and inside transaction path:
  * Handler precheck: apps/server/src/index.ts:673, apps/server/src/index.ts:674, apps/server/src/index.ts:683, apps/server/src/index.ts:764, apps/server/src/index.ts:765, apps/server/src/index.ts:770.
  * Transactional enforcement: apps/server/src/db/repository.ts:399, apps/server/src/db/repository.ts:400, apps/server/src/db/repository.ts:414, apps/server/src/db/repository.ts:619, apps/server/src/db/repository.ts:620, apps/server/src/db/repository.ts:634.
* Operation ordering uses `opSeq` from `max(op_seq)+1` under per-session advisory transaction lock (`pg_advisory_xact_lock(hashtext(sessionId))`) to serialize concurrent writers: apps/server/src/db/repository.ts:213, apps/server/src/db/repository.ts:215, apps/server/src/db/repository.ts:387, apps/server/src/db/repository.ts:612.
* Canvas `version` increments on each committed place/remove mutation and is returned in mutation result: apps/server/src/db/repository.ts:571, apps/server/src/db/repository.ts:595, apps/server/src/db/repository.ts:765.
* Idempotency uses key `(operation, sessionId, tileId)` plus `clientId` and request hash matching to return deterministic prior outcome or reject hash mismatch: apps/server/src/db/repository.ts:246, apps/server/src/db/repository.ts:274, apps/server/src/db/repository.ts:430, apps/server/src/db/repository.ts:451, apps/server/src/db/repository.ts:650, apps/server/src/db/repository.ts:671.

### Reconnection and Resync Behavior

* On every connection, server sends a replay-based `session_snapshot` built from persisted replay record (`loadSessionReplayRecord`) and current participants: apps/server/src/index.ts:315, apps/server/src/index.ts:329, apps/server/src/index.ts:638.
* Replay model uses latest snapshot plus all later operation-log entries to recover missed events and converge state: apps/server/src/db/repository.ts:839, apps/server/src/db/repository.ts:844, apps/server/src/db/repository.ts:846.
* Disconnection marks participant left and broadcasts `client_left`; no explicit per-client catch-up event stream exists beyond reconnect snapshot and normal room broadcasts: apps/server/src/index.ts:831, apps/server/src/index.ts:838, apps/server/src/index.ts:839.
* Snapshot persistence is periodic (`SNAPSHOT_EVERY_OPS`, default 25), so reconnect recovery can require replaying up to N-1 operations since last snapshot: apps/server/src/db/snapshots.ts:4, apps/server/src/db/snapshots.ts:6, apps/server/src/db/snapshots.ts:8.

### Data Model and Schema Constraints for Sessions and Snapshots

* `canvases` table holds session identity and monotonic `version`: apps/server/src/db/schema.ts:36, apps/server/src/db/schema.ts:40.
* `participants` table is keyed by `(canvas_id, client_id)` and cascades with canvas deletion: apps/server/src/db/schema.ts:49, apps/server/src/db/schema.ts:54, apps/server/src/db/schema.ts:60.
* `tiles` enforces shape/material domain constraints via check constraints and references canvas with cascade: apps/server/src/db/schema.ts:69, apps/server/src/db/schema.ts:84, apps/server/src/db/schema.ts:85.
* `operation_log` enforces uniqueness of `(canvas_id, op_seq)` and maintains order/indexes for replay and audit: apps/server/src/db/schema.ts:92, apps/server/src/db/schema.ts:99, apps/server/src/db/schema.ts:106.
* `idempotency_keys` uses PK `(key, client_id)` and TTL via `expires_at` index for eventual cleanup: apps/server/src/db/schema.ts:116, apps/server/src/db/schema.ts:125, apps/server/src/db/schema.ts:128.
* `snapshots` enforces unique `(canvas_id, op_seq)`, preserving ordered checkpoint lineage per canvas: apps/server/src/db/schema.ts:134, apps/server/src/db/schema.ts:146, apps/server/src/db/schema.ts:147.

### Existing Tests and Coverage Gaps

#### What is covered

* In-memory deterministic concurrency behavior and first-write-wins overlap outcomes: apps/server/src/index.concurrency.test.ts:5, apps/server/src/index.concurrency.test.ts:6, apps/server/src/index.concurrency.test.ts:40.
* In-memory sequencing and idempotent remove semantics: apps/server/src/index.concurrency.test.ts:109, apps/server/src/index.concurrency.test.ts:139.
* Handler-level payload validation and expectedRevision shape checks: apps/server/src/index.test.ts:170, apps/server/src/index.test.ts:193, apps/server/src/index.test.ts:228.
* Presence init/finalize behavior and reconnect snapshot modeling via mocks/state-level tests: apps/server/src/index.integration.test.ts:87, apps/server/src/index.integration.test.ts:115, apps/server/src/index.integration.test.ts:51.
* Duplicate remove rebroadcast suppression modeled as unit logic: apps/server/src/index.integration.test.ts:184.

#### Coverage gaps

* No socket-level integration tests with real concurrent clients exercising end-to-end `io.on('connection')` handlers, room membership, and ack/broadcast fan-out ordering.
* No database-backed concurrency race tests proving advisory lock + `opSeq` behavior under true parallel transactions.
* No integration tests validating idempotency persistence semantics (`REQUEST_HASH_MISMATCH`, replayed accepted acks) through `persistTilePlacement` and `persistTileRemoval` in live DB conditions.
* No reconnect tests proving missed-broadcast recovery from snapshot + operation log in a running Socket.IO session with disconnect/reconnect.
* No multi-node adapter behavior tests validating cross-process broadcast ordering or exactly-once expectations with `@socket.io/postgres-adapter`.
* No tests for retention effects on replay safety windows, for example operation-log pruning outrunning snapshot freshness.

## Key Answers by Requested Topic

1. Session creation and join semantics and identifiers:
* Server creates UUID session IDs via REST and requires handshake `sessionId` plus `clientId` for socket join.
* Presence identity is `(canvasId, clientId)` and is upserted on join.

2. Canonical ownership and persistence boundaries:
* Database-backed repository is authoritative for tile state, op sequence, revision, replay, and presence persistence.
* In-memory map exists for local helper/session cleanup, but live socket mutation path calls persistence layer.

3. WebSocket routing and broadcast:
* Request-response with ack for mutation calls.
* Room-wide emits for authoritative tile mutations.
* Sender-excluded pointer updates and join notifications.
* Idempotent replays suppress duplicate rebroadcast.

4. Sequencing/versioning/conflict handling:
* `expectedRevision` guards stale/future operations.
* Advisory lock plus `opSeq` defines per-session write order.
* Version increments per committed mutation.
* Request-hash idempotency ensures deterministic retry handling.

5. Reconnection/resync behavior:
* Connect path always emits full replayed `session_snapshot`.
* Replay source = latest snapshot + operation tail.
* No separate diff protocol; snapshot is primary resync primitive.

6. Data model/schema constraints:
* Strong DB constraints exist for shape/material enums, per-canvas op order uniqueness, snapshot uniqueness, participant identity, and idempotency TTL records.

7. Tests and coverage gaps:
* Good deterministic unit coverage for pure handlers and state reconcilers.
* Gaps remain in true concurrent DB/socket integration and multi-node adapter behavior.

## Clarifying Questions and Potential Risks

* Should `sessionId` be validated as UUID at socket auth boundary like `tileId` is validated for mutation payloads? Current middleware checks presence, not format.
* Is `clientId` trusted as external identity or should it be server-issued/authenticated to prevent spoofing participant identity?
* Should there be explicit reconciliation API or event for partial resync when operation-log retention may prune needed events between snapshots?
* Is exactly-once broadcast delivery a requirement across multi-node deployments, or is at-least-once with idempotent client handling acceptable?

## Recommended Next Research

* Verify client-side handling of `opSeq` gaps and `requiresSnapshot` or equivalent logic to assess end-to-end convergence guarantees.
* Inspect database migration SQL for any divergence from current Drizzle schema definitions.
* Review socket authentication and session authorization model, including any upstream identity provider integration.
* Validate production topology assumptions for Postgres adapter under horizontal scaling and failover.
* Add load/concurrency test harness recommendations for parallel writers with real Postgres and Socket.IO clients.
