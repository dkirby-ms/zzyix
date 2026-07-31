import { dot, len, normalize, perp, sub, vec2 } from './math2d.js'
import { DEFAULT_BOUNDED_WORLD_BOUNDS } from '../contracts.js'
import {
  transformTile,
} from './tileGeometry.js'
import { nearestImageDelta, type QuiltTopology, type TopologyRect } from './quiltTopology.js'
import type { Vec2 } from './math2d.js'
import type { ConfidenceState, TileShape, Transform2D } from './tileGeometry.js'

export type MosaicBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type BoundsPolicy =
  | {
      mode: 'bounded'
      bounds: MosaicBounds
    }
  | {
      mode: 'unbounded'
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
export const MAX_GROUT_GAP = 0.22

export const derivePlacementBounds = (
  shape: TileShape,
  transform: Transform2D,
  halo = 0,
): TopologyRect => {
  const outline = transformTile(shape, transform).outline
  return {
    minX: Math.min(...outline.map((point) => point.x)) - halo,
    maxX: Math.max(...outline.map((point) => point.x)) + halo,
    minY: Math.min(...outline.map((point) => point.y)) - halo,
    maxY: Math.max(...outline.map((point) => point.y)) + halo,
  }
}

export const projectPeriodicNeighbors = (
  settled: TileInstance[],
  candidatePosition: Vec2,
  topology: QuiltTopology,
): TileInstance[] => {
  const quiltWidth = topology.patchColumns * topology.patchWidth
  const quiltHeight = topology.patchRows * topology.patchHeight

  return settled.map((tile) => ({
    ...tile,
    transform: {
      ...tile.transform,
      position: {
        x: candidatePosition.x + nearestImageDelta(tile.transform.position.x - candidatePosition.x, quiltWidth),
        y: candidatePosition.y + nearestImageDelta(tile.transform.position.y - candidatePosition.y, quiltHeight),
      },
    },
  }))
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

const resolveBoundsPolicy = (bounds: MosaicBounds | BoundsPolicy): BoundsPolicy =>
  'mode' in bounds
    ? bounds
    : {
        mode: 'bounded',
        bounds,
      }

export const validatePlacement = (
  candidateShape: TileShape,
  candidateTransform: Transform2D,
  settled: TileInstance[],
  bounds: MosaicBounds | BoundsPolicy,
): ValidationResult => {
  const candidate = transformTile(candidateShape, candidateTransform)
  const policy = resolveBoundsPolicy(bounds)

  if (policy.mode === 'bounded') {
    const boundsResult = isInsideBounds(candidate.outline, policy.bounds)
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
  bounds: MosaicBounds | BoundsPolicy,
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

export const defaultBounds: MosaicBounds = DEFAULT_BOUNDED_WORLD_BOUNDS

export const defaultBoundsPolicy: BoundsPolicy = {
  mode: 'bounded',
  bounds: defaultBounds,
}