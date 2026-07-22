# Autonomous Mosaic Agent Strategy Research

**Date:** 2026-07-21
**Status:** Complete
**Topic:** Implementation patterns for autonomous artistic tile-placing agents in zzyix

---

## Codebase Facts (from source analysis)

| Property | Value |
|---|---|
| Canvas world size | 10.4 × 6.8 (minX=-5.2, maxX=5.2, minY=-3.4, maxY=3.4) |
| Tile unit constant | 0.88 world units |
| Square tile footprint | ~0.88 × 0.88 |
| Rectangle footprint | ~1.197 × 0.634 |
| Triangle inscribed box | ~1.02 × 0.97 |
| L-shape bounding box | ~1.091 × 1.091 |
| MAX_GROUT_GAP | 0.22 world units |
| Rotation quantized | quarter-turns: 0, π/2, π, 3π/2 |
| Bot connection | Socket.IO with `{ sessionId, clientId }` in `handshake.auth` |
| Placement event | `place_tile` → `PlaceTileAck` |
| Reject reasons | `OUT_OF_BOUNDS`, `OVERLAP`, `GAP_TOO_LARGE`, `STALE_REVISION` |

**PlaceTilePayload shape:**
```typescript
{
  tileId: string        // client-generated UUID
  shape: 'square' | 'triangle' | 'rectangle' | 'l-shape'
  color: string         // hex
  material: 'ceramic' | 'glass' | 'stone'
  transform: {
    position: { x: number, y: number }
    rotation: number    // use quantized: 0, π/2, π, 3π/2
    mirrored?: boolean
  }
}
```

---

## Research Question 1: LLM Tool-Calling for Spatial/Artistic Tasks

### Patterns

**LLM as Artistic Director, Not Pixel Placer**

The key insight from production LLM agent work (2024-2025) is that LLMs are expensive per-call
and bad at precise arithmetic. The right split is:

- LLM = high-level intent: "Fill the top-left quadrant with warm sunset colors radiating from top-right"
- Deterministic code = tile-by-tile execution of that intent

This maps naturally to OpenAI tool-calling / Anthropic tool_use: the LLM returns a structured
"directive" and a loop executes it.

### Encoding Canvas State Efficiently

A canvas with 400 tiles cannot be naively JSON-encoded into an LLM prompt (too many tokens).
Efficient options:

**Option A — Grid summary (recommended for first implementation):**
```typescript
// Divide canvas into a coarse NxM grid, report per-cell fill %
function summarizeCanvas(tiles: TileInstance[], gridW = 10, gridH = 7): string {
  const cellW = 10.4 / gridW  // ~1.04 world units per cell
  const cellH = 6.8 / gridH   // ~0.97 world units per cell
  const grid: number[][] = Array.from({ length: gridH }, () => new Array(gridW).fill(0))
  for (const tile of tiles) {
    const gx = Math.floor((tile.transform.position.x + 5.2) / cellW)
    const gy = Math.floor((tile.transform.position.y + 3.4) / cellH)
    if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) grid[gy][gx]++
  }
  // Encode as ASCII art: ' ' = empty, '.' = sparse, '#' = dense
  return grid.map(row =>
    row.map(n => n === 0 ? ' ' : n < 3 ? '.' : '#').join('')
  ).join('\n')
}
// Tokens: ~100 for a 10×7 grid vs ~5000 for 400 raw tile objects
```

**Option B — Color histogram:**
```typescript
function dominantColors(tiles: TileInstance[]): string {
  const counts = new Map<string, number>()
  for (const t of tiles) counts.set(t.color, (counts.get(t.color) ?? 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  return sorted.map(([c, n]) => `${c}×${n}`).join(', ')
}
```

**Option C — Quadrant mask:**
Reduce to a 2×2 or 4×4 region fill percentage as natural language:
`"Top-left 40% full, bottom-right 5% full"`

### Prompt Engineering for Mosaic Composition

