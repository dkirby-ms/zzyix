<!-- markdownlint-disable-file -->
# Implementation Details: Client-Server Integration (Issue #12)

## Context Reference

Sources: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md`, subagent findings in `.copilot-tracking/research/subagents/2026-07-16/`

---

## Implementation Phase 1: Foundation

<!-- parallelizable: false -->

### Step 1.1: Add `socket.io-client` to client dependencies

Add `socket.io-client` to the `dependencies` section of `apps/client/package.json`. The version should match the server's `socket.io` version to avoid handshake protocol mismatches (check `apps/server/package.json` for the server version).

Files:
* `apps/client/package.json` - Add `"socket.io-client": "^4.x.x"` to `dependencies` (after line 22, alongside react/three/zustand)

Success criteria:
* `npm install` in `apps/client/` completes without errors
* `import { io } from 'socket.io-client'` resolves in TypeScript

Context references:
* `apps/client/package.json` (Lines 13–22) — Current dependencies section; `socket.io-client` is absent
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Key Discoveries — Project Structure) — Confirms `socket.io-client` is NOT listed

Dependencies:
* None — first step

---

### Step 1.2: Create `apps/client/src/network/session.ts`

Create the session bootstrap module. This module provides two pure async functions: `ensureSession()` (creates or retrieves a sessionId from `sessionStorage`) and `ensureClientId()` (generates or retrieves a stable clientId from `localStorage`).

Files:
* `apps/client/src/network/session.ts` — New file; full implementation below

```typescript
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const ensureSession = async (): Promise<string> => {
  const stored = sessionStorage.getItem('zzyix_session_id')
  if (stored) return stored

  const res = await fetch(`${SERVER_URL}/sessions`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
  const data = await res.json() as { session: { id: string } }
  sessionStorage.setItem('zzyix_session_id', data.session.id)
  return data.session.id
}

export const ensureClientId = (): string => {
  const stored = localStorage.getItem('zzyix_client_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('zzyix_client_id', id)
  return id
}
```

Discrepancy references:
* Addresses DD-01 (no URL validation) — `res.ok` check provides minimal boundary validation

Success criteria:
* Module compiles with no TypeScript errors
* `sessionStorage` and `localStorage` keys are `zzyix_session_id` and `zzyix_client_id` respectively
* `POST /sessions` response shape matches server contract

Context references:
* `apps/server/src/contracts.ts` — `POST /sessions` REST response shape
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario B) — Session bootstrap code example

Dependencies:
* Step 1.1 (socket.io-client installed; `VITE_SERVER_URL` available at compile time)

---

### Step 1.3: Create `apps/client/src/network/useSocketConnection.ts`

Create the typed socket connection React hook. This hook manages the socket lifecycle (connect on mount, disconnect on cleanup), registers `session_snapshot`, `tile_placed`, and `tile_removed` listeners passed as callbacks, and exposes the socket ref for emitting events.

Files:
* `apps/client/src/network/useSocketConnection.ts` — New file; full implementation below

```typescript
import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionSnapshotPayload,
  TilePlacedPayload,
  TileRemovedPayload,
} from '../../../server/src/contracts'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export const useSocketConnection = (
  serverUrl: string,
  sessionId: string | null,
  clientId: string,
  onSnapshot: (payload: SessionSnapshotPayload) => void,
  onTilePlaced: (payload: TilePlacedPayload) => void,
  onTileRemoved: (payload: TileRemovedPayload) => void,
): React.MutableRefObject<AppSocket | null> => {
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const socket: AppSocket = io(serverUrl, {
      auth: { sessionId, clientId },
    })

    socket.on('session_snapshot', onSnapshot)
    socket.on('tile_placed', onTilePlaced)
    socket.on('tile_removed', onTileRemoved)

    socketRef.current = socket

    return () => {
      socket.off('session_snapshot', onSnapshot)
      socket.off('tile_placed', onTilePlaced)
      socket.off('tile_removed', onTileRemoved)
      socket.disconnect()
      socketRef.current = null
    }
  }, [serverUrl, sessionId, clientId])

  return socketRef
}
```

**Import path note:** The import `'../../../server/src/contracts'` uses a relative path from `apps/client/src/network/` to `apps/server/src/`. Confirm this path resolves in the monorepo. If TypeScript `paths` aliases are configured, use those. If path does not resolve, copy only the necessary types into `apps/client/src/network/contracts.ts` (see DD-02 in Planning Log).

Discrepancy references:
* Addresses DR-01 (stale event listeners) — event listeners are explicitly removed in cleanup via `socket.off`

Success criteria:
* Hook compiles with no TypeScript errors
* Socket disconnects on component unmount (cleanup runs)
* Event listeners removed on cleanup (no stale callback leaks)
* `sessionId: null` guard prevents premature connection before session bootstrap completes

Context references:
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Complete Examples — Socket connection hook) — Reference implementation
* `apps/server/src/contracts.ts` (Lines 1–330) — Type definitions for `ClientToServerEvents`, `ServerToClientEvents`, `SessionSnapshotPayload`, etc.

Dependencies:
* Step 1.1 (socket.io-client installed)

---

### Step 1.4: Add `VITE_SERVER_URL` environment variable

Create `apps/client/.env` and `apps/client/.env.example` with the `VITE_SERVER_URL` variable.

Files:
* `apps/client/.env` — Local dev env (gitignored or already in .gitignore)
* `apps/client/.env.example` — Committed template for contributors

```
# apps/client/.env
VITE_SERVER_URL=http://localhost:3001
```

```
# apps/client/.env.example
VITE_SERVER_URL=http://localhost:3001
```

Success criteria:
* `import.meta.env.VITE_SERVER_URL` resolves to `'http://localhost:3001'` in dev
* `.env` does not contain secrets; safe to show in example

Dependencies:
* None

---

### Step 1.5: Validate phase changes

Validation commands:
* `cd apps/client && npm install` — installs socket.io-client
* `cd apps/client && npm run build` — TypeScript compile check for new network files

---

## Implementation Phase 2: App.tsx Integration

<!-- parallelizable: false -->

### Step 2.1: Replace tile state with `SequencedTilesState`

Replace the bare `useState<TileInstance[]>([])` at `App.tsx` line 20 with `useState<SequencedTilesState>` initialized via `createInitialSequencedTilesState()`.

Update all code that currently reads `tiles` (direct array) to read `sequencedState.tiles`. Update all code that currently calls `setTiles(...)` to call `setSequencedState(...)`.

Files:
* `apps/client/src/App.tsx` — Lines 20, 110, 82, 146–147; all downstream uses of `tiles`

Changes:
```typescript
// Remove:
const [tiles, setTiles] = useState<TileInstance[]>([])

