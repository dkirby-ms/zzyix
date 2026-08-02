import { RUNTIME_CHUNK_WORLD_SIZE, type QuiltPatchCursor, type QuiltPatchRevisionMap } from '../../../server/src/contracts'
import { toChunkId, worldToChunkCoords } from './math2d'
import type { TileInstance } from './placementSolver'
import { getTileDefinition, transformPolygon } from './tileGeometry'

export type QuiltCachePinReason = 'optimistic' | 'undo' | 'selection'

export type QuiltCacheUndoMetadata = {
  tileId: string
  patchId: string
  operation: 'place' | 'remove'
  revision: number
}

export type QuiltCachePatch = {
  patchId: string
  roomId: string
  chunkIds: string[]
  tileIds: string[]
  chunkTileIds: Record<string, string[]>
  cursor: QuiltPatchCursor
  lastAccessed: number
}

export type QuiltCacheState = {
  patches: Record<string, QuiltCachePatch>
  tiles: Record<string, TileInstance>
  optimistic: Record<string, { operationId: string; patchIds: string[]; tile: TileInstance }>
  undo: Record<string, QuiltCacheUndoMetadata>
  selections: Record<string, string>
  pins: Record<string, QuiltCachePinReason[]>
}

export const createQuiltCache = (): QuiltCacheState => ({
  patches: {},
  tiles: {},
  optimistic: {},
  undo: {},
  selections: {},
  pins: {},
})

const unique = <T>(values: T[]): T[] => Array.from(new Set(values))

const deriveTileChunkIds = (
  tile: TileInstance,
  scopedChunkIds?: string[],
): string[] => {
  const outline = transformPolygon(getTileDefinition(tile.shape).outline, tile.transform)
  const minX = Math.min(...outline.map((point) => point.x))
  const maxX = Math.max(...outline.map((point) => point.x))
  const minY = Math.min(...outline.map((point) => point.y))
  const maxY = Math.max(...outline.map((point) => point.y))
  const chunkIds = new Set<string>()

  for (let chunkX = Math.floor(minX / RUNTIME_CHUNK_WORLD_SIZE); chunkX <= Math.floor(maxX / RUNTIME_CHUNK_WORLD_SIZE); chunkX += 1) {
    for (let chunkY = Math.floor(minY / RUNTIME_CHUNK_WORLD_SIZE); chunkY <= Math.floor(maxY / RUNTIME_CHUNK_WORLD_SIZE); chunkY += 1) {
      chunkIds.add(toChunkId(chunkX, chunkY))
    }
  }

  if (!scopedChunkIds || scopedChunkIds.length === 0) {
    return Array.from(chunkIds)
  }

  const scoped = new Set(scopedChunkIds)
  const filtered = Array.from(chunkIds).filter((chunkId) => scoped.has(chunkId))
  if (filtered.length > 0) {
    return filtered
  }

  const anchor = worldToChunkCoords(
    tile.transform.position.x,
    tile.transform.position.y,
    RUNTIME_CHUNK_WORLD_SIZE,
  )
  const anchorChunkId = toChunkId(anchor.chunkX, anchor.chunkY)
  if (scoped.has(anchorChunkId)) {
    return [anchorChunkId]
  }

  return scopedChunkIds.length === 1 ? scopedChunkIds : []
}

const buildChunkTileIds = (
  tiles: TileInstance[],
  chunkIds: string[],
  existing: Record<string, string[]> = {},
): Record<string, string[]> => {
  const next = { ...existing }
  chunkIds.forEach((chunkId) => {
    next[chunkId] = []
  })
  tiles.forEach((tile) => {
    deriveTileChunkIds(tile, chunkIds).forEach((chunkId) => {
      next[chunkId] = unique([...(next[chunkId] ?? []), tile.id])
    })
  })
  return next
}

const buildPatchTileIds = (chunkTileIds: Record<string, string[]>): string[] =>
  unique(Object.values(chunkTileIds).flat())

const appendTileToChunks = (
  tile: TileInstance,
  chunkIds: string[],
  existing: Record<string, string[]>,
): Record<string, string[]> => {
  const next = { ...existing }
  deriveTileChunkIds(tile, chunkIds).forEach((chunkId) => {
    next[chunkId] = unique([...(next[chunkId] ?? []), tile.id])
  })
  return next
}