**System prompt:**
```
You are an artistic director for a mosaic tile installation.
The canvas is 10.4 wide × 6.8 tall, with origin at center.
Tiles are ~0.88 units wide. New tiles must touch existing tiles.

You return placement directives as JSON tool calls.
Each directive targets a REGION (bounding box) and specifies:
  - A color palette (3-6 hex values)
  - A shape preference ('square' | 'triangle' | 'rectangle' | 'l-shape' | 'mixed')
  - A fill pattern ('solid' | 'gradient_lr' | 'gradient_tb' | 'random' | 'diagonal')
  - A density (0.5 - 1.0 fraction of region to fill)
```

**Tool schema for GPT-4o / Claude:**
```json
{
  "name": "queue_placement_directive",
  "description": "Queue a region of the canvas to be filled with tiles matching artistic intent",
  "parameters": {
    "type": "object",
    "required": ["region", "palette", "shape", "pattern"],
    "properties": {
      "region": {
        "type": "object",
        "description": "Bounding box in world coordinates",
        "properties": {
          "minX": {"type": "number", "minimum": -5.2, "maximum": 5.2},
          "maxX": {"type": "number", "minimum": -5.2, "maximum": 5.2},
          "minY": {"type": "number", "minimum": -3.4, "maximum": 3.4},
          "maxY": {"type": "number", "minimum": -3.4, "maximum": 3.4}
        }
      },
      "palette": {
        "type": "array",
        "items": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
        "minItems": 1,
        "maxItems": 8
      },
      "shape": {"type": "string", "enum": ["square", "triangle", "rectangle", "l-shape", "mixed"]},
      "pattern": {"type": "string", "enum": ["solid", "gradient_lr", "gradient_tb", "random", "diagonal_ne", "diagonal_nw"]},
      "density": {"type": "number", "minimum": 0.3, "maximum": 1.0},
      "material": {"type": "string", "enum": ["ceramic", "glass", "stone", "mixed"]}
    }
  }
}
```

**User prompt template:**
```
Current canvas state:
  Fill grid (10×7 cells, ' '=empty '.'=sparse '#'=dense):
  [ASCII_GRID]
  Dominant colors: [COLOR_HISTOGRAM]
  Total tiles: [N]
  Canvas coverage: [PCT]%

Theme: "sunset over water"

Return 1-3 placement directives to advance this mosaic toward the theme.
Focus on the least-filled regions first.
```

### Cost Management for Long-Running Agents

- **LLM call frequency**: Once every 20-50 tile placements, not per-tile.
- **Directive queue**: LLM generates a batch of directives; deterministic code drains the queue.
- **Caching**: If the canvas hasn't changed significantly (< 5% new coverage), reuse last directives.
- **Model selection**: Use `gpt-4o-mini` (~$0.15/1M input tokens) for canvas summaries;
  only escalate to `gpt-4o` for the initial theme interpretation.
- **Estimated cost**: 50 LLM calls × 500 tokens avg = 25K tokens = ~$0.004 for a full session.

### Recommended npm packages
- `openai@^4.x` — GPT-4o tool-calling
- `@anthropic-ai/sdk@^0.x` — Claude tool_use
- `zod@^3.x` — Schema validation for LLM responses (prevents malformed directives crashing the bot)

---

## Research Question 2: Image-to-Mosaic Algorithms

### Overview

Image-to-mosaic converts reference image pixels → candidate tile positions on a world-coordinate grid.

### Color Quantization

