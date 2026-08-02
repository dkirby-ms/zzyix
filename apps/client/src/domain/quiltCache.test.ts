import { describe, expect, it } from 'vitest'
import {
  createQuiltCache,
  clearQuiltOptimisticTile,
  clearQuiltUndoMetadata,
  evictQuiltCache,
  mergeQuiltPatchSnapshot,
  pinQuiltTile,
  reconcileQuiltMutationRevisions,
  selectQuiltTiles,
  setQuiltOptimisticTile,
  setQuiltUndoMetadata,
} from './quiltCache'
import type { TileInstance } from './placementSolver'

const tile = (id: string): TileInstance => ({
  id,
  shape: 'square',
  color: '#fff',
  material: 'ceramic',
  transform: { position: { x: 0, y: 0 }, rotation: 0 },
  createdAt: 1,
})

const positionedTile = (id: string, x: number, y: number): TileInstance => ({
  ...tile(id),
  transform: { position: { x, y }, rotation: 0 },
})

const cursor = (patchId: string, opSeq: number) => ({ patchId, opSeq, revision: opSeq })

describe('quiltCache', () => {
  it('deduplicates canonical tiles shared by patch snapshots', () => {
    const first = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'patch-a', roomId: 'room-a', tiles: [tile('shared')], cursor: cursor('patch-a', 1), accessedAt: 1,
    })
    const second = mergeQuiltPatchSnapshot(first, {
      patchId: 'patch-b', roomId: 'room-b', tiles: [tile('shared')], cursor: cursor('patch-b', 1), accessedAt: 2,
    })

    expect(selectQuiltTiles(second).map(({ id }) => id)).toEqual(['shared'])
  })

  it('evicts inactive least-recent patches while preserving selected tiles', () => {
    let state = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'old', roomId: 'room-old', tiles: [tile('selected')], cursor: cursor('old', 1), accessedAt: 1,
    })
    state = mergeQuiltPatchSnapshot(state, {
      patchId: 'new', roomId: 'room-new', tiles: [tile('visible')], cursor: cursor('new', 2), accessedAt: 2,
    })
    state = pinQuiltTile(state, 'selected', 'selection')

    const evicted = evictQuiltCache(state, new Set(['new']), 0)

    expect(Object.keys(evicted.patches).sort()).toEqual(['new', 'old'])
    expect(selectQuiltTiles(evicted).map(({ id }) => id).sort()).toEqual(['selected', 'visible'])
  })

  it('bounds unpinned traversal state to the configured patch budget', () => {
    let state = createQuiltCache()
    for (let index = 0; index < 20; index += 1) {
      state = mergeQuiltPatchSnapshot(state, {
        patchId: `patch-${index}`,
        roomId: `room-${index}`,
        tiles: [tile(`tile-${index}`)],
        cursor: cursor(`patch-${index}`, index),
        accessedAt: index,
      })
    }

    const evicted = evictQuiltCache(state, new Set(), 4)
    expect(Object.keys(evicted.patches)).toHaveLength(4)
    expect(selectQuiltTiles(evicted)).toHaveLength(4)
  })

  it('persists accepted chunk scope and retains the active viewport patch', () => {
    let state = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'active', roomId: 'room-active', chunkIds: ['2:3', '2:3'], tiles: [tile('active-tile')], cursor: cursor('active', 1), accessedAt: 1,
    })
    state = mergeQuiltPatchSnapshot(state, {
      patchId: 'inactive', roomId: 'room-inactive', chunkIds: ['9:9'], tiles: [tile('inactive-tile')], cursor: cursor('inactive', 2), accessedAt: 2,
    })

    const activePatchIds = new Set(
      Object.values(state.patches)
        .filter((patch) => patch.chunkIds.includes('2:3'))
        .map((patch) => patch.patchId),
    )
    const evicted = evictQuiltCache(state, activePatchIds, 0)

    expect(state.patches.active.chunkIds).toEqual(['2:3'])
    expect(Object.keys(evicted.patches)).toEqual(['active'])
    expect(selectQuiltTiles(evicted).map(({ id }) => id)).toEqual(['active-tile'])
  })

  it('retains previously loaded chunks for the same patch while replacing refreshed chunk scope', () => {
    let state = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'patch-a',
      roomId: 'room-a',
      chunkIds: ['0:0'],
      tiles: [positionedTile('chunk-a', 1, 1)],
      cursor: cursor('patch-a', 1),
      accessedAt: 1,
    })
    state = mergeQuiltPatchSnapshot(state, {
      patchId: 'patch-a',
      roomId: 'room-a',
      chunkIds: ['1:0'],
      tiles: [positionedTile('chunk-b', 9, 1)],
      cursor: cursor('patch-a', 2),
      accessedAt: 2,
    })

    expect(selectQuiltTiles(state).map(({ id }) => id).sort()).toEqual(['chunk-a', 'chunk-b'])
    expect(state.patches['patch-a'].chunkIds.sort()).toEqual(['0:0', '1:0'])

    state = mergeQuiltPatchSnapshot(state, {
      patchId: 'patch-a',
      roomId: 'room-a',
      chunkIds: ['0:0'],
      tiles: [],
      cursor: cursor('patch-a', 3),
      accessedAt: 3,
    })

    expect(selectQuiltTiles(state).map(({ id }) => id)).toEqual(['chunk-b'])
    expect(state.patches['patch-a'].chunkIds.sort()).toEqual(['0:0', '1:0'])
  })

  it('retains optimistic and undoable entities outside the active area', () => {
    let state = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'pending-patch', roomId: 'pending-room', tiles: [], cursor: cursor('pending-patch', 1), accessedAt: 1,
    })
    state = setQuiltOptimisticTile(state, 'pending-patch', tile('pending'))
    state = setQuiltUndoMetadata(state, {
      tileId: 'pending', patchId: 'pending-patch', operation: 'place', revision: 1,
    })

    const evicted = evictQuiltCache(state, new Set(), 0)
    expect(evicted.patches['pending-patch']).toBeDefined()
    expect(evicted.tiles.pending).toBeDefined()
    expect(evicted.pins.pending).toEqual(['optimistic', 'undo'])

    const acknowledged = clearQuiltOptimisticTile(evicted, 'pending')
    expect(acknowledged.pins.pending).toEqual(['undo'])

    const removed = clearQuiltUndoMetadata(acknowledged, 'pending')
    expect(removed.pins.pending).toBeUndefined()
    expect(removed.tiles.pending).toBeUndefined()
  })

  it('ignores duplicate and out-of-order patch revisions', () => {
    const initial = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'patch-a', roomId: 'room-a', tiles: [tile('settled')], cursor: cursor('patch-a', 3), accessedAt: 1,
    })
    const stale = mergeQuiltPatchSnapshot(initial, {
      patchId: 'patch-a', roomId: 'room-a', tiles: [], cursor: cursor('patch-a', 2), accessedAt: 2,
    })

    expect(stale).toBe(initial)
    expect(selectQuiltTiles(stale).map(({ id }) => id)).toEqual(['settled'])
  })

  it('reconciles authoritative revisions across every affected patch monotonically', () => {
    let state = mergeQuiltPatchSnapshot(createQuiltCache(), {
      patchId: 'patch-a', roomId: 'room-a', tiles: [], cursor: cursor('patch-a', 2), accessedAt: 1,
    })
    state = mergeQuiltPatchSnapshot(state, {
      patchId: 'patch-b', roomId: 'room-b', tiles: [], cursor: cursor('patch-b', 5), accessedAt: 2,
    })

    const accepted = reconcileQuiltMutationRevisions(state, { 'patch-a': 3, 'patch-b': 6 }, {
      'patch-a': 'event-a', 'patch-b': 'event-b',
    })
    const duplicate = reconcileQuiltMutationRevisions(accepted, { 'patch-a': 3, 'patch-b': 6 }, {
      'patch-a': 'event-a', 'patch-b': 'event-b',
    })
    const stale = reconcileQuiltMutationRevisions(duplicate, { 'patch-a': 1, 'patch-b': 4 }, {})

    expect(stale.patches['patch-a'].cursor).toMatchObject({ revision: 3, eventId: 'event-a' })
    expect(stale.patches['patch-b'].cursor).toMatchObject({ revision: 6, eventId: 'event-b' })
  })
})