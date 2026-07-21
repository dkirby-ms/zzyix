import { describe, expect, it } from 'vitest'
import type { TileInstance } from '../contracts.js'
import { areChunkTileSetsEquivalent } from './repository.js'

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
})
