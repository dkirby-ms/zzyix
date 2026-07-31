import { dist } from './math2d'
import { getNearestGridCells, createGridPatternSlot, getPatternCompatibleShapes } from './gridPatterns'
import { validatePlacement } from './placementSolver'
import type { Vec2 } from './math2d'
import type { GridPattern, GridPatternSlot } from './gridPatterns'
import type { BoundsPolicy, MosaicBounds, TileInstance, ValidationResult } from './placementSolver'
import type { TileShape, Transform2D } from './tileGeometry'
import type { QuiltTopology } from '../../../server/src/domain/quiltTopology'

export type GridPlacementResult = {
  slot: GridPatternSlot
  transform: Transform2D
  state: ValidationResult['state']
  valid: boolean
  correction: Vec2
  reason: string
}

type GridPlacementCandidate = {
  slot: GridPatternSlot
  distance: number
  validation: ValidationResult
}

const shapeLabels: Record<TileShape, string> = {
  square: 'Square',
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  'l-shape': 'L-shape',
}

const compareCandidates = (left: GridPlacementCandidate, right: GridPlacementCandidate): number =>
  left.distance - right.distance || left.slot.id.localeCompare(right.slot.id)

const createCandidates = (
  pointer: Vec2,
  pattern: GridPattern,
  shape: TileShape | undefined,
  settled: TileInstance[],
  bounds: MosaicBounds | BoundsPolicy,
  topology?: QuiltTopology,
): GridPlacementCandidate[] =>
  getNearestGridCells(pattern, pointer)
    .flatMap((cell) =>
      pattern.slots
        .filter((slot) => shape === undefined || slot.shape === shape)
        .map((slot) => createGridPatternSlot(pattern, cell, slot)),
    )
    .map((slot) => ({
      slot,
      distance: dist(pointer, slot.transform.position),
      validation: validatePlacement(slot.shape, slot.transform, settled, bounds, topology),
    }))
    .sort(compareCandidates)

export const resolveGridPlacement = (
  pointer: Vec2,
  activeShape: TileShape,
  pattern: GridPattern,
  settled: TileInstance[],
  bounds: MosaicBounds | BoundsPolicy,
  topology?: QuiltTopology,
): GridPlacementResult => {
  const compatibleShapes = getPatternCompatibleShapes(pattern)

  if (!compatibleShapes.includes(activeShape)) {
    const nearest = createCandidates(pointer, pattern, undefined, settled, bounds, topology)[0]
    const compatibleLabels = compatibleShapes.map((shape) => shapeLabels[shape]).join(' or ')

    return {
      slot: nearest.slot,
      transform: nearest.slot.transform,
      state: 'invalid',
      valid: false,
      correction: { x: 0, y: 0 },
      reason: `${shapeLabels[activeShape]} is not compatible with ${pattern.label}. Choose ${compatibleLabels}.`,
    }
  }

  const candidates = createCandidates(pointer, pattern, activeShape, settled, bounds, topology)
  const selected = candidates.find((candidate) => candidate.validation.valid) ?? candidates[0]

  return {
    slot: selected.slot,
    transform: selected.slot.transform,
    state: selected.validation.state,
    valid: selected.validation.valid,
    correction: selected.validation.correction,
    reason: selected.validation.reason,
  }
}
