import { describe, expect, it } from 'vitest'
import type { TileInstance } from '../contracts.js'
import {
  areChunkTileSetsEquivalent,
  areTileSpatialRefsEquivalent,
  deriveAffectedPatchAddresses,
} from './repository.js'

const makeTile = (id: string, x: number, y: number): TileInstance => ({
  id,
  shape: 'square',
  color: '#abc',
  material: 'ceramic',
  transform: {
    position: { x, y },
    rotation: 0,
  },
  createdAt: 1,
})

describe('repository chunk parity helpers', () => {
  it('treats equivalent chunked tile sets as parity matches regardless of ordering', () => {
    const left = [
      makeTile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0.1, 0.2),
      makeTile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 8.2, 0.1),
    ]
    const right = [
      makeTile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 8.2, 0.1),
      makeTile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0.1, 0.2),
    ]

    expect(areChunkTileSetsEquivalent(left, right)).toBe(true)
  })

  it('detects parity mismatch at chunk boundaries for the same tile id', () => {
    const legacyTiles = [makeTile('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 7.99, 0)]
    const chunkTiles = [makeTile('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 8.01, 0)]

    expect(areChunkTileSetsEquivalent(chunkTiles, legacyTiles)).toBe(false)
  })

  it('compares derived spatial references independent of query ordering', () => {
    const expected = [
      { tileId: 'tile-a', patchId: 'patch-a', chunkX: 0, chunkY: 0 },
      { tileId: 'tile-a', patchId: 'patch-a', chunkX: 1, chunkY: 0 },
    ]
    const actual = [...expected].reverse()

    expect(areTileSpatialRefsEquivalent(expected, actual)).toBe(true)
    expect(areTileSpatialRefsEquivalent(expected, actual.slice(1))).toBe(false)
  })
})

describe('patch lock-set helpers', () => {
  const topology = { patchRows: 2, patchColumns: 4, patchWidth: 10, patchHeight: 10 }

  it('deduplicates and sorts patches intersected across a toroidal seam', () => {
    expect(deriveAffectedPatchAddresses(topology, {
      minX: 39.5,
      maxX: 40.5,
      minY: 4,
      maxY: 6,
    })).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 3 },
    ])
  })

  it('returns identical lock sets for equivalent periodic footprints', () => {
    const canonical = deriveAffectedPatchAddresses(topology, { minX: -0.5, maxX: 0.5, minY: 4, maxY: 6 })
    const repeated = deriveAffectedPatchAddresses(topology, { minX: 39.5, maxX: 40.5, minY: 4, maxY: 6 })

    expect(repeated).toEqual(canonical)
  })
})
