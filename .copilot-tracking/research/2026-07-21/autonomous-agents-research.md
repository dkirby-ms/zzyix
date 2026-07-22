<!-- markdownlint-disable-file -->
# Task Research: Autonomous Tile-Placing Agents

Non-human agents that autonomously place tiles and build mosaic art in the zzyix multi-user collaborative mosaic app.

## Task Implementation Requests

* Explore possible ways to implement autonomous agents that place tiles in the mosaic app
* Agents should behave as participants in collaborative sessions alongside human users
* Agents should be able to build mosaic art autonomously with some artistic intent

## Scope and Success Criteria

* Scope: All layers of the stack — server-side bot services, protocol integration, placement strategy, and artistic goal modeling
* Assumptions:
  * Agents connect through the existing Socket.IO protocol (same as human clients)
  * The server's `placementSolver` remains the authoritative validation layer
  * Agents may use the `placementSolver` domain module for client-side pre-validation before emitting events
  * Multiple agent architectures (rule-based, LLM-driven, image-guided) are viable
* Success Criteria:
  * One recommended implementation approach selected with rationale
  * All integration points with existing codebase identified (with file/line references)
  * Placement strategy options evaluated (random fill, image tracing, LLM-guided, etc.)
  * Hosting/deployment considerations addressed
  * Security and rate-limiting concerns identified

## Outline

1. Protocol integration — how agents connect and emit `place_tile` events
2. Placement strategy — how agents decide where and what to place
3. Artistic intent modeling — how agents target a visual goal
4. Agent service architecture — where agents run (server plugin, standalone service, edge worker)
5. LLM/AI integration options — LLM as strategy planner vs. reactive placer
6. Rate limiting and fairness — preventing agent tile-spam
7. Selected approach with implementation plan

## Potential Next Research

* Socket.IO authentication flow for programmatic clients
  * Reasoning: Agents need `sessionId` and `clientId` — need to understand how these are validated
  * Reference: apps/server/src/index.ts connection auth handling
* Placement strategy algorithms for mosaic packing
  * Reasoning: Agents need a non-trivial strategy to build visually coherent art
  * Reference: apps/client/src/domain/placementSolver.ts and tileGeometry.ts
* LLM tool-calling patterns for spatial tasks
  * Reasoning: One approach uses an LLM with tool-calling to decide placements
  * Reference: External — OpenAI function calling, Anthropic tool use
* Image-to-mosaic conversion algorithms
  * Reasoning: A reference image can drive pixel-to-tile mapping for artistic output
  * Reference: External — color quantization, nearest-neighbor tile matching

## Research Executed

### File Analysis

* apps/server/src/contracts.ts
  * `PlaceTilePayload` (line 239): `{ expectedRevision?, tileId, shape, color, material, transform }`
  * `PlaceTileAck` (line 266): `{ placed: TileInstance; rejected: false; opSeq; newRevision }` OR `{ placed: null; rejected: true; reason }`
  * `PlaceTileRejectReason` (line 259): OUT_OF_BOUNDS | OVERLAP | GAP_TOO_LARGE | PLACEMENT_REJECTED | REQUEST_HASH_MISMATCH | DUPLICATE_OPERATION | STALE_REVISION | OUT_OF_ORDER_REVISION
  * `SocketData` (line 230): per-socket metadata is just `{ clientId, sessionId }`
  * Socket.IO event map `ClientToServerEvents` (line 412): `place_tile(payload, ack)` and `remove_tile(payload, ack)`
  * Canvas bounds default: minX=-5.2, maxX=5.2, minY=-3.4, maxY=3.4 (10.4 × 6.8 world units)
  * `SCHEMA_VERSION = '1.0.0'` — agents must match this

* apps/server/src/index.ts
  * `ConnectionAuth` requires `sessionId` and `clientId` — agents need both
  * Sessions are tracked in a `Map<string, AuthoritativeSessionState>` — agents are first-class participants
  * Tile shapes: `square | triangle | rectangle | l-shape`
  * Material variants: `ceramic | glass | stone`
  * Server uses `@socket.io/postgres-adapter` for multi-instance sync

* apps/client/src/domain/placementSolver.ts
  * `validatePlacement(tiles, candidate, policy)` — can be called before emitting to pre-screen placements
  * `solveGuidedPlacement(...)` — suggests corrected transforms with magnet-snapping
  * `MAX_GROUT_GAP = 0.22` — tiles must be within 0.22 units of an existing tile (or wall) to be accepted
  * `defaultBounds` — { minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4 }