// Add:
const [sequencedState, setSequencedState] = useState<SequencedTilesState>(
  createInitialSequencedTilesState()
)
```

Update import in App.tsx to include:
```typescript
import {
  createInitialGhost,
  createInitialSequencedTilesState,
  stepGhost,
  tryPlaceTile,
  updateGhostTarget,
  applySequencedSnapshot,
  reconcileSequencedTilePlaced,
  reconcileSequencedTileRemoved,
} from './interaction/controller'
import type { ActiveTile, SequencedTilesState } from './interaction/controller'
```

Remove the `TileInstance` import from `placementSolver` (no longer needed in App.tsx after this refactor).

Downstream replacements in App.tsx:
* `updateGhostTarget(vec2(x, y), activeTile, tiles)` → `updateGhostTarget(vec2(x, y), activeTile, sequencedState.tiles)`
* `<MosaicScene tiles={tiles}` → `<MosaicScene tiles={sequencedState.tiles}`
* `canUndo={tiles.length > 0}` → `canUndo={sequencedState.tiles.length > 0}` (update after undo refactor in Step 2.6)
* `{tiles.length} placed` in status strip → `{sequencedState.tiles.length} placed`

Success criteria:
* App.tsx compiles with no TypeScript errors referencing `tiles`
* `sequencedState.tiles` is passed to `MosaicScene` and `updateGhostTarget`

Context references:
* `apps/client/src/App.tsx` (Line 20) — `useState<TileInstance[]>([])` to replace
* `apps/client/src/interaction/controller.ts` (Lines 57–65) — `createInitialSequencedTilesState`, `SequencedTilesState` definitions

Dependencies:
* Phase 1 complete

---

### Step 2.2: Add session bootstrap and session/clientId state

Add session bootstrap state and a `useEffect` on mount that calls `ensureSession()` / `ensureClientId()` and stores the result in component state. Also add `sessionId` and `clientId` state variables.

Files:
* `apps/client/src/App.tsx` — Add state variables and bootstrap effect

```typescript
import { ensureSession, ensureClientId } from './network/session'
import { useSocketConnection } from './network/useSocketConnection'

