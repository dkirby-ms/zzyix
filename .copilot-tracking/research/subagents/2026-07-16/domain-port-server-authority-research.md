---
title: Domain Port Server Authority Research
description: Research findings for issue #9 authoritative backend service domain port in zzyix.
ms.date: 2026-07-16
ms.topic: reference
---

## Status
Complete: no blockers identified from repository evidence.

## Findings
1. Server place_tile path is a placeholder and currently does not enforce authoritative validation.
  - In apps/server/src/index.ts the place_tile handler logs payload, contains TODOs for domain validation/accept-reject, then always acks accepted with a generated tile object.
  - tile_placed broadcast is present only as a commented TODO and is not executed.
2. Operation ordering/convergence behavior is defined in contract comments but not implemented in server runtime code.
  - contracts.ts documents deterministic first-write-wins and convergence via authoritative broadcasts.
  - index.ts does not maintain per-session authoritative tile state and does not perform conflict checks, so deterministic conflict resolution is not active.
3. remove_tile is also placeholder logic.
  - Server acks removed: true unconditionally and does not verify tile existence or emit tile_removed.
4. Tile ID handling currently happens in two places and both are non-authoritative/randomized.
  - Client local placement path generates id with Date.now + Math.random.
  - Server place_tile placeholder also generates id with Date.now + Math.random.
  - There is no server-side validation of tileId format/location because place payload carries no tileId and remove_tile accepts tileId without validation.
5. Client domain modules required for server port are self-contained and portable as pure TypeScript logic.
  - math2d.ts provides vector/math primitives used by tileGeometry.ts and placementSolver.ts.
  - tileGeometry.ts defines canonical shapes, transform semantics, convex decomposition, and rotation normalization.
  - placementSolver.ts provides bounds checks, SAT overlap checks, adjacency (MAX_GROUT_GAP), correction vectors, and validity states.
6. Contract surface already expresses the needed authoritative protocol.
  - PlaceTileAck supports accepted/rejected union with rejection reason.
  - ServerToClient includes session_snapshot, tile_placed, tile_removed and pointer_update events.
  - contracts.ts explicitly states server-assigned IDs and authoritative state ownership.
7. Test evidence currently validates domain logic only on the client side.
  - placementSolver and tileGeometry tests cover overlap rejection, bounds correction, transform behavior, and quantized rotation.
  - No server-side tests exist under apps/server/src.

### Assumptions
- Issue #9 scope is domain-port implementation research only, not code execution changes.
- Deterministic ordering evaluation is constrained to repository evidence in code/comments; no runtime traces were available.

## Evidence (file+line)
- place_tile placeholder flow and missing broadcast:
  - apps/server/src/index.ts:78-95
  - apps/server/src/index.ts:81-83 (validation TODOs)
  - apps/server/src/index.ts:93-94 (tile_placed TODO only)
- remove_tile placeholder flow and missing broadcast:
  - apps/server/src/index.ts:97-108
- missing session snapshot implementation on connect:
  - apps/server/src/index.ts:73-74
- pointer_update currently does broadcast-to-peers only (implemented path):
  - apps/server/src/index.ts:110-119
- server currently imports SCHEMA_VERSION as type only, without runtime use:
  - apps/server/src/index.ts:4-11
- contracts define authoritative state and payloads:
  - apps/server/src/contracts.ts:45-55 (authoritative TileInstance)
  - apps/server/src/contracts.ts:59-64 (Session tiles)
  - apps/server/src/contracts.ts:208-217 (PlaceTilePayload/PlaceTileAck)
  - apps/server/src/contracts.ts:219-225 (RemoveTile payload/ack)
  - apps/server/src/contracts.ts:273-285 (server events incl. tile_placed/tile_removed/session_snapshot)
- contracts define deterministic ordering/convergence target:
  - apps/server/src/contracts.ts:168-180 (concurrent edits narrative)
  - apps/server/src/contracts.ts:181-188 (server assigns IDs, reconciliation)
  - apps/server/src/contracts.ts:304-320 (formal agreement incl first-write-wins)
- client-side ID generation today:
  - apps/client/src/interaction/controller.ts:102-117
  - apps/server/src/index.ts:85-89
- client domain modules to port:
  - apps/client/src/domain/math2d.ts:1-45
  - apps/client/src/domain/tileGeometry.ts:4-114
  - apps/client/src/domain/placementSolver.ts:1-271
  - apps/client/src/domain/placementSolver.ts:155-235 (validatePlacement)
  - apps/client/src/domain/placementSolver.ts:237-264 (solveGuidedPlacement)
- client test coverage relevant to port:
  - apps/client/src/domain/placementSolver.test.ts:10-63
  - apps/client/src/domain/tileGeometry.test.ts:5-28
  - apps/client/src/interaction/controller.test.ts:30-64
- architecture intent says server domain engine should exist under server/src/domain:
  - apps/server/README.md:36-39
- package layout constraints for shared extraction:
  - apps/server/package.json:1-27
  - apps/client/package.json:1-37
  - package.json files present only at apps/client and apps/server (verified via rg --files -g package.json)

## Alternatives
### Alternative A: Direct copy port into apps/server/src/domain (recommended)

Pros
- Fastest path to enforce authoritative validation in issue #9.
- Keeps server independent from client package internals, aligned with contracts comment about no compile-time dependency.
- Minimal repository restructuring.