**k-means (recommended, simple):**
```typescript
// Reduce image to k dominant colors using iterative k-means
// sharp reads pixel buffer; then cluster by (r,g,b) distance
import sharp from 'sharp'

async function quantizeImage(path: string, k = 12): Promise<Array<{color: string, weight: number}>> {
  const { data, info } = await sharp(path)
    .resize(64, 42)          // Downscale to ~canvas tile grid resolution
    .raw()
    .toBuffer({ resolveWithObject: true })
  
  // Extract RGB samples
  const pixels: [number, number, number][] = []
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push([data[i], data[i+1], data[i+2]])
  }
  
  // Simple k-means (3 iterations, k=12 is sufficient for mosaic palette)
  let centroids = pixels.slice(0, k)
  for (let iter = 0; iter < 3; iter++) {
    const clusters = Array.from({ length: k }, () => ({ sum: [0,0,0], count: 0 }))
    for (const [r,g,b] of pixels) {
      let minDist = Infinity, best = 0
      for (let j = 0; j < k; j++) {
        const d = Math.hypot(r-centroids[j][0], g-centroids[j][1], b-centroids[j][2])
        if (d < minDist) { minDist = d; best = j }
      }
      clusters[best].sum[0] += r; clusters[best].sum[1] += g; clusters[best].sum[2] += b
      clusters[best].count++
    }
    centroids = clusters.map(c => c.count > 0
      ? [c.sum[0]/c.count, c.sum[1]/c.count, c.sum[2]/c.count] as [number,number,number]
      : centroids[0])
  }
  
  return centroids.map(([r,g,b]) => ({
    color: `#${Math.round(r).toString(16).padStart(2,'0')}${Math.round(g).toString(16).padStart(2,'0')}${Math.round(b).toString(16).padStart(2,'0')}`,
    weight: 1
  }))
}
```

**Median cut** (alternative, more balanced coverage): recursively bisect the color space; each leaf
becomes one palette color. Produces better distribution but more complex to implement.

### Grid Mapping: Pixel → Tile Position

The canvas is 10.4 × 6.8 world units. At tile unit = 0.88, the grid is approximately:
- Columns: floor(10.4 / 0.88) = **11** columns (with small margin)
- Rows: floor(6.8 / 0.88) = **7** rows

```typescript
const TILE_UNIT = 0.88
const CANVAS_W = 10.4, CANVAS_H = 6.8
const COLS = Math.floor(CANVAS_W / TILE_UNIT)  // 11
const ROWS = Math.floor(CANVAS_H / TILE_UNIT)  // 7

function imageToTileGrid(imagePath: string): Promise<Array<{x: number, y: number, color: string}>> {
  // 1. Load image, downscale to COLS × ROWS
  // 2. Sample each cell's dominant color
  // 3. Map grid (col, row) → world (x, y)
  //    x = -CANVAS_W/2 + (col + 0.5) * TILE_UNIT
  //    y = -CANVAS_H/2 + (row + 0.5) * TILE_UNIT
}
```

### Non-Square Tile Handling

For grid mapping, treat all tile types as having the same cell size (0.88 × 0.88) but vary the
shape by visual characteristics of the source region:

- **High-contrast edges** → triangle tiles (directional, evokes detail)
- **Flat solid areas** → square tiles (efficient fill)
- **Horizontal bands** → rectangle tiles (landscape layers, horizon)
- **Corner transitions** → l-shape tiles

**Edge detection approach:**
```typescript
// After loading pixel data at grid resolution, compute local gradient magnitude
function detectEdgeStrength(pixels: Uint8Array, col: number, row: number, cols: number): number {
  const i = (row * cols + col) * 3
  const right = col < cols - 1 ? (row * cols + col + 1) * 3 : i
  const down = row < (pixels.length / (cols * 3)) - 1 ? ((row+1) * cols + col) * 3 : i
  const dx = Math.abs(pixels[i] - pixels[right]) + Math.abs(pixels[i+1] - pixels[right+1]) + Math.abs(pixels[i+2] - pixels[right+2])
  const dy = Math.abs(pixels[i] - pixels[down]) + Math.abs(pixels[i+1] - pixels[down+1]) + Math.abs(pixels[i+2] - pixels[down+2])
  return (dx + dy) / (255 * 6)  // normalized 0-1
}
// edgeStrength > 0.3 → 'triangle', else 'square'
```

### Grout Gap Constraint with Image Guidance

The image provides ideal target positions, but the bot must still satisfy the grout gap constraint.
Strategy: when an image-guided position fails validation, search the 8-neighborhood (offset by 0.1
world units in each direction) for a valid position. If still no valid position, skip to the next
grid cell.

```typescript
const SEARCH_OFFSETS = [
  {dx: 0, dy: 0},
  {dx: 0.1, dy: 0}, {dx: -0.1, dy: 0},
  {dx: 0, dy: 0.1}, {dx: 0, dy: -0.1},
  {dx: 0.08, dy: 0.08}, {dx: -0.08, dy: 0.08}
]
```

### Recommended npm packages
- `sharp@^0.33.x` — Fastest Node.js image processing (native binding, resizes, raw buffer access)
- `jimp@^1.x` — Pure JS alternative (no native deps, slower, works in more environments)
- `canvas@^2.x` — Node.js Canvas API (closest to browser API, good for procedural generation)

**Recommendation**: `sharp` for production bots (performance), `jimp` for development/testing.

---

## Research Question 3: Rule-Based Mosaic Packing Algorithms

### Frontier-Based Placement (BFS-like expansion)

This is the most natural algorithm for satisfying the grout gap constraint. Start from seed
tiles (e.g., placed at boundary corners) and expand outward.

```typescript
type CandidatePosition = { x: number; y: number; parentId: string }

