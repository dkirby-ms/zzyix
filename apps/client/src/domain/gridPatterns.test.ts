import { describe, expect, it } from 'vitest'
import { validatePlacement, type TileInstance } from './placementSolver'
import { TILE_SHAPES } from './tileGeometry'
import {
  GRID_PATTERNS,
  generateGridPatternSlots,
  getConstructibleGridPatterns,
  getNearestGridCells,
  getPatternCompatibleShapes,
  getViewportCellRange,
  worldToLattice,
} from './gridPatterns'

const unbounded = { mode: 'unbounded' as const }

describe('gridPatterns', () => {
  it('defines unique, invertible patterns and template slots', () => {
    expect(new Set(GRID_PATTERNS.map((pattern) => pattern.id)).size).toBe(GRID_PATTERNS.length)

    for (const pattern of GRID_PATTERNS) {
      const [basisX, basisY] = pattern.basis
      const determinant = basisX.x * basisY.y - basisX.y * basisY.x

      expect(Number.isFinite(determinant)).toBe(true)
      expect(Math.abs(determinant)).toBeGreaterThan(Number.EPSILON)
      expect(new Set(pattern.slots.map((slot) => slot.id)).size).toBe(pattern.slots.length)
      expect(pattern.slots.every((slot) => TILE_SHAPES.includes(slot.shape))).toBe(true)
      expect(getPatternCompatibleShapes(pattern)).toEqual(
        Array.from(new Set(pattern.slots.map((slot) => slot.shape))),
      )
    }
  })

  it('filters patterns from the shapes referenced by their slots', () => {
    expect(getConstructibleGridPatterns(new Set(TILE_SHAPES))).toHaveLength(5)
    expect(getConstructibleGridPatterns(new Set(['square']))).toEqual([
      expect.objectContaining({ id: 'square-lattice' }),
    ])
    expect(getConstructibleGridPatterns(new Set(['square', 'rectangle']))).toEqual([
      expect.objectContaining({ id: 'square-lattice' }),
      expect.objectContaining({ id: 'running-bond' }),
    ])
    expect(getConstructibleGridPatterns(new Set(['large-square']))).toEqual([
      expect.objectContaining({ id: 'large-square-lattice' }),
    ])
    expect(getConstructibleGridPatterns(new Set(['right-triangle']))).toEqual([
      expect.objectContaining({ id: 'right-triangle-pinwheel' }),
    ])
  })

  it('keeps lattice conversion and nearest cells stable across negative coordinates', () => {
    const pattern = GRID_PATTERNS[0]
    const [basisX, basisY] = pattern.basis
    const point = {
      x: -2 * basisX.x + basisY.x,
      y: -2 * basisX.y + basisY.y,
    }
    const lattice = worldToLattice(pattern, point)

    expect(lattice.x).toBeCloseTo(-2)
    expect(lattice.y).toBeCloseTo(1)
    expect(getNearestGridCells(pattern, point)).toContainEqual({ x: -2, y: 1 })
  })

  it('generates deterministic world-origin slot IDs and viewport overscan', () => {
    const pattern = GRID_PATTERNS[0]
    const range = getViewportCellRange(pattern, {
      minX: -0.1,
      maxX: 0.1,
      minY: -0.1,
      maxY: 0.1,
    })
    const slots = generateGridPatternSlots(pattern, range)
    const origin = slots.find((slot) => slot.cell.x === 0 && slot.cell.y === 0)

    expect(range).toEqual({ minX: -2, maxX: 2, minY: -2, maxY: 2 })
    expect(origin?.id).toBe('square-lattice:0:0:square')
    expect(origin?.transform.position).toEqual({ x: 0, y: 0 })
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(slots.length)
  })

  it.each(GRID_PATTERNS)('supports an incrementally valid fill sequence for $label', (pattern) => {
    const generated = generateGridPatternSlots(pattern, {
      minX: 0,
      maxX: 2,
      minY: 0,
      maxY: 0,
    }).sort((left, right) =>
      left.transform.position.x - right.transform.position.x ||
      left.transform.position.y - right.transform.position.y ||
      left.id.localeCompare(right.id),
    )
    const settled: TileInstance[] = []

    for (const [index, slot] of generated.entries()) {
      const validation = validatePlacement(slot.shape, slot.transform, settled, unbounded)
      expect(validation.valid, `${slot.id}: ${validation.reason}`).toBe(true)
      settled.push({
        id: `tile-${index}`,
        shape: slot.shape,
        color: '#fff',
        material: 'ceramic',
        transform: slot.transform,
        createdAt: index,
      })
    }
  })
})
