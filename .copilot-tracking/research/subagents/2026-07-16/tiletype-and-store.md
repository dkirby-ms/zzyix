# Research: TileInstance Type, Zustand Store, and Vite Proxy

Date: 2026-07-16
Status: Complete

---

## Topic 1: TileInstance type mismatch — client settleFrom vs server

### Client TileInstance

File: `apps/client/src/domain/placementSolver.ts`, lines 15–23

```ts
export type TileInstance = {
  id: string
  shape: TileShape
  color: string
  material: 'ceramic' | 'glass' | 'stone'
  transform: Transform2D
  settleFrom?: Transform2D   // <-- optional
  createdAt: number
}
```

`settleFrom` is **optional** (`?:`).

### Server TileInstance

File: `apps/server/src/contracts.ts`, lines 44–56

```ts
/**
 * Authoritative tile state on the server.
 * Does NOT include settleFrom (that's client-side animation metadata only).
 */
export type TileInstance = {
  id: string
  shape: TileShape
  color: string
  material: MaterialVariant
  transform: Transform2D
  createdAt: number
}
```

The server type deliberately omits `settleFrom`. The comment confirms it is client-only animation metadata.

### Renderer usage of settleFrom

File: `apps/client/src/render/MosaicScene.tsx`, line 82

```ts
const from = tile.settleFrom ?? tile.transform
```

The renderer falls back to `tile.transform` if `settleFrom` is absent. There is **no crash** when `settleFrom` is undefined. Tiles received from the server (without `settleFrom`) will render at their final `transform` position with no settle animation — which is the correct behavior for tiles that were placed in a previous session or by another client.

### tryPlaceTile sets settleFrom

File: `apps/client/src/interaction/controller.ts`, lines 183–196

```ts
settleFrom: {
  position: {
    x: ghost.current.position.x,
    y: ghost.current.position.y,
  },
  rotation: ghost.current.rotation + (Math.random() - 0.5) * 0.08,
  mirrored: ghost.current.mirrored,
},
```

`tryPlaceTile` always sets `settleFrom` for locally placed tiles (using the ghost's current animated position as the animation start). Server-synced tiles skip `settleFrom` and go directly to `transform`.

### Answer: Can server TileInstance objects be passed directly to the renderer?

**Yes, safely.** The client's `TileInstance.settleFrom` is optional and the renderer guards with `?? tile.transform`. Server tiles (missing `settleFrom`) will appear at their final position without a placement animation. No type widening adapter is needed — the server type is a strict subset of the client type and TypeScript will accept it at the call sites.

The only difference in the `material` type is that the server uses `MaterialVariant` (from `contracts.ts`) while the client uses a literal union `'ceramic' | 'glass' | 'stone'`. Verify that `MaterialVariant` in `contracts.ts` resolves to the same literals before merging types at the call site.

---

## Topic 2: Zustand store suitability for socket state

### Current state management in App.tsx

File: `apps/client/src/App.tsx`

All state is React `useState`. No zustand import exists anywhere in the client. Relevant state:

```ts
const [tiles, setTiles] = useState<TileInstance[]>([])
```

`setTiles` is called in three places:
- Line ~117: `setTiles((prev) => [...prev, result.placed!])` — functional update, append
- Line ~83: `setTiles((prev) => prev.slice(0, -1))` — functional update, undo
- Line ~148: `setTiles([])` — clear all

### Will React useState work from socket.io event callbacks?

Yes. React `useState` setters are stable references and can be called from outside the React render cycle (timers, event listeners, socket callbacks) without issue. The existing code already does this — keyboard listeners call `setTiles` from a `window.addEventListener('keydown', ...)` handler.

The **critical rule** is to use the **functional update form** (`setTiles(prev => ...)`) inside socket callbacks to avoid stale closures, since the closure captured at socket registration time will not see updated state. The existing `setTiles` call patterns already use this form for append and undo.

Socket event handler pattern that works correctly:

```ts
socket.on('tile:placed', (tile: ServerTileInstance) => {
  setTiles(prev => [...prev, tile])
})
```

### React useState vs Zustand for this integration

| Concern | useState | Zustand |
|---|---|---|
| Works from socket callbacks | Yes (functional update) | Yes |
| Avoids stale closure | Yes (functional update) | Yes (store.getState()) |
| Cross-component sharing | Requires prop drilling | Built-in |
| Current codebase pattern | Used everywhere | Not used at all |
| Complexity | Lower | Higher |

**Recommendation: React useState is sufficient for this integration.** The `App` component is the single owner of `tiles` and passes it down as props. There is no cross-component sharing need. Introducing zustand would be an unnecessary dependency for a use case that `useState` with functional updates already handles correctly. If the codebase later grows to require socket state in multiple unrelated components, zustand can be added then.

---

## Topic 3: Vite proxy configuration

### Current vite.config.ts

File: `apps/client/vite.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
```

**No proxy is configured.** There is no `server.proxy` entry for `/sessions`, `/socket.io`, or any server URL.

### Recommendation for local dev

For socket.io-client, the URL is passed explicitly at connection time (e.g., `io('http://localhost:3001')`), not derived from the page origin. Two options:

**Option A — VITE_SERVER_URL env var (recommended for socket.io)**

Create `apps/client/.env.local`:
```
VITE_SERVER_URL=http://localhost:3001
```

In the sync engine:
```ts
const socket = io(import.meta.env.VITE_SERVER_URL)
```

This is the simplest approach for socket.io-client because socket.io does its own upgrade handshake and benefits from a direct connection to the server port rather than going through a proxy.

**Option B — Vite proxy (for REST endpoints)**

If the integration also adds REST calls to `/sessions` or similar endpoints, add a proxy in `vite.config.ts`:
```ts
server: {
  proxy: {
    '/sessions': 'http://localhost:3001',
    '/socket.io': {
      target: 'http://localhost:3001',
      ws: true,
    },
  },
}
```

This lets the browser call relative URLs without CORS issues during dev.

**Summary:** No proxy currently exists. For socket.io-client, `VITE_SERVER_URL=http://localhost:3001` via env var is the straightforward path. Add a proxy only if REST calls to the server are also needed (to avoid CORS on same-origin relative URLs).

---

## Key Findings Summary

1. **settleFrom is safe to omit**: Server tiles (without `settleFrom`) pass directly to the renderer. The fallback `tile.settleFrom ?? tile.transform` at `MosaicScene.tsx:82` prevents any crash. No adapter required.

2. **React useState is correct**: No zustand is present in the client. `useState` with functional update form (`setTiles(prev => ...)`) works correctly from socket.io event callbacks and matches all existing patterns in `App.tsx`.

3. **No proxy configured**: Add `VITE_SERVER_URL=http://localhost:3001` env var for local dev. Use `import.meta.env.VITE_SERVER_URL` as the socket.io connection URL.

## Follow-on Items

- Verify `MaterialVariant` in `apps/server/src/contracts.ts` equals the client's `'ceramic' | 'glass' | 'stone'` union before treating the server type as a direct subtype.
- Consider whether to add a shared `TileInstance` type in a shared package (`packages/` or similar) to avoid the divergence risk long-term.