class FrontierPlacer {
  private frontier: CandidatePosition[] = []
  private placed: Set<string> = new Set()  // "x:y" keys for deduplication

  seed(boundaryTiles: TileInstance[]) {
    for (const tile of boundaryTiles) {
      this.frontier.push(...this.neighborsOf(tile))
    }
  }

  private neighborsOf(tile: TileInstance): CandidatePosition[] {
    const { x, y } = tile.transform.position
    const step = TILE_UNIT  // 0.88
    return [
      { x: x + step, y, parentId: tile.id },
      { x: x - step, y, parentId: tile.id },
      { x, y: y + step, parentId: tile.id },
      { x, y: y - step, parentId: tile.id },
    ].filter(c => {
      const key = `${c.x.toFixed(2)}:${c.y.toFixed(2)}`
      return !this.placed.has(key)
    })
  }

  next(): CandidatePosition | null {
    // Pop with priority: prefer positions closer to a target region
    return this.frontier.shift() ?? null
  }
}
```

**Complexity**: O(N) where N = total canvas fill. Frontier size at any time: O(sqrt(N)) — the
perimeter of the filled region. Very memory efficient.

### Greedy Packing for Irregular Shapes

For non-square shapes, use a placement attempt sequence: try the "natural" rotation first,
then rotate/mirror systematically, take the first valid result.

```typescript
const ROTATION_VARIANTS = [0, Math.PI/2, Math.PI, 3*Math.PI/2]
const MIRROR_VARIANTS = [false, true]

function tryPlace(
  shape: TileShape,
  position: Vec2,
  settled: TileInstance[],
  bounds: MosaicBounds
): Transform2D | null {
  for (const rotation of ROTATION_VARIANTS) {
    for (const mirrored of MIRROR_VARIANTS) {
      const transform: Transform2D = { position, rotation, mirrored }
      const result = validatePlacement(shape, transform, settled, bounds)
      if (result.valid) return transform
    }
  }
  return null  // no valid variant at this position
}
```

**With correction vector**: The `validatePlacement` function returns a `correction` Vec2.
Apply it before retrying: `{ x: position.x + correction.x, y: position.y + correction.y }`.
This turns a near-valid placement into a valid one.

### Randomized Fill with Aesthetic Constraints

Pure random is chaotic; add constraints for aesthetics:

```typescript
interface FillOptions {
  palette: string[]           // Color pool
  shapeWeights: Record<TileShape, number>  // e.g. {square:4, triangle:2, rectangle:2, 'l-shape':1}
  rotationBias?: number       // Prefer certain orientations (e.g. 0 for grid-aligned)
  clusterRadius?: number      // Cluster same colors within this radius
}

function pickColor(position: Vec2, opts: FillOptions, settled: TileInstance[]): string {
  if (opts.clusterRadius && Math.random() < 0.7) {
    // 70% chance to match a nearby tile's color (creates clusters)
    const nearby = settled.filter(t =>
      Math.hypot(t.transform.position.x - position.x, t.transform.position.y - position.y)
      < opts.clusterRadius!
    )
    if (nearby.length > 0) {
      return nearby[Math.floor(Math.random() * nearby.length)].color
    }
  }
  return opts.palette[Math.floor(Math.random() * opts.palette.length)]
}