// Inside App():
const [sessionId, setSessionId] = useState<string | null>(null)
const clientId = useMemo(() => ensureClientId(), [])
const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

useEffect(() => {
  ensureSession()
    .then(setSessionId)
    .catch((err: unknown) => {
      console.error('Session bootstrap failed:', err)
    })
}, [])
```

Success criteria:
* `sessionId` is populated on mount via REST call
* `clientId` is stable across re-renders (UUID from localStorage)
* Bootstrap errors are caught and logged (not thrown to React error boundary)

Context references:
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario B) — Session bootstrap flow

Dependencies:
* Step 2.1 complete (state refactor)
* Phase 1 complete (session.ts module exists)

---

### Step 2.3: Wire `session_snapshot` → `applySequencedSnapshot`

Define the socket event callbacks and pass them to `useSocketConnection`. The `onSnapshot` callback calls `applySequencedSnapshot` and sets the result into `sequencedState`.

Files:
* `apps/client/src/App.tsx` — Add callbacks and socket hook call

```typescript
const onSnapshot = useCallback((payload: SessionSnapshotPayload): void => {
  setSequencedState(applySequencedSnapshot({
    tiles: payload.tiles,
    lastOpSeq: payload.lastOpSeq,
  }))
}, [])

const socketRef = useSocketConnection(
  serverUrl,
  sessionId,
  clientId,
  onSnapshot,
  onTilePlaced,   // defined in Step 2.5
  onTileRemoved,  // defined in Step 2.5
)
```

**Important ordering note:** Define `onTilePlaced` and `onTileRemoved` callbacks (Step 2.5) *before* the `useSocketConnection` hook call in the function body. `const` bindings are not hoisted; referencing them before declaration causes a compile error. Implement Step 2.5 content first, then wire it into the hook call shown here.

**`SessionSnapshotPayload` type:** Import from `../../../server/src/contracts` (or local copy per DD-02).

Success criteria:
* On socket connect, `sequencedState` is reset to server snapshot
* `applySequencedSnapshot` is called with correct shape (`tiles` + `lastOpSeq`)

Context references:
* `apps/client/src/interaction/controller.ts` (Lines 65–69) — `applySequencedSnapshot` signature
* `apps/server/src/contracts.ts` — `SessionSnapshotPayload` shape

Dependencies:
* Steps 2.1, 2.2 complete

---

### Step 2.4: Replace `attemptPlace` with two-phase optimistic placement

Replace the existing `attemptPlace` function (App.tsx line 110–119) with the race-condition-safe two-phase version. This is the most complex change.

Files:
* `apps/client/src/App.tsx` — Replace `attemptPlace` function body (lines 110–119)

```typescript
const attemptPlace = (): void => {
  const result = tryPlaceTile(activeTile, ghost, sequencedState.tiles)
  if (!result.placed) {
    triggerInvalidPulse()
    return
  }

  const tempTile = result.placed  // has client-generated temp ID + settleFrom

  // Optimistic add
  setSequencedState(prev => ({
    ...prev,
    tiles: [...prev.tiles, tempTile],
  }))

  const socket = socketRef.current
  if (!socket) return

  const payload: PlaceTilePayload = {
    shape: tempTile.shape,
    color: tempTile.color,
    material: tempTile.material,
    transform: tempTile.transform,
  }

  socket.emit('place_tile', payload, (ack) => {
    if (ack.rejected) {
      // Rollback optimistic tile
      setSequencedState(prev => ({
        ...prev,
        tiles: prev.tiles.filter(t => t.id !== tempTile.id),
      }))
      triggerInvalidPulse()
    } else {
      // CRITICAL: unconditionally strip temp tile; broadcast may have arrived first
      setSequencedState(prev => {
        const withoutTemp = prev.tiles.filter(t => t.id !== tempTile.id)
        const alreadyPresent = withoutTemp.some(t => t.id === ack.placed.id)
        if (alreadyPresent) {
          // Broadcast arrived first — server tile already in state; advance opSeq only
          return { ...prev, tiles: withoutTemp, lastOpSeq: Math.max(prev.lastOpSeq, ack.opSeq) }
        }
        return {
          ...prev,
          tiles: [...withoutTemp, { ...ack.placed, settleFrom: tempTile.settleFrom }],
          lastOpSeq: Math.max(prev.lastOpSeq, ack.opSeq),
        }
      })
    }
  })
}

