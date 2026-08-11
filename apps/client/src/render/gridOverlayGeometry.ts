import { generateGridPatternSlots, getViewportCellRange } from '../domain/gridPatterns'
import { derivePlacementBounds, validatePlacement } from '../domain/placementSolver'
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

const intersectViewportWithBounds = (
  viewport: WorldViewport,
  bounds: MosaicBounds | BoundsPolicy,
): WorldViewport | undefined => {
  const bounded = 'mode' in bounds
    ? bounds.mode === 'bounded' ? bounds.bounds : undefined
    : bounds
  if (!bounded) return viewport

  const intersection = {
    minX: Math.max(viewport.minX, bounded.minX),
    maxX: Math.min(viewport.maxX, bounded.maxX),
    minY: Math.max(viewport.minY, bounded.minY),
    maxY: Math.min(viewport.maxY, bounded.maxY),
  }

  return intersection.minX <= intersection.maxX && intersection.minY <= intersection.maxY
    ? intersection
    : undefined
}

const GRID_INDEX_CELL_SIZE = 1

type IndexedTile = {
  tile: TileInstance
  bounds: MosaicBounds
}

type GridTileIndex = Map<string, IndexedTile[]>

const gridIndexKey = (x: number, y: number): string => `${x}:${y}`

const addIndexedTile = (index: GridTileIndex, indexedTile: IndexedTile): void => {
  const minX = Math.floor(indexedTile.bounds.minX / GRID_INDEX_CELL_SIZE)
  const maxX = Math.floor(indexedTile.bounds.maxX / GRID_INDEX_CELL_SIZE)
  const minY = Math.floor(indexedTile.bounds.minY / GRID_INDEX_CELL_SIZE)
  const maxY = Math.floor(indexedTile.bounds.maxY / GRID_INDEX_CELL_SIZE)

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const key = gridIndexKey(x, y)
      const bucket = index.get(key)
      if (bucket) bucket.push(indexedTile)
      else index.set(key, [indexedTile])
    }
  }
}

const createGridTileIndex = (
  tiles: readonly TileInstance[],
  topology?: QuiltTopology,
): GridTileIndex => {
  const index: GridTileIndex = new Map()
  const imageOffsets = topology
    ? [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({
        x: x * topology.patchColumns * topology.patchWidth,
        y: y * topology.patchRows * topology.patchHeight,
      })))
    : [{ x: 0, y: 0 }]

  for (const tile of tiles) {
    for (const offset of imageOffsets) {
      const projectedTile = offset.x === 0 && offset.y === 0
        ? tile
        : {
            ...tile,
            transform: {
              ...tile.transform,
              position: {
                x: tile.transform.position.x + offset.x,
                y: tile.transform.position.y + offset.y,
              },
            },
          }
      addIndexedTile(index, {
        tile: projectedTile,
        bounds: derivePlacementBounds(projectedTile.shape, projectedTile.transform),
      })
    }
  }

  return index
}

const getIndexedTiles = (index: GridTileIndex, bounds: MosaicBounds): TileInstance[] => {
  const minX = Math.floor(bounds.minX / GRID_INDEX_CELL_SIZE)
  const maxX = Math.floor(bounds.maxX / GRID_INDEX_CELL_SIZE)
  const minY = Math.floor(bounds.minY / GRID_INDEX_CELL_SIZE)
  const maxY = Math.floor(bounds.maxY / GRID_INDEX_CELL_SIZE)
  const candidates = new Set<IndexedTile>()

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (const tile of index.get(gridIndexKey(x, y)) ?? []) {
        if (
          tile.bounds.maxX >= bounds.minX
          && tile.bounds.minX <= bounds.maxX
          && tile.bounds.maxY >= bounds.minY
          && tile.bounds.minY <= bounds.maxY
        ) {
          candidates.add(tile)
        }
      }
    }
  }

  return [...candidates].map((candidate) => candidate.tile)
}

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
  const visibleViewport = intersectViewportWithBounds(viewport, bounds)
  if (!visibleViewport) return groups

  const range = getViewportCellRange(pattern, visibleViewport)
  const slots = generateGridPatternSlots(pattern, range)
  const tileIndex = createGridTileIndex(tiles, topology)

  for (const slot of slots) {
    const ownershipValidation = validatePlacement(slot.shape, slot.transform, [], bounds)
    if (ownershipValidation.reason.startsWith('out-of-bounds')) continue

    const slotBounds = derivePlacementBounds(slot.shape, slot.transform)
    const nearbyTiles = getIndexedTiles(tileIndex, slotBounds)
    const state = classifyGridPatternSlot(slot, activeShape, nearbyTiles, bounds, activeSlotId, topology ? undefined : topology)
    const outline = transformPolygon(getTileDefinition(slot.shape).outline, slot.transform)
    appendOutlineSegments(groups[state], outline)

    if (state === 'active') {
      appendActiveMarker(groups.active, slot)
    }
  }

  return groups
}