function weightedShape(weights: Record<TileShape, number>): TileShape {
  const total = Object.values(weights).reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (const [shape, w] of Object.entries(weights) as [TileShape, number][]) {
    r -= w; if (r <= 0) return shape
  }
  return 'square'
}
```

### Space-Filling Curves as Traversal Strategies

**Hilbert curve traversal** visits grid cells in an order that preserves spatial locality —
adjacent cells in curve order are nearby on the canvas. This produces visually coherent
fill patterns.

```typescript
// 2D Hilbert curve index → (x, y) at order n
function hilbertToXY(n: number, order: number): { x: number; y: number } {
  let rx, ry, s, d = n, x = 0, y = 0
  for (s = 1; s < order; s *= 2) {
    rx = 1 & (d / 2)
    ry = 1 & (d ^ rx)
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y }
      const t = x; x = y; y = t
    }
    x += s * rx; y += s * ry
    d = Math.floor(d / 4)
  }
  return { x, y }
}

// Generate traversal order for COLS × ROWS grid
function hilbertOrder(cols: number, rows: number): Array<{x: number, y: number}> {
  const order = Math.pow(2, Math.ceil(Math.log2(Math.max(cols, rows))))
  const cells: Array<{x: number, y: number}> = []
  for (let i = 0; i < order * order; i++) {
    const {x, y} = hilbertToXY(i, order)
    if (x < cols && y < rows) cells.push({x, y})
  }
  return cells
}
```

**Z-order (Morton curve)** is simpler to implement and still provides locality:
```typescript
function zorderToXY(z: number): {x: number, y: number} {
  let x = 0, y = 0
  for (let i = 0; i < 16; i++) {
    x |= ((z >> (2*i)) & 1) << i
    y |= ((z >> (2*i+1)) & 1) << i
  }
  return {x, y}
}
```

**Recommendation**: Z-order for simplicity; Hilbert for better visual locality. For an artistic
bot, the traversal order is mainly relevant when filling large solid regions — the difference
is subtle to human observers.

### Complexity Summary

| Algorithm | Time | Space | Visual Quality |
|---|---|---|---|
| Frontier BFS | O(N) | O(sqrt(N)) | Good — follows form |
| Image grid mapping | O(N) | O(COLS×ROWS) | Excellent — reference-guided |
| Random fill | O(N×R) R=retries | O(1) | Moderate — needs color constraints |
| Hilbert traversal | O(N log N) setup | O(N) | Good — coherent fill |
| Z-order traversal | O(N) | O(N) | Good — simpler |

---

## Research Question 4: Rate Limiting and Bot Fairness

### Token Bucket Rate Limiter in TypeScript

```typescript
class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private capacity: number,      // max burst: e.g. 5 tiles
    private refillRate: number,    // tokens per second: e.g. 0.5 (1 tile per 2s)
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  consume(count = 1): boolean {
    this.refill()
    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }
    return false
  }

  waitMs(): number {
    this.refill()
    if (this.tokens >= 1) return 0
    return Math.ceil((1 - this.tokens) / this.refillRate * 1000)
  }

  private refill() {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }
}

// Usage: 1 tile per 2 seconds, burst up to 3
const rateLimiter = new TokenBucket(3, 0.5)

