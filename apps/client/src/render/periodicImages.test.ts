import { describe, expect, it } from 'vitest'
import { canonicalizeDisplayPoint, enumerateVisibleTileImages, nearestPeriodicPoint } from './periodicImages'

const topology = { patchRows: 2, patchColumns: 2, patchWidth: 10, patchHeight: 10 }
const tile = {
  id: 'tile-a', shape: 'square' as const, color: '#fff', material: 'ceramic' as const,
  transform: { position: { x: 0.2, y: 0.3 }, rotation: 0 }, createdAt: 1,
}

describe('periodicImages', () => {
  it('enumerates edge and corner aliases with stable canonical identity', () => {
    const images = enumerateVisibleTileImages([tile, { ...tile }], {
      minX: 19.5, maxX: 20.5, minY: 19.5, maxY: 20.5,
    }, topology)

    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({ canonicalId: 'tile-a', key: 'tile-a@1:1', position: { x: 20.2, y: 20.3 } })
  })

  it('keeps canonical and nearest-image math stable after repeated laps', () => {
    expect(canonicalizeDisplayPoint({ x: 2_000_019.8, y: -1_999_999.7 }, topology)).toEqual({
      x: expect.closeTo(19.8), y: expect.closeTo(0.3),
    })
    expect(nearestPeriodicPoint({ x: 0.2, y: 0.3 }, { x: 19.9, y: 19.8 }, topology)).toEqual({
      x: expect.closeTo(20.2), y: expect.closeTo(20.3),
    })
  })
})