* apps/client/src/network/useSocketConnection.ts
  * Client connects: `io(serverUrl, { auth: { sessionId, clientId }, transports: ['websocket', 'polling'] })`
  * Listens to: `session_snapshot`, `tile_placed`, `tile_removed`, `chunk_snapshot`, etc.
  * Agents can replicate this pattern in pure Node.js without React

* apps/client/src/network/session.ts
  * `createSession()` — POST /sessions → returns `{ session: { id: string } }`
  * `listSessions()` — GET /sessions → returns session summaries
  * Agents can call these REST endpoints to join or create sessions

### Project Conventions

* TypeScript throughout (strict mode likely), Node.js server, React client
* Monorepo with pnpm workspaces (package.json at root)
* Server runs on port 3001, client on 5173 (per process-hygiene notes)

## Key Discoveries

### Protocol Integration Points

An autonomous agent is a **Socket.IO client** that:
1. Calls `POST /sessions` or `GET /sessions` (REST) to obtain a `sessionId`
2. Generates a `clientId` (UUID)
3. Connects via `io(serverUrl, { auth: { sessionId, clientId } })`
4. Listens to `session_snapshot` and `tile_placed`/`tile_removed` to maintain local canvas state
5. Emits `place_tile(payload, ack)` when the strategy selects a placement

The existing `placementSolver.ts` module (apps/client/src/domain/placementSolver.ts) can be imported directly by a Node.js bot service to pre-validate placements before emitting, reducing server rejections.

### Tile Placement Constraints

* Tiles must be within canvas bounds (10.4 × 6.8 world units)
* No overlap with settled tiles
* Edge-to-edge gap ≤ 0.22 (grout gap rule — tiles must be close to something)
* This means agents cannot place floating isolated tiles; each tile must be near the boundary or another tile

### Placement Strategy Landscape

The grout gap constraint is key for agent design — agents must place tiles touching or near existing tiles or the canvas boundary. This naturally evolves the mosaic from the edges inward, or expanding clusters.

## Technical Scenarios

### Scenario A: Server-Side Bot Plugin

A bot service runs inside the server process (or as a separate microservice) and uses `socket.io-client` to participate in sessions.

**Requirements:**
* Node.js bot that connects via socket.io-client
* Imports `placementSolver` for pre-validation
* Maintains local canvas state replica
* Runs a timer/loop to emit placements at a configured rate

**Preferred Approach:**
* Implement as a standalone `apps/bot/` package in the monorepo
* Bot connects as a regular Socket.IO client — no server-side changes required
* Configurable via env vars: `SESSION_ID`, `PLACEMENT_RATE_MS`, `STRATEGY`, `PALETTE`

```text
apps/
  bot/
    src/
      index.ts        ← entry point, connects to server
      strategy/
        randomFill.ts ← random valid placement
        imageFill.ts  ← image-guided placement
        llmFill.ts    ← LLM-guided placement
      canvas.ts       ← local canvas state replica
      placer.ts       ← emits place_tile with retry/backoff
    package.json
    tsconfig.json
```

**Implementation Details:**

The bot connects identically to the React client but without UI:

```typescript
import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'

const sessionId = process.env.SESSION_ID!
const clientId = uuidv4()

const socket = io(serverUrl, {
  auth: { sessionId, clientId },
  transports: ['websocket'],
})

socket.on('session_snapshot', (snapshot) => {
  // Populate local tile state replica
  localTiles = snapshot.tiles
})

socket.on('tile_placed', (payload) => {
  localTiles.push(payload.tile)
})
```

Then a placement loop:

```typescript
setInterval(async () => {
  const placement = strategy.suggestNext(localTiles, bounds)
  if (!placement) return

  const tileId = uuidv4()
  socket.emit('place_tile', { tileId, ...placement }, (ack) => {
    if (ack.rejected) {
      // Adjust strategy based on rejection reason
    }
  })
}, PLACEMENT_RATE_MS)
```

#### Considered Alternatives

* **Server-side scheduled job**: Bots run inside the server process. Rejected — tight coupling, restarts affect all bots.
* **Edge worker / Cloudflare Worker**: Too constrained for stateful socket connections.

---

