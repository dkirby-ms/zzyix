import {
  decomposeWrappedViewport,
  deduplicateCanonicalSubscriptions,
  positiveModulo,
} from '../../../server/src/domain/quiltTopology'

export type Vec2 = { x: number; y: number }

export type ChunkId = `${number}:${number}`

export type ViewportBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type ChunkTopologyMode =
  | { mode: 'unbounded' }
  | { mode: 'bounded'; bounds: ViewportBounds }
  | {
      mode: 'toroidal'
      chunkColumns: number
      chunkRows: number
      quiltWidth: number
      quiltHeight: number
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
  topologyMode: ChunkTopologyMode = { mode: 'unbounded' },
): ChunkId[] => {
  const expandedViewport = {
    minX: viewport.minX - prefetchRing * chunkSize,
    maxX: viewport.maxX + prefetchRing * chunkSize,
    minY: viewport.minY - prefetchRing * chunkSize,
    maxY: viewport.maxY + prefetchRing * chunkSize,
  }
  const viewports = topologyMode.mode === 'toroidal'
    ? decomposeWrappedViewport(expandedViewport, {
        patchRows: 1,
        patchColumns: 1,
        patchWidth: topologyMode.quiltWidth,
        patchHeight: topologyMode.quiltHeight,
      })
    : [expandedViewport]
  const chunkAddresses: Array<{ column: number; row: number }> = []

  for (const chunkViewport of viewports) {
    let startChunkX = Math.floor(chunkViewport.minX / chunkSize)
    let endChunkX = Math.floor(chunkViewport.maxX / chunkSize)
    let startChunkY = Math.floor(chunkViewport.minY / chunkSize)
    let endChunkY = Math.floor(chunkViewport.maxY / chunkSize)

    if (topologyMode.mode === 'bounded') {
      startChunkX = Math.max(startChunkX, Math.floor(topologyMode.bounds.minX / chunkSize))
      endChunkX = Math.min(endChunkX, Math.floor(topologyMode.bounds.maxX / chunkSize))
      startChunkY = Math.max(startChunkY, Math.floor(topologyMode.bounds.minY / chunkSize))
      endChunkY = Math.min(endChunkY, Math.floor(topologyMode.bounds.maxY / chunkSize))
    }

    for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX += 1) {
      for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY += 1) {
        chunkAddresses.push({ column: chunkX, row: chunkY })
      }
    }
  }

  if (topologyMode.mode === 'toroidal') {
    const startColumn = Math.floor(positiveModulo(expandedViewport.minX, topologyMode.quiltWidth) / chunkSize)
    const startRow = Math.floor(positiveModulo(expandedViewport.minY, topologyMode.quiltHeight) / chunkSize)
    return deduplicateCanonicalSubscriptions(
      chunkAddresses,
      topologyMode.chunkColumns,
      topologyMode.chunkRows,
    )
      .sort((left, right) => {
        const leftColumn = positiveModulo(left.column - startColumn, topologyMode.chunkColumns)
        const rightColumn = positiveModulo(right.column - startColumn, topologyMode.chunkColumns)
        if (leftColumn !== rightColumn) return leftColumn - rightColumn
        return positiveModulo(left.row - startRow, topologyMode.chunkRows)
          - positiveModulo(right.row - startRow, topologyMode.chunkRows)
      })
      .map(({ column, row }) => toChunkId(column, row))
  }

  return chunkAddresses.map(({ column, row }) => toChunkId(column, row))
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
