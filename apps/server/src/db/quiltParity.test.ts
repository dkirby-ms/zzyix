import { describe, expect, it } from 'vitest'
import type { TileInstance } from '../contracts.js'
import { compareLegacyAndPatchTiles } from './quiltParity.js'

const makeTile = (id: string, overrides: Partial<TileInstance> = {}): TileInstance => ({
  id,
  shape: 'square',
  color: '#abc',
  material: 'ceramic',
  transform: {
    position: { x: 1.25, y: -2.5 },
    rotation: 0.25,
    mirrored: true,
  },
  placedBy: 'legacy-author',
  createdAt: 123,
  ...overrides,
})

describe('legacy versus patch tile parity', () => {
  it('accepts the same persisted tile state independent of read ordering', () => {
    const first = makeTile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const second = makeTile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')

    expect(compareLegacyAndPatchTiles([first, second], [second, first])).toEqual({
      matches: true,
      legacyTileCount: 2,
      patchTileCount: 2,
      missingFromPatch: [],
      missingFromLegacy: [],
      mismatches: [],
    })
  })

  it('reports missing identities and layout or authorship drift', () => {
    const changed = makeTile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
      placedBy: 'different-author',
      transform: { position: { x: 9, y: -2.5 }, rotation: 0.25, mirrored: true },
    })

    expect(compareLegacyAndPatchTiles(
      [makeTile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), makeTile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')],
      [changed, makeTile('cccccccc-cccc-4ccc-8ccc-cccccccccccc')],
    )).toEqual({
      matches: false,
      legacyTileCount: 2,
      patchTileCount: 2,
      missingFromPatch: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      missingFromLegacy: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
      mismatches: [{
        tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        fields: ['positionX', 'placedBy'],
      }],
    })
  })
})