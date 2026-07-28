import { describe, expect, it } from 'vitest'
import {
  createQuiltCache,
  evictQuiltCache,
  mergeQuiltPatchSnapshot,
  pinQuiltTile,
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
  })
})