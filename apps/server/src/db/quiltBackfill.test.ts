import { describe, expect, it } from 'vitest'
import type { TileInstance } from '../contracts.js'
import { deriveTileSpatialRefs, resolveCompatibilityGeometry } from './quiltBackfill.js'

const makeTile = (position: { x: number; y: number }): TileInstance => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shape: 'square',
  color: '#abc',
  material: 'ceramic',
  transform: { position, rotation: 0, mirrored: false },
  placedBy: 'legacy-client',
  createdAt: 1,
})

describe('legacy quilt backfill helpers', () => {
  it('creates bounded compatibility geometry without changing the legacy origin', () => {
    expect(resolveCompatibilityGeometry({
      canvasSize: { width: 31.2, height: 20.4 },
      boundsPolicy: {
        mode: 'bounded',
        bounds: { minX: -15.6, maxX: 15.6, minY: -10.2, maxY: 10.2 },
      },
    })).toEqual({ width: 31.2, height: 20.4, originX: -15.6, originY: -10.2 })
  })

  it('derives every intersected chunk while preserving the authoritative tile', () => {
    const tile = makeTile({ x: 7.9, y: 0 })

    expect(deriveTileSpatialRefs(tile)).toEqual([
      { chunkX: 0, chunkY: -1 },
      { chunkX: 0, chunkY: 0 },
      { chunkX: 1, chunkY: -1 },
      { chunkX: 1, chunkY: 0 },
    ])
    expect(tile).toEqual(makeTile({ x: 7.9, y: 0 }))
  })

  it('returns stable references when derivation is repeated', () => {
    const tile = makeTile({ x: -0.1, y: -0.1 })

    expect(deriveTileSpatialRefs(tile)).toEqual(deriveTileSpatialRefs(tile))
  })
})