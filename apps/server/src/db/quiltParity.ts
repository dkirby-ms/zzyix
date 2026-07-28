import type { TileInstance } from '../contracts.js'

export type QuiltParityMismatch = {
  tileId: string
  fields: string[]
}

export type QuiltParityReport = {
  matches: boolean
  legacyTileCount: number
  patchTileCount: number
  missingFromPatch: string[]
  missingFromLegacy: string[]
  mismatches: QuiltParityMismatch[]
}

const MAX_REPORTED_DIFFERENCES = 20

const comparableTile = (tile: TileInstance): Record<string, unknown> => ({
  shape: tile.shape,
  color: tile.color,
  material: tile.material,
  positionX: tile.transform.position.x,
  positionY: tile.transform.position.y,
  rotation: tile.transform.rotation,
  mirrored: tile.transform.mirrored ?? false,
  placedBy: tile.placedBy ?? null,
  createdAt: tile.createdAt,
})

const differingFields = (legacyTile: TileInstance, patchTile: TileInstance): string[] => {
  const legacy = comparableTile(legacyTile)
  const patch = comparableTile(patchTile)

  return Object.keys(legacy).filter((field) => legacy[field] !== patch[field])
}

export const compareLegacyAndPatchTiles = (
  legacyTiles: TileInstance[],
  patchTiles: TileInstance[],
): QuiltParityReport => {
  const legacyById = new Map(legacyTiles.map((tile) => [tile.id, tile]))
  const patchById = new Map(patchTiles.map((tile) => [tile.id, tile]))
  const missingFromPatch = Array.from(legacyById.keys())
    .filter((tileId) => !patchById.has(tileId))
    .sort()
  const missingFromLegacy = Array.from(patchById.keys())
    .filter((tileId) => !legacyById.has(tileId))
    .sort()
  const mismatches: QuiltParityMismatch[] = []

  for (const [tileId, legacyTile] of legacyById) {
    const patchTile = patchById.get(tileId)
    if (!patchTile) continue

    const fields = differingFields(legacyTile, patchTile)
    if (fields.length > 0) {
      mismatches.push({ tileId, fields })
    }
  }

  mismatches.sort((left, right) => left.tileId.localeCompare(right.tileId))

  return {
    matches: missingFromPatch.length === 0 && missingFromLegacy.length === 0 && mismatches.length === 0,
    legacyTileCount: legacyTiles.length,
    patchTileCount: patchTiles.length,
    missingFromPatch: missingFromPatch.slice(0, MAX_REPORTED_DIFFERENCES),
    missingFromLegacy: missingFromLegacy.slice(0, MAX_REPORTED_DIFFERENCES),
    mismatches: mismatches.slice(0, MAX_REPORTED_DIFFERENCES),
  }
}