import {
  enumeratePeriodicImages,
  nearestImageDelta,
  resolveCanonicalPoint,
  type QuiltTopology,
  type TopologyRect,
} from '../../../server/src/domain/quiltTopology'
import type { TileInstance } from '../domain/placementSolver'

export type PeriodicTileImage = {
  key: string
  canonicalId: string
  tile: TileInstance
  position: { x: number; y: number }
  image: { x: number; y: number }
}

export const deriveOrthographicViewport = (
  center: { x: number; y: number },
  zoom: number,
  size: { width: number; height: number },
): TopologyRect => {
  const halfWidth = size.width / (2 * zoom)
  const halfHeight = size.height / (2 * zoom)
  return {
    minX: center.x - halfWidth,
    maxX: center.x + halfWidth,
    minY: center.y - halfHeight,
    maxY: center.y + halfHeight,
  }
}

export const canonicalizeDisplayPoint = (
  point: { x: number; y: number },
  topology: QuiltTopology,
): { x: number; y: number } => resolveCanonicalPoint(point, topology).point

export const resolveDisplayHitPoint = (
  point: { x: number; y: number },
  topology?: QuiltTopology,
): { x: number; y: number } => topology ? canonicalizeDisplayPoint(point, topology) : point

export const nearestPeriodicPoint = (
  canonicalPoint: { x: number; y: number },
  reference: { x: number; y: number },
  topology: QuiltTopology,
): { x: number; y: number } => {
  const width = topology.patchColumns * topology.patchWidth
  const height = topology.patchRows * topology.patchHeight
  return {
    x: reference.x + nearestImageDelta(canonicalPoint.x - reference.x, width),
    y: reference.y + nearestImageDelta(canonicalPoint.y - reference.y, height),
  }
}

export const enumerateVisibleTileImages = (
  tiles: TileInstance[],
  viewport: TopologyRect,
  topology: QuiltTopology,
  overscan = 1,
): PeriodicTileImage[] => {
  const expanded = {
    minX: viewport.minX - overscan,
    maxX: viewport.maxX + overscan,
    minY: viewport.minY - overscan,
    maxY: viewport.maxY + overscan,
  }
  const uniqueTiles = new Map(tiles.map((tile) => [tile.id, tile]))

  return Array.from(uniqueTiles.values()).flatMap((tile) => {
    const canonical = canonicalizeDisplayPoint(tile.transform.position, topology)
    const rect = { minX: canonical.x, maxX: canonical.x, minY: canonical.y, maxY: canonical.y }
    return enumeratePeriodicImages(rect, expanded, topology).map(({ offset }) => {
      const image = {
        x: offset.x / (topology.patchColumns * topology.patchWidth),
        y: offset.y / (topology.patchRows * topology.patchHeight),
      }
      return {
        key: `${tile.id}@${image.x}:${image.y}`,
        canonicalId: tile.id,
        tile,
        position: { x: canonical.x + offset.x, y: canonical.y + offset.y },
        image,
      }
    })
  })
}

export const enumerateCameraTileImages = (
  tiles: TileInstance[],
  center: { x: number; y: number },
  zoom: number,
  size: { width: number; height: number },
  topology: QuiltTopology,
) => enumerateVisibleTileImages(tiles, deriveOrthographicViewport(center, zoom, size), topology, 2)