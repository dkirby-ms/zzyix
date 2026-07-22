export type Vec2 = { x: number; y: number }

export type ChunkId = `${number}:${number}`

export type ViewportBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y)
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y)
export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s)

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))

export const normalize = (a: Vec2): Vec2 => {
  const l = len(a)
  if (l === 0) return vec2(0, 0)
  return vec2(a.x / l, a.y / l)
}

export const perp = (a: Vec2): Vec2 => vec2(-a.y, a.x)

export const rotate = (point: Vec2, radians: number): Vec2 => {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return vec2(point.x * c - point.y * s, point.x * s + point.y * c)
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t))

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const shortestAngleDelta = (from: number, to: number): number => {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export const hash2 = (x: number, y: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return v - Math.floor(v)
}

export const toChunkId = (chunkX: number, chunkY: number): ChunkId => `${chunkX}:${chunkY}`

export const worldToChunkCoords = (
  x: number,
  y: number,
  chunkSize: number,
): { chunkX: number; chunkY: number } => ({
  chunkX: Math.floor(x / chunkSize),
  chunkY: Math.floor(y / chunkSize),
})

export const viewportToChunkIds = (
  viewport: ViewportBounds,
  chunkSize: number,
  prefetchRing: number,
): ChunkId[] => {
  const startChunkX = Math.floor(viewport.minX / chunkSize) - prefetchRing
  const endChunkX = Math.floor(viewport.maxX / chunkSize) + prefetchRing
  const startChunkY = Math.floor(viewport.minY / chunkSize) - prefetchRing
  const endChunkY = Math.floor(viewport.maxY / chunkSize) + prefetchRing

  const chunkIds: ChunkId[] = []
  for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX += 1) {
    for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY += 1) {
      chunkIds.push(toChunkId(chunkX, chunkY))
    }
  }

  return chunkIds
}

export const shouldRecomputeVisibleChunks = (
  previousCenter: Vec2,
  nextCenter: Vec2,
  chunkSize: number,
  hysteresisRatio: number,
  previousZoom: number,
  nextZoom: number,
  zoomHysteresis: number,
): boolean => {
  const movementThreshold = chunkSize * hysteresisRatio
  const dx = Math.abs(nextCenter.x - previousCenter.x)
  const dy = Math.abs(nextCenter.y - previousCenter.y)

  return dx > movementThreshold || dy > movementThreshold || Math.abs(nextZoom - previousZoom) >= zoomHysteresis
}

export const applyChunkSubscriptionBudgets = (
  orderedChunkIds: ChunkId[],
  softLimit: number,
  hardLimit: number,
): ChunkId[] => {
  const hardCapped = orderedChunkIds.slice(0, hardLimit)

  if (hardCapped.length <= softLimit) {
    return hardCapped
  }

  return hardCapped.slice(0, softLimit)
}