async function placeTileThrottled(socket: Socket, payload: PlaceTilePayload): Promise<PlaceTileAck> {
  const wait = rateLimiter.waitMs()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  return new Promise(resolve => socket.emit('place_tile', payload, resolve))
}
```

**Leaky bucket variant** (constant output rate, discards overflow) is better for strict fairness
but overkill for a single bot. Token bucket is the right choice here.

### Exponential Backoff on Rejection

```typescript
async function placeWithRetry(
  socket: Socket,
  buildPayload: (attempt: number) => PlaceTilePayload,
  maxAttempts = 5
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const payload = buildPayload(attempt)
    const ack = await placeTileThrottled(socket, payload)

    if (!ack.rejected) return true  // success

    // Categorize rejection:
    if (ack.reason === 'STALE_REVISION' || ack.reason === 'OUT_OF_ORDER_REVISION') {
      // Concurrency conflict — wait for server broadcast to update local state
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)))  // 200, 400, 800...
      continue
    }
    if (ack.reason === 'OVERLAP' || ack.reason === 'GAP_TOO_LARGE') {
      // Spatial conflict — try a different position immediately (no delay)
      continue
    }
    if (ack.reason === 'OUT_OF_BOUNDS') {
      return false  // Never retry out-of-bounds; fix the position logic
    }
    // Unknown — back off
    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)))
  }
  return false
}
```

### Self-Throttling Recommendations

| Scenario | Target Rate | Rationale |
|---|---|---|
| Solo bot (demo session) | 0.5-1 tile/s | Allows human participants to see progress |
| Competitive fill | 2 tile/s | Aggressive but not server-flooding |
| Background fill (low priority) | 0.2 tile/s | 1 tile per 5s, barely noticeable |

**Key**: The server performs in-memory validation synchronously; the DB write is async. Rate-limiting
to ≤2 tiles/s per bot instance avoids lock contention in the DB and keeps the server load low.

### Multi-Bot Coordination (Same Session)

When multiple bot instances target the same session, spatial partition them to avoid conflicts:

```typescript
// Each bot instance gets a canvas region based on its instance index
function getMyRegion(botIndex: number, botCount: number): MosaicBounds {
  const segmentWidth = 10.4 / botCount
  return {
    minX: -5.2 + botIndex * segmentWidth,
    maxX: -5.2 + (botIndex + 1) * segmentWidth,
    minY: -3.4,
    maxY: 3.4
  }
}
```

**Alternative coordination via Socket.IO rooms**: One "leader" bot subscribes to canvas events
and dispatches work to workers via a separate coordination channel (e.g., a Redis pub/sub).
This is overkill for a first implementation.

### Exponential Backoff Best Practices

- **Base delay**: 200ms (matches typical Socket.IO round-trip)
- **Multiplier**: 2x per attempt
- **Jitter**: Add `Math.random() * baseDelay` to avoid thundering herd when multiple bots retry simultaneously
- **Max delay**: Cap at 10 seconds

```typescript
function backoffMs(attempt: number, base = 200, max = 10000): number {
  const exp = base * Math.pow(2, attempt)
  const jitter = Math.random() * base
  return Math.min(exp + jitter, max)
}
```

---

## Research Question 5: Artistic Style Patterns

### Color Harmony Algorithms

**Complementary colors** (180° apart on HSL hue wheel):
```typescript
function complementary(hex: string): string {
  const hsl = hexToHsl(hex)
  return hslToHex({ h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l })
}
```

**Analogous palette** (colors within ±30° of base hue — looks harmonious, natural):
```typescript
function analogousPalette(baseHex: string, count = 5): string[] {
  const hsl = hexToHsl(baseHex)
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - Math.floor(count / 2)) * 25  // ±25° steps
    return hslToHex({ h: ((hsl.h + offset) + 360) % 360, s: hsl.s, l: hsl.l })
  })
}
```

**Triadic palette** (3 colors at 120° separation):
```typescript
function triadicPalette(baseHex: string): [string, string, string] {
  const hsl = hexToHsl(baseHex)
  return [baseHex, hslToHex({ ...hsl, h: (hsl.h + 120) % 360 }), hslToHex({ ...hsl, h: (hsl.h + 240) % 360 })]
}
```

**Color ramp for gradients** (smooth transition between two colors):
```typescript
function colorRamp(from: string, to: string, steps: number): string[] {
  const a = hexToRgb(from), b = hexToRgb(to)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return rgbToHex(Math.round(a.r + (b.r - a.r) * t), Math.round(a.g + (b.g - a.g) * t), Math.round(a.b + (b.b - a.b) * t))
  })
}
```

### Spatial Clustering for Visual Cohesion

The "paint by neighborhood" rule: each new tile has a high probability of matching a nearby tile's
color and a lower probability of introducing a new color. This creates natural blobs.

```typescript
function clusterAwareColor(
  position: Vec2,
  palette: string[],
  settled: TileInstance[],
  clusterRadius = 1.5,
  inheritProbability = 0.75
): string {
  if (Math.random() < inheritProbability) {
    const nearby = settled.filter(t =>
      Math.hypot(t.transform.position.x - position.x, t.transform.position.y - position.y) < clusterRadius
    )
    if (nearby.length > 0) {
      // Weight by distance: closer tiles more likely to be matched
      const closest = nearby.sort((a, b) =>
        Math.hypot(a.transform.position.x - position.x, a.transform.position.y - position.y) -
        Math.hypot(b.transform.position.x - position.x, b.transform.position.y - position.y)
      )
      return closest[0].color
    }
  }
  return palette[Math.floor(Math.random() * palette.length)]
}
```

### Direction and Flow in Mosaic Art

**Roman tesserae patterns** use tile orientation to guide the eye:
- Tiles along curves are rotated to be tangent to the curve
- Background tiles are laid in contrasting direction (perpendicular to subject)
- This creates "opus vermiculatum" (worm-like outlining) — tiles follow the contour of subjects

For the bot, this translates to: along diagonal fills, prefer 45° rotations (π/4... but the
game quantizes to quarter-turns). The best approximation is alternating 0 and π/2 in a diagonal
checkerboard:

```typescript
function flowRotation(col: number, row: number, direction: 'horizontal' | 'diagonal'): number {
  if (direction === 'horizontal') return 0
  // Diagonal: alternate 0 and π/2 in a checkerboard
  return ((col + row) % 2 === 0) ? 0 : Math.PI / 2
}
```

### Progressive Disclosure: Outline-to-Fill

Build the mosaic in phases for the best visual impact:
1. **Phase 1 — Boundary ring**: Fill the canvas edge first (0.88 world unit margin)
2. **Phase 2 — Structural lines**: Place tiles along key visual lines (horizon, focal point outline)
3. **Phase 3 — Region fill**: Flood-fill each region with the target color
4. **Phase 4 — Detail accents**: Scattered contrasting accent tiles

```typescript
type BotPhase = 'boundary' | 'structure' | 'fill' | 'accent'

