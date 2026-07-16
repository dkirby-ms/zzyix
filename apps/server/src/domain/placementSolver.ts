import { dot, len, normalize, perp, sub, vec2 } from './math2d'
import {
  transformTile,
} from './tileGeometry'
import type { Vec2 } from './math2d'
import type { ConfidenceState, TileShape, Transform2D } from './tileGeometry'

export type MosaicBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type TileInstance = {
  id: string
  shape: TileShape
  color: string
  material: 'ceramic' | 'glass' | 'stone'
  transform: Transform2D
  settleFrom?: Transform2D
  createdAt: number
}

type Projection = {
  min: number
  max: number
}

type SatResult = {
  overlap: boolean
  depth: number
  axis: Vec2
}

export type ValidationResult = {
  state: ConfidenceState
  valid: boolean
  correction: Vec2
  penetration: number
  reason: string
}

export type GuidedPlacement = {
  transform: Transform2D
  state: ConfidenceState
  valid: boolean
  magnetStrength: number
  correction: Vec2
  reason: string
}

/** Maximum allowed edge-to-edge gap between a candidate tile and the nearest settled tile. */
const MAX_GROUT_GAP = 0.22

const pointToSegmentDist = (p: Vec2, a: Vec2, b: Vec2): number => {
  const ab = sub(b, a)
  const abLen2 = dot(ab, ab)
  if (abLen2 === 0) return len(sub(p, a))
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / abLen2))
  return len(sub(p, vec2(a.x + ab.x * t, a.y + ab.y * t)))
}

/**
 * Minimum edge-to-edge distance between two polygons.
 * Returns 0 when they are touching or overlapping.
 */
const minOutlineGap = (a: Vec2[], b: Vec2[]): number => {
  let minDist = Number.POSITIVE_INFINITY
  for (const p of b) {
    for (let i = 0; i < a.length; i += 1) {
      const d = pointToSegmentDist(p, a[i], a[(i + 1) % a.length])
      if (d < minDist) minDist = d
    }
  }
  for (const p of a) {
    for (let i = 0; i < b.length; i += 1) {
      const d = pointToSegmentDist(p, b[i], b[(i + 1) % b.length])
      if (d < minDist) minDist = d
    }
  }
  return minDist
}

const project = (polygon: Vec2[], axis: Vec2): Projection => {
  let min = dot(polygon[0], axis)
  let max = min
  for (let i = 1; i < polygon.length; i += 1) {
    const p = dot(polygon[i], axis)
    if (p < min) min = p
    if (p > max) max = p
  }
  return { min, max }
}

const sat = (a: Vec2[], b: Vec2[]): SatResult => {
  let minDepth = Number.POSITIVE_INFINITY
  let minAxis = vec2(1, 0)
  const polygons = [a, b]

  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i += 1) {
      const current = poly[i]
      const next = poly[(i + 1) % poly.length]
      const edge = sub(next, current)
      const axis = normalize(perp(edge))

      const pa = project(a, axis)
      const pb = project(b, axis)
      const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min)

      if (overlap <= 0) {
        return {
          overlap: false,
          depth: 0,
          axis,
        }
      }

      if (overlap < minDepth) {
        minDepth = overlap
        minAxis = axis
      }
    }
  }

  return {
    overlap: true,
    depth: minDepth,
    axis: minAxis,
  }
}

const isInsideBounds = (polygon: Vec2[], bounds: MosaicBounds): { inside: boolean; correction: Vec2 } => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  const correction = vec2(
    (minX < bounds.minX ? bounds.minX - minX : 0) - (maxX > bounds.maxX ? maxX - bounds.maxX : 0),
    (minY < bounds.minY ? bounds.minY - minY : 0) - (maxY > bounds.maxY ? maxY - bounds.maxY : 0),
  )

  return { inside: correction.x === 0 && correction.y === 0, correction }
}

export const validatePlacement = (
  candidateShape: TileShape,
  candidateTransform: Transform2D,
  settled: TileInstance[],
  bounds: MosaicBounds,
): ValidationResult => {
  const candidate = transformTile(candidateShape, candidateTransform)

  const boundsResult = isInsideBounds(candidate.outline, bounds)
  if (!boundsResult.inside) {
    const penetration = len(boundsResult.correction)
    return {
      state: penetration < 0.22 ? 'near-valid' : 'invalid',
      valid: false,
      correction: boundsResult.correction,
      penetration,
      reason: `out-of-bounds (correction ${penetration.toFixed(3)})`,
    }
  }

  let maxPenetration = 0
  let correction = vec2(0, 0)

  for (const tile of settled) {
    const transformed = transformTile(tile.shape, tile.transform)
    for (const partA of candidate.convexParts) {
      for (const partB of transformed.convexParts) {
        const overlap = sat(partA, partB)
        if (overlap.overlap) {
          const centerDelta = sub(candidateTransform.position, tile.transform.position)
          const direction = dot(centerDelta, overlap.axis) >= 0 ? overlap.axis : vec2(-overlap.axis.x, -overlap.axis.y)
          const push = vec2(direction.x * overlap.depth, direction.y * overlap.depth)
          if (overlap.depth > maxPenetration) {
            maxPenetration = overlap.depth
            correction = push
          }
        }
      }
    }
  }

  if (maxPenetration > 0) {
    return {
      state: maxPenetration < 0.18 ? 'near-valid' : 'invalid',
      valid: false,
      correction,
      penetration: maxPenetration,
      reason: `overlap (depth ${maxPenetration.toFixed(3)})`,
    }
  }

  // Adjacency check: once tiles have been placed, the candidate must sit within
  // grout distance of at least one settled tile — no floating islands.
  if (settled.length > 0) {
    let minGap = Number.POSITIVE_INFINITY

    for (const tile of settled) {
      const transformed = transformTile(tile.shape, tile.transform)
      const gap = minOutlineGap(candidate.outline, transformed.outline)
      if (gap < minGap) minGap = gap
    }

    if (minGap > MAX_GROUT_GAP) {
      return {
        state: minGap < MAX_GROUT_GAP * 2.5 ? 'near-valid' : 'invalid',
        valid: false,
        correction: vec2(0, 0),
        penetration: minGap,
        reason: `gap too large (${minGap.toFixed(3)} > max ${MAX_GROUT_GAP})`,
      }
    }
  }

  return {
    state: 'valid',
    valid: true,
    correction: vec2(0, 0),
    penetration: 0,
    reason: 'ok',
  }
}

export const solveGuidedPlacement = (
  pointer: Vec2,
  candidateShape: TileShape,
  rotation: number,
  mirrored: boolean,
  settled: TileInstance[],
  bounds: MosaicBounds,
): GuidedPlacement => {
  // Snapping disabled: always use the raw pointer position
  const baseTransform: Transform2D = {
    position: pointer,
    rotation,
    mirrored,
  }

  const baseValidation = validatePlacement(candidateShape, baseTransform, settled, bounds)
  const chosen = { transform: baseTransform, validation: baseValidation }
  const magnetStrength = 0

  return {
    transform: chosen.transform,
    state: chosen.validation.state,
    valid: chosen.validation.valid,
    magnetStrength,
    correction: chosen.validation.correction,
    reason: chosen.validation.reason,
  }
}

export const defaultBounds: MosaicBounds = {
  minX: -5.2,
  maxX: 5.2,
  minY: -3.4,
  maxY: 3.4,
}