const triggerInvalidPulse = (): void => {
  setInvalidPulse(true)
  window.setTimeout(() => setInvalidPulse(false), 180)
}
```

**Remove** the existing inline `setInvalidPulse(true); window.setTimeout(...)` block and extract it to `triggerInvalidPulse()` for reuse.

**Import:** Add `PlaceTilePayload` from contracts.

Discrepancy references:
* Addresses critical race condition from research Subagent 1: "Broadcast arrived first" branch handles the case where `tile_placed` broadcast arrives before the ack

Success criteria:
* On accepted ack: temp tile replaced with server tile, `settleFrom` preserved for animation
* On rejected ack: temp tile removed, `invalidPulse` fires
* No duplicate tiles when broadcast arrives before ack
* `socket.emit` is only called when `socketRef.current` is non-null

Context references:
* `apps/client/src/App.tsx` (Lines 110–119) — `attemptPlace` function to replace
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario A, Corrected ack handler) — Race-safe implementation
* `apps/server/src/contracts.ts` — `PlaceTilePayload`, `PlaceTileAck` types

Dependencies:
* Steps 2.1–2.3 complete

---

### Step 2.5: Wire `tile_placed` / `tile_removed` broadcast handlers

Define the broadcast event callbacks. Both call the appropriate `reconcileSequenced*` function and trigger reconnect when `requiresSnapshot: true`.

Files:
* `apps/client/src/App.tsx` — Add `onTilePlaced` and `onTileRemoved` callbacks (define before `useSocketConnection` call)

```typescript
const onTilePlaced = useCallback((payload: TilePlacedPayload): void => {
  setSequencedState(prev => {
    const next = reconcileSequencedTilePlaced(prev, {
      tile: payload.tile,
      opSeq: payload.opSeq,
    })
    if (next.requiresSnapshot && socketRef.current) {
      setTimeout(() => {
        socketRef.current?.disconnect()
        socketRef.current?.connect()
      }, 0)
    }
    return next
  })
}, [])

const onTileRemoved = useCallback((payload: TileRemovedPayload): void => {
  setSequencedState(prev => {
    const next = reconcileSequencedTileRemoved(prev, {
      tileId: payload.tileId,
      opSeq: payload.opSeq,
    })
    if (next.requiresSnapshot && socketRef.current) {
      setTimeout(() => {
        socketRef.current?.disconnect()
        socketRef.current?.connect()
      }, 0)
    }
    return next
  })
}, [])
```

**Import:** Add `TilePlacedPayload`, `TileRemovedPayload` from contracts.

**Note on `tile_placed` dedup:** The reconciler's `payload.opSeq <= state.lastOpSeq` guard at `controller.ts` line 74 handles the case where the placing client's own broadcast arrives after the ack swap (which already advanced `lastOpSeq`). No special handling needed beyond calling `reconcileSequencedTilePlaced`.

Success criteria:
* Peer `tile_placed` events update `sequencedState.tiles` via reconciler
* Out-of-order events (`opSeq > lastOpSeq + 1`) set `requiresSnapshot` and trigger reconnect
* Already-processed events (`opSeq <= lastOpSeq`) are no-ops (reconciler dedup)

Context references:
* `apps/client/src/interaction/controller.ts` (Lines 70–92) — `reconcileSequencedTilePlaced` dedup guard
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario D) — Broadcast reconciliation code example

Dependencies:
* Steps 2.1–2.3 complete; `socketRef` available from Step 2.3

---

### Step 2.6: Export `isServerTileId` from `controller.ts`; replace undo/clear with `remove_tile` socket calls

Replace the local undo logic in two places:
1. Keyboard handler at App.tsx line 82: `setTiles((prev) => prev.slice(0, -1))` 
2. ControlsPanel `onUndo` prop handler at App.tsx line 146: `setTiles((prev) => prev.slice(0, -1))`

First, export `isServerTileId` from `controller.ts` (not App.tsx) so it is testable from `controller.test.ts` without importing the full App component. The UUID format check is a tile identity concern shared by both the controller and the view layer.

Add to `apps/client/src/interaction/controller.ts` (after the `reconcileSequencedTileRemoved` export, around line 113):
```typescript
export const isServerTileId = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
```

Import it in App.tsx:
```typescript
import { ..., isServerTileId } from './interaction/controller'
```

Files:
* `apps/client/src/interaction/controller.ts` — Add `isServerTileId` export after `reconcileSequencedTileRemoved` (line ~113)
* `apps/client/src/App.tsx` — Lines 82, 146–147

```typescript
// Add helper to controller.ts (export, not App.tsx):
export const isServerTileId = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

