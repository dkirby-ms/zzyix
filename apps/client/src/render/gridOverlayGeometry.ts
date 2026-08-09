import { generateGridPatternSlots, getViewportCellRange } from '../domain/gridPatterns'
import { validatePlacement } from '../domain/placementSolver'
import { getTileDefinition, transformPolygon } from '../domain/tileGeometry'
import type { GridPattern, GridPatternSlot, WorldViewport } from '../domain/gridPatterns'
import type { BoundsPolicy, MosaicBounds, TileInstance } from '../domain/placementSolver'
import type { TileShape } from '../domain/tileGeometry'
import type { QuiltTopology } from '../../../server/src/domain/quiltTopology'

export type GridOverlayVisualState = 'structural' | 'placeable' | 'blocked' | 'active'

export type GridOverlaySegmentGroups = Record<GridOverlayVisualState, number[]>

export type BuildGridOverlaySegmentsInput = {
  pattern: GridPattern
  viewport: WorldViewport
  activeShape: TileShape
  tiles: readonly TileInstance[]
  bounds: MosaicBounds | BoundsPolicy
  topology?: QuiltTopology
  activeSlotId?: string
}

const createEmptyGroups = (): GridOverlaySegmentGroups => ({
  structural: [],
  placeable: [],
  blocked: [],
  active: [],
})

export const classifyGridPatternSlot = (
  slot: GridPatternSlot,
  activeShape: TileShape,
  tiles: readonly TileInstance[],
  bounds: MosaicBounds | BoundsPolicy,
  activeSlotId?: string,
  topology?: QuiltTopology,
): GridOverlayVisualState => {
  if (slot.id === activeSlotId) {
    return 'active'
  }

  if (slot.shape !== activeShape) {
    return 'structural'
  }

  return validatePlacement(slot.shape, slot.transform, tiles, bounds, topology).valid
    ? 'placeable'
    : 'blocked'
}

const appendOutlineSegments = (positions: number[], outline: Array<{ x: number; y: number }>): void => {
  for (let index = 0; index < outline.length; index += 1) {
    const start = outline[index]
    const end = outline[(index + 1) % outline.length]
    positions.push(start.x, start.y, 0, end.x, end.y, 0)
  }
}

const appendActiveMarker = (positions: number[], slot: GridPatternSlot): void => {
  const { x, y } = slot.transform.position
  const markerRadius = 0.12
  positions.push(
    x - markerRadius, y, 0,
    x + markerRadius, y, 0,
    x, y - markerRadius, 0,
    x, y + markerRadius, 0,
  )
}

export const buildGridOverlaySegments = ({
  pattern,
  viewport,
  activeShape,
  tiles,
  bounds,
  activeSlotId,
  topology,
}: BuildGridOverlaySegmentsInput): GridOverlaySegmentGroups => {
  const groups = createEmptyGroups()
  const range = getViewportCellRange(pattern, viewport)
  const slots = generateGridPatternSlots(pattern, range)

  for (const slot of slots) {
    const ownershipValidation = validatePlacement(slot.shape, slot.transform, [], bounds)
    if (ownershipValidation.reason.startsWith('out-of-bounds')) continue

    const state = classifyGridPatternSlot(slot, activeShape, tiles, bounds, activeSlotId, topology)
    const outline = transformPolygon(getTileDefinition(slot.shape).outline, slot.transform)
    appendOutlineSegments(groups[state], outline)

    if (state === 'active') {
      appendActiveMarker(groups.active, slot)
    }
  }

  return groups
}