Cons
- Potential duplication drift between client and server domain math/geometry/solver.
- Requires deliberate strategy to keep logic parity across two copies.

Implementation-ready snippet (server-local authoritative place_tile)

```ts
// apps/server/src/domain/placementSolver.ts
export { validatePlacement, defaultBounds } from '../../client/src/domain/placementSolver'
```

```ts
// apps/server/src/index.ts (illustrative shape)
import { randomUUID } from 'node:crypto'
import { validatePlacement, defaultBounds } from './domain/placementSolver'

const sessions = new Map<string, { tiles: TileInstance[]; createdAt: number; updatedAt: number }>()

socket.on('place_tile', (payload, ack) => {
  const session = sessions.get(sessionId) ?? { tiles: [], createdAt: Date.now(), updatedAt: Date.now() }
  const validation = validatePlacement(payload.shape, payload.transform, session.tiles, defaultBounds)

  if (!validation.valid) {
    ack({ placed: null, rejected: true, reason: validation.reason })
    return
  }

  const tile: TileInstance = {
    id: randomUUID(),
    shape: payload.shape,
    color: payload.color,
    material: payload.material,
    transform: payload.transform,
    createdAt: Date.now(),
  }

  session.tiles.push(tile)
  session.updatedAt = Date.now()
  sessions.set(sessionId, session)

  ack({ placed: tile, rejected: false })
  io.to(sessionId).emit('tile_placed', { tile, placedBy: clientId })
})
```

### Alternative B: Extract shared domain package (for example packages/domain)

Pros
- Single source of truth for math/geometry/placement logic.
- Eliminates long-term drift between client/server validation.

Cons
- Requires monorepo/package-manager restructuring (current repo has separate app package.json files only).
- Higher setup/migration cost before issue #9 behavior can ship.

Implementation-ready snippet (shared module boundary)

```ts
// packages/domain/src/index.ts
export * from './math2d'
export * from './tileGeometry'
export * from './placementSolver'
```

```ts
// apps/server/src/index.ts
import { validatePlacement, defaultBounds } from '@zzyix/domain'
```

### Alternative C: RPC validation fallback service

Pros
- Can centralize authoritative decisioning without immediate full port/refactor.
- Useful if domain logic will move to separate process later.

Cons
- Adds latency and operational complexity.
- Requires failure-handling path for validator unavailability.
- Not currently reflected in existing server/client architecture files.

Implementation-ready snippet (fallback call)

```ts
const validation = await validatorClient.validatePlaceTile({
  shape: payload.shape,
  transform: payload.transform,
  settled: session.tiles,
})

if (!validation.valid) {
  ack({ placed: null, rejected: true, reason: validation.reason })
  return
}
```

## Recommended Approach
Recommend Alternative A now, then evolve toward Alternative B.

Why
- It is the lowest-risk/fastest path to implement issue #9 against currently missing runtime authority in apps/server/src/index.ts:78-95 and apps/server/src/index.ts:97-108.
- Existing contracts already define the server-authoritative behavior and deterministic convergence target; A enables those behaviors with minimum structural churn.
- The project already separates client/server apps without shared workspace package wiring, making B a larger follow-up change.

Execution outline
1. Port math2d.ts, tileGeometry.ts, placementSolver.ts into apps/server/src/domain with server-appropriate TileInstance type (no settleFrom).
2. Add in-memory session state map in apps/server/src/index.ts keyed by sessionId.
3. Implement place_tile: validate against current session tiles, reject via PlaceTileAck when invalid, assign server UUID when valid, append tile, then broadcast tile_placed.
4. Implement remove_tile: validate tileId format and existence in session tiles, remove if found, ack removed boolean, broadcast tile_removed on success.
5. Emit session_snapshot on connect using authoritative session + client presence.
6. Add server tests for placement acceptance/rejection and ordering behavior.

## Risks
- Contract vs runtime drift currently exists: formal guarantees in apps/server/src/contracts.ts:304-320 are not implemented in apps/server/src/index.ts:78-108.
- Dual ID generation paths can cause reconciliation mismatch during migration if client still creates local IDs in apps/client/src/interaction/controller.ts:102-117.
- Geometry/solver duplication risk if Alternative A is used without parity tests between client and server copies.
- Implementation notes describe hidden guidance anchors in apps/client/IMPLEMENTATION_NOTES.md:8-12, while current solveGuidedPlacement is pointer-pass-through with snapping disabled in apps/client/src/domain/placementSolver.ts:245-254; documentation drift may confuse future maintainers.

## Suggested Tests
1. Server unit tests for validatePlacement port
  - overlap rejection, bounds rejection, adjacency/gap rejection, valid placement acceptance.
  - Source parity with client tests in apps/client/src/domain/placementSolver.test.ts:10-63.
2. Server socket tests for place_tile ack and broadcast order
  - valid place returns rejected:false with server-generated UUID.
  - invalid place returns rejected:true with non-empty reason.
  - tile_placed broadcast emitted once after state mutation.
3. Concurrent placement determinism test
  - Two simultaneous place_tile requests on colliding transforms.
  - Verify exactly one accepted when conflict exists, and session tiles order matches acceptance order.
4. remove_tile validation tests
  - invalid tileId format or missing tile returns removed:false.
  - existing tile removal returns removed:true and emits tile_removed.
5. session_snapshot sync tests
  - On connect/reconnect, snapshot reflects current authoritative session tiles and clients.