// handleUndo (replaces both undo callsites):
const handleUndo = (): void => {
  const lastSettled = [...sequencedState.tiles].reverse().find(t => isServerTileId(t.id))
  if (!lastSettled) return

  const socket = socketRef.current
  if (!socket) return

  socket.emit('remove_tile', { tileId: lastSettled.id }, (ack) => {
    if (!ack.removed) {
      // Peer may have removed this tile already — reconnect for fresh snapshot
      socket.disconnect()
      socket.connect()
    }
  })
}
```

**Clear action:** The server has no bulk-clear event. For now, disable `onClear` when connected by passing `onClear={() => undefined}` or removing the prop from ControlsPanel. Add a WI item (WI-02) for future bulk-clear support.

**Update ControlsPanel props:**
```typescript
canUndo={sequencedState.tiles.some(t => isServerTileId(t.id))}
onUndo={handleUndo}
onClear={() => undefined}  // disabled; no server bulk-clear event
```

**Update keyboard handler:**
```typescript
if (event.key.toLowerCase() === 'z') {
  handleUndo()
}
```

Discrepancy references:
* Addresses DR-02 (pending tile undo) — UUID guard prevents `remove_tile` for unacknowledged tiles

Success criteria:
* Undo emits `remove_tile` with server UUID; tile removed from state on next broadcast
* Undo of pending (temp ID) tile is a no-op
* `remove_tile` failure (ack.removed = false) triggers reconnect for snapshot recovery
* Clear is disabled (no regression from server-missing event)

Context references:
* `apps/client/src/App.tsx` (Lines 82, 146–147) — Undo callsites to replace
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario C) — Undo via remove_tile code example

Dependencies:
* Steps 2.1–2.5 complete

---

### Step 2.7: Update ControlsPanel tile count reference

The status strip `{tiles.length} placed` (App.tsx line ~153) must be updated to `{sequencedState.tiles.length} placed`. Covered in Step 2.1 downstream replacements — confirm it is updated here.

Files:
* `apps/client/src/App.tsx` — Status strip span

Success criteria:
* Tile count reflects settled + pending tiles in `sequencedState.tiles`

Dependencies:
* Step 2.1 complete

---

### Step 2.8: Validate phase changes

Validation commands:
* `cd apps/client && npm run build` — full TypeScript type check of App.tsx

---

## Implementation Phase 3: Tests

<!-- parallelizable: false -->

### Step 3.1: Add socket integration tests to `controller.test.ts`

Extend `apps/client/src/interaction/controller.test.ts` with the seven test cases from the research testing strategy. Use a minimal socket stub (plain object with `emit`, `on`, `disconnect`, `connect` methods) rather than a full socket.io mock.

Files:
* `apps/client/src/interaction/controller.test.ts` — Append new `describe` block after line 80+

Test cases to implement:

**1. Optimistic accept** — temp tile replaced with server tile on accepted ack
```typescript
it('replaces temp tile with server tile on accepted ack', () => {
  const initial = createInitialSequencedTilesState()
  const tempTile = { id: `${Date.now()}-abc`, ...baseFields }
  const withTemp = { ...initial, tiles: [tempTile] }

  // Simulate ack swap (no broadcast race)
  const serverTile = { id: '11111111-1111-4111-8111-111111111111', ...baseFields }
  const withoutTemp = withTemp.tiles.filter(t => t.id !== tempTile.id)
  const alreadyPresent = withoutTemp.some(t => t.id === serverTile.id)

  expect(alreadyPresent).toBe(false)
  const result = [...withoutTemp, { ...serverTile, settleFrom: tempTile.settleFrom }]
  expect(result[0].id).toBe(serverTile.id)
})
```

**2. Optimistic reject** — temp tile removed from state
```typescript
it('removes temp tile on rejected ack', () => {
  const tempTile = { id: `${Date.now()}-abc`, ...baseFields }
  const withTemp = { ...createInitialSequencedTilesState(), tiles: [tempTile] }
  const rolled = { ...withTemp, tiles: withTemp.tiles.filter(t => t.id !== tempTile.id) }
  expect(rolled.tiles).toHaveLength(0)
})
```

**3. Broadcast dedup** — `tile_placed` with `opSeq ≤ lastOpSeq` is a no-op (already covered by existing test — verify it still passes)

**4. Snapshot reset** — `applySequencedSnapshot` resets tiles and `lastOpSeq` (already covered — verify)

**5. Gap detection** — `tile_placed` with `opSeq !== lastOpSeq + 1` sets `requiresSnapshot` (already covered — verify)

**6. Undo settled** — `isServerTileId` returns true for UUID, false for temp ID
```typescript
it('identifies server tile IDs correctly', () => {
  const uuid = '11111111-1111-4111-8111-111111111111'
  const tempId = `${Date.now()}-abc123`
  expect(isServerTileId(uuid)).toBe(true)
  expect(isServerTileId(tempId)).toBe(false)
})
```

**7. Race condition: broadcast before ack** — when server tile already in state after broadcast, ack handler removes temp and skips re-adding server tile
```typescript
it('handles ack-after-broadcast race: no duplicate when broadcast arrives first', () => {
  const initial = createInitialSequencedTilesState()
  const tempTile = { id: `${Date.now()}-race`, ...baseFields }
  const serverTile = { id: '22222222-2222-4222-8222-222222222222', ...baseFields }

  // Simulate: temp tile added optimistically
  const withTemp = { ...initial, tiles: [tempTile] }
  // Simulate: broadcast arrives first, server tile added via reconciler
  const afterBroadcast = reconcileSequencedTilePlaced(withTemp, { tile: serverTile, opSeq: 1 })
  // Note: reconciler doesn't touch temp tile; both present after broadcast
  expect(afterBroadcast.tiles).toHaveLength(2)

  // Simulate: ack arrives — strip temp, detect server tile already present
  const withoutTemp = afterBroadcast.tiles.filter(t => t.id !== tempTile.id)
  const alreadyPresent = withoutTemp.some(t => t.id === serverTile.id)
  expect(alreadyPresent).toBe(true)

  // Result: temp stripped, server tile kept, no duplicate
  const finalTiles = withoutTemp
  expect(finalTiles).toHaveLength(1)
  expect(finalTiles[0].id).toBe(serverTile.id)
})
```

**Test 6 import:** Import `isServerTileId` from `'./controller'` — it is now exported from `controller.ts`, not App.tsx.

Success criteria:
* All 7 test cases pass (new + existing)
* `npm run test` in `apps/client/` exits 0

Context references:
* `apps/client/src/interaction/controller.test.ts` (Lines 1–80+) — Existing test baseline; append after
* `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Testing Strategy table) — Test case definitions

Dependencies:
* Phase 2 complete (App.tsx changes stabilize the shape of types and helpers)

---

## Implementation Phase 4: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

```bash
cd apps/client
npm install
npm run lint
npm run build
npm run test
```

### Step 4.2: Fix minor validation issues

* Iterate on lint errors (`oxlint`) and TypeScript type errors
* Apply fixes directly for straightforward issues (missing imports, type mismatches, unused variables)

### Step 4.3: Report blocking issues

When validation failures require changes beyond minor fixes:
* Document the issues and affected files
* Provide next steps — do NOT attempt large-scale refactors inline
* Common blockers: contracts.ts import path resolution, socket.io version mismatch, missing type exports from server

---

## Dependencies

* `socket.io-client` npm package (matches server `socket.io` version)
* `apps/server/src/contracts.ts` type resolution from client path
* Running server (`npm run dev:server`) for manual integration testing

## Success Criteria

* All success criteria from Implementation Plan `client-server-integration-plan.instructions.md` are met
* `npm run test` in `apps/client/` passes with 7+ new test cases
* `npm run build` in `apps/client/` exits 0 (no TypeScript errors)
* Manual verification: place tile in browser → optimistic appear → server UUID in state
