import { describe, expect, it } from 'vitest'
import {
  applyChunkSubscriptionBudgets,
  shouldRecomputeVisibleChunks,
  viewportToChunkIds,
  worldToChunkCoords,
} from './math2d'

describe('math2d chunk topology', () => {
  it('preserves unbounded chunk enumeration by default', () => {
    expect(viewportToChunkIds({ minX: -1, maxX: 9, minY: -1, maxY: 9 }, 8, 0)).toEqual([
      '-1:-1',
      '-1:0',
      '-1:1',
      '0:-1',
      '0:0',
      '0:1',
      '1:-1',
      '1:0',
      '1:1',
    ])
  })

  it('clips bounded enumeration to the configured chunk range', () => {
    expect(
      viewportToChunkIds(
        { minX: -20, maxX: 20, minY: -20, maxY: 20 },
        8,
        1,
        { mode: 'bounded', bounds: { minX: 0, maxX: 15, minY: 0, maxY: 15 } },
      ),
    ).toEqual(['0:0', '0:1', '1:0', '1:1'])
  })

  it('canonicalizes negative and multi-lap toroidal viewports deterministically', () => {
    const mode = { mode: 'toroidal' as const, chunkColumns: 4, chunkRows: 3 }

    expect(viewportToChunkIds({ minX: -9, maxX: -1, minY: 47, maxY: 55 }, 8, 0, mode)).toEqual([
      '2:2',
      '2:0',
      '3:2',
      '3:0',
    ])
    expect(viewportToChunkIds({ minX: 87, maxX: 95, minY: -25, maxY: -17 }, 8, 0, mode)).toEqual([
      '2:2',
      '2:0',
      '3:2',
      '3:0',
    ])
  })

  it('deduplicates canonical chunks for a corner view and oversized prefetch ring', () => {
    const chunkIds = viewportToChunkIds(
      { minX: -1, maxX: 1, minY: -1, maxY: 1 },
      8,
      4,
      { mode: 'toroidal', chunkColumns: 2, chunkRows: 2 },
    )

    expect(chunkIds).toEqual(['1:1', '1:0', '0:1', '0:0'])
    expect(new Set(chunkIds).size).toBe(chunkIds.length)
  })

  it('keeps existing coordinate, hysteresis, and budget helpers stable', () => {
    expect(worldToChunkCoords(-0.1, 8.1, 8)).toEqual({ chunkX: -1, chunkY: 1 })
    expect(shouldRecomputeVisibleChunks({ x: 0, y: 0 }, { x: 3, y: 0 }, 8, 0.5, 1, 1, 0.2)).toBe(false)
    expect(shouldRecomputeVisibleChunks({ x: 0, y: 0 }, { x: 5, y: 0 }, 8, 0.5, 1, 1, 0.2)).toBe(true)
    expect(applyChunkSubscriptionBudgets(['0:0', '0:1', '1:0'], 2, 3)).toEqual(['0:0', '0:1'])
  })
})