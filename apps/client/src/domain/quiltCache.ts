import type { QuiltPatchCursor, QuiltPatchRevisionMap } from '../../../server/src/contracts'
import type { TileInstance } from './placementSolver'

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

  const next: QuiltCacheState = {
    ...state,
    tiles,
    patches: {
      ...state.patches,
      [input.patchId]: {
        patchId: input.patchId,
        roomId: input.roomId,
        chunkIds: unique(input.chunkIds ?? []),
        tileIds: unique(input.tiles.map((tile) => tile.id)),
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

  const next = {
    ...state,
    tiles: { ...state.tiles, [tile.id]: tile },
    patches: {
      ...state.patches,
      [patchId]: {
        ...patch,
        tileIds: unique([...patch.tileIds, tile.id]),
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
        tileIds: patch.tileIds.filter((id) => id !== tileId),
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