const rebuildTiles = (state: QuiltCacheState): Record<string, TileInstance> => {
  const retainedIds = new Set(Object.values(state.patches).flatMap((patch) => patch.tileIds))
  Object.keys(state.pins).forEach((tileId) => retainedIds.add(tileId))
  Object.keys(state.optimistic).forEach((tileId) => retainedIds.add(tileId))

  return Object.fromEntries(
    Object.entries(state.tiles).filter(([tileId]) => retainedIds.has(tileId)),
  )
}

export const mergeQuiltPatchSnapshot = (
  state: QuiltCacheState,
  input: {
    patchId: string
    roomId: string
    chunkIds?: string[]
    tiles: TileInstance[]
    cursor: QuiltPatchCursor
    accessedAt?: number
  },
): QuiltCacheState => {
  const currentPatch = state.patches[input.patchId]
  if (currentPatch && input.cursor.revision < currentPatch.cursor.revision) return state

  const tiles = { ...state.tiles }
  input.tiles.forEach((tile) => {
    tiles[tile.id] = tile
  })

  const scopedChunkIds = unique(input.chunkIds ?? [])
  const chunkTileIds = scopedChunkIds.length === 0
    ? {}
    : buildChunkTileIds(input.tiles, scopedChunkIds, currentPatch?.chunkTileIds)
  const patchChunkIds = scopedChunkIds.length === 0
    ? unique(input.chunkIds ?? [])
    : unique([...Object.keys(currentPatch?.chunkTileIds ?? {}), ...Object.keys(chunkTileIds)])
  const patchTileIds = scopedChunkIds.length === 0
    ? unique(input.tiles.map((tile) => tile.id))
    : buildPatchTileIds(chunkTileIds)

  const next: QuiltCacheState = {
    ...state,
    tiles,
    patches: {
      ...state.patches,
      [input.patchId]: {
        patchId: input.patchId,
        roomId: input.roomId,
        chunkIds: patchChunkIds,
        tileIds: patchTileIds,
        chunkTileIds,
        cursor: input.cursor,
        lastAccessed: input.accessedAt ?? Date.now(),
      },
    },
  }

  return { ...next, tiles: rebuildTiles(next) }
}

export const applyQuiltPatchPlacement = (
  state: QuiltCacheState,
  patchId: string,
  tile: TileInstance,
  cursor: QuiltPatchCursor,
): QuiltCacheState => {
  const patch = state.patches[patchId]
  if (!patch) return state
  if (cursor.revision <= patch.cursor.revision) return state

  const chunkTileIds = patch.chunkIds.length === 0
    ? patch.chunkTileIds
    : appendTileToChunks(tile, patch.chunkIds, patch.chunkTileIds)

  const next = {
    ...state,
    tiles: { ...state.tiles, [tile.id]: tile },
    patches: {
      ...state.patches,
      [patchId]: {
        ...patch,
        tileIds: patch.chunkIds.length === 0
          ? unique([...patch.tileIds, tile.id])
          : buildPatchTileIds(chunkTileIds),
        chunkTileIds,
        cursor,
        lastAccessed: Date.now(),
      },
    },
  }
  return { ...next, tiles: rebuildTiles(next) }
}

export const applyQuiltPatchRemoval = (
  state: QuiltCacheState,
  patchId: string,
  tileId: string,
  cursor: QuiltPatchCursor,
): QuiltCacheState => {
  const patch = state.patches[patchId]
  if (!patch) return state
  if (cursor.revision <= patch.cursor.revision) return state

  const next = {
    ...state,
    patches: {
      ...state.patches,
      [patchId]: {
        ...patch,
        tileIds: patch.chunkIds.length === 0
          ? patch.tileIds.filter((id) => id !== tileId)
          : buildPatchTileIds(Object.fromEntries(
              Object.entries(patch.chunkTileIds).map(([chunkId, tileIds]) => [
                chunkId,
                tileIds.filter((id) => id !== tileId),
              ]),
            )),
        chunkTileIds: patch.chunkIds.length === 0
          ? patch.chunkTileIds
          : Object.fromEntries(
              Object.entries(patch.chunkTileIds).map(([chunkId, tileIds]) => [
                chunkId,
                tileIds.filter((id) => id !== tileId),
              ]),
            ),
        cursor,
        lastAccessed: Date.now(),
      },
    },
  }
  return { ...next, tiles: rebuildTiles(next) }
}

export const pinQuiltTile = (
  state: QuiltCacheState,
  tileId: string,
  reason: QuiltCachePinReason,
): QuiltCacheState => ({
  ...state,
  pins: { ...state.pins, [tileId]: unique([...(state.pins[tileId] ?? []), reason]) },
})

