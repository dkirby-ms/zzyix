import { describe, expect, it } from 'vitest'
import {
  canonicalizeGridAddress,
  decomposeWrappedViewport,
  deduplicateCanonicalSubscriptions,
  enumeratePeriodicImages,
  nearestImageDelta,
  positiveModulo,
  resolveCanonicalPoint,
  type QuiltTopology,
} from './quiltTopology'

const topology: QuiltTopology = {
  patchRows: 2,
  patchColumns: 3,
  patchWidth: 10,
  patchHeight: 8,
}

describe('quiltTopology', () => {
  it.each([
    [-1, 30, 29],
    [-61, 30, 29],
    [30, 30, 0],
    [91, 30, 1],
  ])('resolves positiveModulo(%s, %s) to %s', (value, period, expected) => {
    expect(positiveModulo(value, period)).toBe(expected)
  })

  it('resolves seams, negative coordinates, and multiple periods to half-open patch coordinates', () => {
    expect(resolveCanonicalPoint({ x: 30, y: 16 }, topology)).toEqual({
      point: { x: 0, y: 0 },
      patch: { row: 0, column: 0 },
      local: { x: 0, y: 0 },
    })
    expect(resolveCanonicalPoint({ x: -1, y: -17 }, topology)).toEqual({
      point: { x: 29, y: 15 },
      patch: { row: 1, column: 2 },
      local: { x: 9, y: 7 },
    })
    expect(resolveCanonicalPoint({ x: 71, y: 41 }, topology)).toEqual({
      point: { x: 11, y: 9 },
      patch: { row: 1, column: 1 },
      local: { x: 1, y: 1 },
    })
  })

  it('chooses deterministic nearest-image deltas, including half-period ties', () => {
    expect(nearestImageDelta(29, 30)).toBe(-1)
    expect(nearestImageDelta(-29, 30)).toBe(1)
    expect(nearestImageDelta(15, 30)).toBe(-15)
    expect(nearestImageDelta(75, 30)).toBe(-15)
  })

  it('decomposes a corner view into four canonical rectangles', () => {
    expect(decomposeWrappedViewport({ minX: 28, maxX: 32, minY: 14, maxY: 18 }, topology)).toEqual([
      { minX: 28, maxX: 30, minY: 14, maxY: 16 },
      { minX: 28, maxX: 30, minY: 0, maxY: 2 },
      { minX: 0, maxX: 2, minY: 14, maxY: 16 },
      { minX: 0, maxX: 2, minY: 0, maxY: 2 },
    ])
  })

  it('collapses spans of one or more periods to deterministic full-axis coverage', () => {
    expect(decomposeWrappedViewport({ minX: -65, maxX: 65, minY: 2, maxY: 6 }, topology)).toEqual([
      { minX: 0, maxX: 30, minY: 2, maxY: 6 },
    ])
    expect(decomposeWrappedViewport({ minX: -65, maxX: 65, minY: -40, maxY: 40 }, topology)).toEqual([
      { minX: 0, maxX: 30, minY: 0, maxY: 16 },
    ])
  })

  it('enumerates only periodic images intersecting the unwrapped viewport', () => {
    expect(
      enumeratePeriodicImages(
        { minX: 0, maxX: 2, minY: 0, maxY: 2 },
        { minX: -1, maxX: 31, minY: -1, maxY: 3 },
        topology,
      ),
    ).toEqual([
      { offset: { x: 0, y: 0 }, rect: { minX: 0, maxX: 2, minY: 0, maxY: 2 } },
      { offset: { x: 30, y: 0 }, rect: { minX: 30, maxX: 32, minY: 0, maxY: 2 } },
    ])
  })

  it('canonicalizes and deduplicates periodic grid subscriptions in first-seen order', () => {
    expect(canonicalizeGridAddress({ column: -1, row: 5 }, 4, 3)).toEqual({ column: 3, row: 2 })
    expect(
      deduplicateCanonicalSubscriptions(
        [
          { column: -1, row: -1 },
          { column: 3, row: 2 },
          { column: 7, row: 5 },
          { column: 0, row: 0 },
        ],
        4,
        3,
      ),
    ).toEqual([
      { column: 3, row: 2 },
      { column: 0, row: 0 },
    ])
  })

  it.each([
    () => positiveModulo(Number.NaN, 1),
    () => positiveModulo(1, 0),
    () => resolveCanonicalPoint({ x: Number.POSITIVE_INFINITY, y: 0 }, topology),
    () => resolveCanonicalPoint({ x: 0, y: 0 }, { ...topology, patchRows: 1.5 }),
    () => decomposeWrappedViewport({ minX: 2, maxX: 1, minY: 0, maxY: 1 }, topology),
    () => canonicalizeGridAddress({ column: 0.5, row: 0 }, 2, 2),
  ])('rejects invalid finite, dimension, count, and range inputs', (operation) => {
    expect(operation).toThrow(RangeError)
  })
})