### Scenario B: Placement Strategy — Rule-Based Packing

A deterministic agent fills the canvas systematically using geometric reasoning.

**Approach:**
* Maintain a frontier of candidate positions (positions adjacent to existing tiles)
* Score each candidate by how well it fits (minimize gaps, maximize coverage)
* Select best-scoring candidate and place a tile

```typescript
function suggestNext(tiles: TileInstance[], bounds: MosaicBounds): PlacementCandidate | null {
  const frontier = computeFrontier(tiles, bounds)
  return frontier.sort((a, b) => b.score - a.score)[0] ?? null
}
```

Advantages: deterministic, fast, no external dependencies, produces dense mosaics.
Limitations: not artistically directed — produces uniform fill patterns.

---

### Scenario C: Placement Strategy — Image-Guided

Agent uses a target reference image to guide tile color and placement.

**Approach:**
1. Load a reference image (e.g., PNG) and downsample to canvas grid resolution
2. Map each pixel region to the nearest tile color in the palette
3. Place tiles whose colors best match the target image region

```typescript
const targetPixels = sampleImage(referenceImage, CANVAS_WIDTH, CANVAS_HEIGHT, GRID_RESOLUTION)

function suggestNext(tiles, bounds) {
  const uncoveredRegions = getUncoveredRegions(tiles, targetPixels)
  return uncoveredRegions.map(region => ({
    position: region.center,
    color: closestPaletteColor(region.targetColor),
    shape: bestFitShape(region),
  }))[0]
}
```

Advantages: produces recognizable mosaic art from a source image.
Tools needed: `sharp` or `jimp` for Node.js image processing.

---

### Scenario D: LLM-Guided Agent

An LLM (e.g., GPT-4o, Claude) acts as a high-level planner, issuing placement decisions based on the current canvas state.

**Approach:**
* Serialize canvas state as a JSON snapshot or ASCII art description
* Send to LLM with a system prompt describing the artistic goal
* LLM returns a sequence of tile placements as tool calls or structured JSON
* Bot executor validates and emits each placement

```typescript
const canvasDescription = serializeCanvasToText(localTiles)
const llmResponse = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a mosaic artist. Place tiles to create a sunset landscape...' },
    { role: 'user', content: canvasDescription },
  ],
  tools: [placeTileTool],
})
```

Advantages: artistically flexible, can describe complex visual goals in natural language.
Limitations: slow (LLM latency), expensive (API costs), not guaranteed spatially accurate.

Best used for: **high-level artistic direction** (palette selection, theme, composition) with a rule-based executor doing the actual spatial placement.

---

### Scenario E: Hybrid — LLM Director + Rule-Based Executor

**Selected Approach**

LLM decides *what* to paint (theme, color scheme, regions), rule-based executor decides *where* tiles go.

```
┌──────────────────────────────────────────────────────┐
│                    Bot Service                        │
│                                                       │
│  ┌─────────────┐     ┌──────────────┐                │
│  │ LLM Director│────▶│ Rule-Based   │────▶ Socket.IO │
│  │ (theme/plan)│     │  Executor    │      place_tile │
│  └─────────────┘     │ (placement)  │                │
│                      └──────────────┘                │
│                             ▲                        │
│                      ┌──────┴───────┐                │
│                      │ Canvas State │                │
│                      │  Replica     │                │
│                      └──────────────┘                │
└──────────────────────────────────────────────────────┘
```

The LLM Director runs infrequently (once per session start, or when a new artistic phase begins) and outputs a **plan document** describing regions, palettes, and shapes. The executor runs in a tight loop, picking the next physically valid placement that advances the plan.

This avoids LLM latency on every tile while still allowing rich artistic expression.

## Confirmed Architecture Details (from subagent research)

### Connection Auth (verified from server source)
```typescript
// apps/server/src/index.ts — socket.handshake.auth shape:
// ConnectionAuth = { sessionId: string, clientId: string }
// No token or secret required — any valid UUID for clientId is accepted
```

### Server-Side Validation (confirmed)
* Server imports `validatePlacement` from `apps/server/src/domain/placementSolver.ts` (line ~49 in index.ts)
* The server copy has the same exports as the client copy — bots can import from either
* `expectedRevision` is optional for simple bots; advanced bots should track it to avoid `STALE_REVISION`