function phaseForCoverage(coverage: number): BotPhase {
  if (coverage < 0.08) return 'boundary'
  if (coverage < 0.20) return 'structure'
  if (coverage < 0.85) return 'fill'
  return 'accent'
}

// Boundary ring positions: tiles within TILE_UNIT of canvas edge
function boundaryPositions(): Vec2[] {
  const positions: Vec2[] = []
  const step = TILE_UNIT
  // Top and bottom rows
  for (let x = -5.2 + step/2; x < 5.2; x += step) {
    positions.push({ x, y: -3.4 + step/2 })   // bottom row
    positions.push({ x, y:  3.4 - step/2 })   // top row
  }
  // Left and right columns (excluding corners already added)
  for (let y = -3.4 + step * 1.5; y < 3.4 - step; y += step) {
    positions.push({ x: -5.2 + step/2, y })   // left column
    positions.push({ x:  5.2 - step/2, y })   // right column
  }
  return positions
}
```

### Material Expressiveness

| Material | Visual character | Use for |
|---|---|---|
| `ceramic` | Matte, flat color | Large filled regions, backgrounds |
| `glass` | Reflective, luminous | Highlights, water/sky effects, focal points |
| `stone` | Textured, earthy | Borders, grounding elements, shadows |

Mix with ~70% ceramic, ~20% glass (key accent areas), ~10% stone (borders).

---

## Recommendation: Simplest First Implementation

**Implement this order:**

### Stage 1: Boundary-seeded frontier fill with random palette (No LLM, No image)

This is the **simplest implementation that produces interesting output** and validates the
Socket.IO integration:

1. Connect to a session as a bot client
2. Generate 3-6 starting positions along the canvas boundary
3. Place first tiles at those positions (no adjacency check needed — they touch the boundary)
4. Use a BFS frontier to expand inward
5. Pick colors from a harmonious analogous palette
6. Rate-limit to 1 tile / 2 seconds

**Estimated implementation time**: 4-6 hours
**Lines of code**: ~300-400
**Dependencies needed**: `socket.io-client@^4.8.x` (already in server; add to bot package), `uuid@^10.x`

```typescript
// Minimal bot skeleton
import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import type { PlaceTilePayload, PlaceTileAck, ConnectionAuth } from '../server/src/contracts.js'