export const unpinQuiltTile = (
  state: QuiltCacheState,
  tileId: string,
  reason: QuiltCachePinReason,
): QuiltCacheState => {
  const pins = { ...state.pins }
  const remaining = (pins[tileId] ?? []).filter((entry) => entry !== reason)
  if (remaining.length === 0) delete pins[tileId]
  else pins[tileId] = remaining
  const next = { ...state, pins }
  return { ...next, tiles: rebuildTiles(next) }
}

export const setQuiltOptimisticTile = (
  state: QuiltCacheState,
  patchIds: string | string[],
  tile: TileInstance,
  operationId: string = tile.id,
): QuiltCacheState => pinQuiltTile({
  ...state,
  tiles: { ...state.tiles, [tile.id]: tile },
  optimistic: {
    ...state.optimistic,
    [tile.id]: { operationId, patchIds: unique(Array.isArray(patchIds) ? patchIds : [patchIds]), tile },
  },
}, tile.id, 'optimistic')

export const clearQuiltOptimisticTile = (
  state: QuiltCacheState,
  tileId: string,
): QuiltCacheState => {
  const optimistic = { ...state.optimistic }
  delete optimistic[tileId]
  return unpinQuiltTile({ ...state, optimistic }, tileId, 'optimistic')
}

export const reconcileQuiltMutationRevisions = (
  state: QuiltCacheState,
  patchRevisions: QuiltPatchRevisionMap,
  eventIds: Record<string, string>,
): QuiltCacheState => ({
  ...state,
  patches: Object.fromEntries(Object.entries(state.patches).map(([patchId, patch]) => {
    const revision = patchRevisions[patchId]
    if (revision === undefined || revision < patch.cursor.revision) return [patchId, patch]
    return [patchId, {
      ...patch,
      cursor: {
        ...patch.cursor,
        opSeq: Math.max(patch.cursor.opSeq, revision),
        revision,
        eventId: eventIds[patchId] ?? patch.cursor.eventId,
      },
    }]
  })),
})

export const setQuiltUndoMetadata = (
  state: QuiltCacheState,
  metadata: QuiltCacheUndoMetadata,
): QuiltCacheState => pinQuiltTile({
  ...state,
  undo: { ...state.undo, [metadata.tileId]: metadata },
}, metadata.tileId, 'undo')

export const clearQuiltUndoMetadata = (
  state: QuiltCacheState,
  tileId: string,
): QuiltCacheState => {
  const undo = { ...state.undo }
  delete undo[tileId]
  return unpinQuiltTile({ ...state, undo }, tileId, 'undo')
}

export const setQuiltSelection = (
  state: QuiltCacheState,
  clientId: string,
  tileId?: string,
): QuiltCacheState => {
  const selections = { ...state.selections }
  const previousTileId = selections[clientId]
  if (tileId === undefined) delete selections[clientId]
  else selections[clientId] = tileId

  let next = { ...state, selections }
  if (previousTileId && previousTileId !== tileId) {
    next = unpinQuiltTile(next, previousTileId, 'selection')
  }
  return tileId ? pinQuiltTile(next, tileId, 'selection') : next
}

export const evictQuiltCache = (
  state: QuiltCacheState,
  activePatchIds: ReadonlySet<string>,
  maxPatches: number,
): QuiltCacheState => {
  const pinnedPatchIds = new Set<string>()
  Object.keys(state.pins).forEach((tileId) => {
    Object.values(state.patches).forEach((patch) => {
      if (patch.tileIds.includes(tileId)) pinnedPatchIds.add(patch.patchId)
    })
  })
  Object.values(state.optimistic).forEach((operation) => operation.patchIds.forEach((patchId) => pinnedPatchIds.add(patchId)))
  Object.values(state.undo).forEach((metadata) => pinnedPatchIds.add(metadata.patchId))

  const retained = Object.values(state.patches)
    .sort((left, right) => right.lastAccessed - left.lastAccessed)
    .filter((patch, index) =>
      activePatchIds.has(patch.patchId) || pinnedPatchIds.has(patch.patchId) || index < maxPatches,
    )
  const next = {
    ...state,
    patches: Object.fromEntries(retained.map((patch) => [patch.patchId, patch])),
  }
  return { ...next, tiles: rebuildTiles(next) }
}

export const selectQuiltTiles = (state: QuiltCacheState): TileInstance[] =>
  Object.values(state.tiles)

export const selectQuiltCursors = (state: QuiltCacheState): Record<string, QuiltPatchCursor> =>
  Object.fromEntries(Object.values(state.patches).map((patch) => [patch.roomId, patch.cursor]))