### Monorepo Facts
* npm workspaces: `apps/client` + `apps/server` (no `apps/bot` yet)
* `socket.io-client ^4.8.2` already in `apps/client/package.json`
* Server is ESM `"type": "module"` with TypeScript ~7.0.2
* `node-cron` already in server for the jobs pattern (if implementing as server plugin)

### Canvas Grid Math
* Canvas: 10.4 × 6.8 world units → ~11 × 7 tile grid (tile unit ≈ 0.88)
* Image-to-mosaic: downscale to 64×42 px → 11×7 cells, map cell → world coordinates
* `MAX_GROUT_GAP = 0.22` — ~25% of a tile unit; tiles must contact boundary or existing tiles

### Rate Limiting Design
* Token bucket: capacity=3, refill=0.5 tok/s → 1 tile per 2 seconds average
* Backoff strategy:
  * `STALE_REVISION` / `OUT_OF_ORDER_REVISION` → 200ms × 2^attempt + jitter
  * `OVERLAP` / `GAP_TOO_LARGE` → retry immediately with new position
* Multi-bot coordination: partition canvas into N vertical slices, one per bot instance

### Color/Artistic Design
* Analogous palette: ±30° HSL hue variation around a base color
* Cluster-aware color: 75% inherit from nearest neighbor tile, 25% pick from palette
* Progressive fill order: boundary ring → structural lines → region fill → accent tiles
* Material mix: ~70% ceramic / 20% glass / 10% stone

## Recommended First Implementation

**Frontier BFS fill with analogous palette** — boundary-seeded BFS expansion with HSL color clustering.

* Produces visually compelling output with no external API dependencies
* ~300–400 lines of TypeScript
* Dependencies: `socket.io-client`, `uuid` only
* Can be extended later with `sharp` (image fill) and LLM API (artistic direction)

### Placement Algorithm

```typescript
// 1. Seed frontier from boundary positions (corners, edges)
// 2. BFS expand: for each frontier position, try all tile shapes + rotations
// 3. Pre-validate locally with validatePlacement() — skip to next if invalid
// 4. Emit place_tile with token-bucket rate limiting
// 5. On ack: push new tile to local state, add adjacent positions to frontier

function computeNextPlacement(localTiles: TileInstance[], bounds: MosaicBounds): PlacementCandidate | null {
  const frontier = buildFrontier(localTiles, bounds)  // positions adjacent to existing tiles
  for (const pos of frontier) {
    for (const variant of tileVariants()) {  // shape × rotation × mirrored
      const result = validatePlacement(variant.shape, { position: pos, ...variant }, localTiles, bounds)
      if (result.valid) return { ...variant, position: pos }
    }
  }
  return null
}
```

## Next Steps for Implementation

1. Create `apps/bot/package.json` as a new npm workspace with `socket.io-client`, `uuid` as dependencies
2. Add shared type import path: `../../apps/server/src/contracts.ts` (or copy types)
3. Implement `src/canvas.ts` — local state replica (snapshot + tile_placed events)
4. Implement `src/rate-limiter.ts` — token bucket with typed rejection reason backoff
5. Implement `src/strategy/frontierFill.ts` — BFS frontier + analogous palette
6. Implement `src/bot.ts` — main entry: connect, seed strategy, loop
7. Add `strategy/imageFill.ts` with `sharp` for image-guided art (Phase 2)
8. Add `strategy/llmDirector.ts` for LLM artistic direction using ASCII grid encoding (Phase 3)
9. Wire into `docker-compose.yaml` as optional `bot` service with env vars

## Open Questions for User

1. Should the bot live in `apps/bot/` (monorepo workspace) or `scripts/`?
2. Should the bot create its own session or accept a `SESSION_ID` env var to join an existing session?
3. Is there a convention for LLM API keys in this project (`.env.example`)?
4. Should multiple bot instances be supported (canvas partitioning)?
5. Should the bot ever call `remove_tile` (e.g., for strategic repositioning)?

## Security Considerations

* Bot clients are treated identically to human clients — server already validates all placements
* `clientId` should be a fresh `crypto.randomUUID()` per session (same as human clients)
* No changes needed to auth flow — bots use the same `{ sessionId, clientId }` auth
* Self-throttle via token bucket to avoid flooding; server's idempotency layer handles retries safely
* Avoid storing LLM API keys in the Docker image — use env vars or secrets manager
* `GET /sessions` appears unauthenticated; bot should validate the session exists before connecting