const socket = io('http://localhost:3001', {
  auth: { sessionId: process.env.SESSION_ID, clientId: uuidv4() } as ConnectionAuth
})

socket.on('connect', async () => {
  // Stage 1: place a seed tile at canvas boundary
  await place({ x: -5.2 + 0.44, y: 0 }, '#E07B39', 'square', 0)
  // then expand frontier...
})

async function place(pos: {x:number,y:number}, color: string, shape: PlaceTilePayload['shape'], rotation: number) {
  const payload: PlaceTilePayload = {
    tileId: uuidv4(),
    shape,
    color,
    material: 'ceramic',
    transform: { position: pos, rotation }
  }
  return new Promise<PlaceTileAck>(resolve => socket.emit('place_tile', payload, resolve))
}
```

### Stage 2: Add color harmony + progressive disclosure

After Stage 1 is working: add analogous palette generation, phase detection, and
cluster-aware color selection.

### Stage 3: LLM director

After Stage 2: add the LLM tool-calling layer with directive queue. The LLM picks themes
and regions; Stages 1-2 code executes them.

### Stage 4: Image-to-mosaic

After Stage 3: accept a reference image URL and use `sharp` to drive color placement.

---

## Package Recommendations Summary

| Package | Version | Purpose | Stage |
|---|---|---|---|
| `socket.io-client` | `^4.8.x` | Bot Socket.IO connection | 1 |
| `uuid` | `^10.x` | Generate stable tileIds | 1 |
| `openai` | `^4.x` | GPT-4o tool-calling director | 3 |
| `@anthropic-ai/sdk` | `^0.x` | Claude alternative | 3 |
| `zod` | `^3.x` | Validate LLM tool-call responses | 3 |
| `sharp` | `^0.33.x` | Image pixel reading for mosaic-from-image | 4 |
| `jimp` | `^1.x` | Pure-JS image alt (dev only) | 4 |

---

## References and Evidence

- `apps/client/src/domain/placementSolver.ts` — `validatePlacement`, `MAX_GROUT_GAP=0.22`, `defaultBounds`
- `apps/client/src/domain/tileGeometry.ts` — tile unit=0.88, shape outlines, `quantizeRotation`
- `apps/server/src/contracts.ts` — `PlaceTilePayload`, `PlaceTileAck`, `PlaceTileRejectReason`, `ConnectionAuth`
- `apps/server/src/index.ts` — `CANVAS_WIDTH`, `CANVAS_HEIGHT`, Socket.IO server setup
- `apps/client/src/domain/math2d.ts` — `rotate`, `Vec2`, geometry utilities
- Token bucket algorithm: Cloudflare blog "How we handle traffic spikes" (rate limiting patterns)
- Hilbert curve: [Wikipedia: Hilbert curve](https://en.wikipedia.org/wiki/Hilbert_curve)
- Opus vermiculatum: traditional Roman mosaic tesserae flow technique
- LLM tool-calling patterns: OpenAI cookbook "Structured Outputs" (2024)
- Color harmony: HSL-based algorithms are standard in color theory (Itten, "The Art of Color")

---

## Clarifying Questions (Cannot Answer by Research Alone)

1. **Bot process location**: Should the bot be a new `apps/bot` workspace in the monorepo, or a
   standalone script in `scripts/`? This affects how it imports shared types from contracts.ts.

2. **Authentication**: Does `clientId` need to be a registered user, or is any UUID accepted?
   The contracts show `clientId` in auth but no login flow is apparent in the server index.

3. **Multi-session targeting**: Should the bot create its own session or join an existing one?
   The `POST /sessions` API requires no auth, but the bot needs a `sessionId` to connect.

4. **Stage 3 LLM integration**: Is there an existing API key management / environment variable
   convention in this project? (`.env` exists per the dev command in package.json.)

5. **Removal permission**: Is the bot expected to remove tiles it placed (e.g., to reposition
   them on rejection)? The `remove_tile` event exists in contracts.
