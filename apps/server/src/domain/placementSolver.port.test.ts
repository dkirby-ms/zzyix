import { describe, expect, it } from 'vitest'
import {
  defaultBounds,
  derivePlacementBounds,
  MAX_GROUT_GAP,
  projectPeriodicNeighbors,
  validatePlacement,
  type TileInstance,
} from './placementSolver.js'
import { vec2 } from './math2d.js'

describe('placementSolver server parity', () => {
  it('rejects overlap against existing settled tiles', () => {
    const settled: TileInstance[] = [
      {
        id: 'a',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: {
          position: vec2(0, 0),
          rotation: 0,
        },
        createdAt: 0,
      },
    ]

    const result = validatePlacement(
      'square',
      {
        position: vec2(0.03, 0.02),
        rotation: 0,
      },
      settled,
      defaultBounds,
    )

    expect(result.valid).toBe(false)
    expect(result.state).toBe('invalid')
    expect(result.penetration).toBeGreaterThan(0)
    expect(result.reason).toContain('overlap')
  })

  it('marks out-of-bounds with correction and rejection', () => {
    const result = validatePlacement(
      'rectangle',
      {
        position: vec2(defaultBounds.maxX + 0.1, 0),
        rotation: 0,
      },
      [],
      defaultBounds,
    )

    expect(result.valid).toBe(false)
    expect(result.correction.x).toBeLessThan(0)
    expect(result.reason).toContain('out-of-bounds')
  })

  it('accepts placement outside finite bounds when policy mode is unbounded', () => {
    const result = validatePlacement(
      'rectangle',
      {
        position: vec2(defaultBounds.maxX + 50, 0),
        rotation: 0,
      },
      [],
      { mode: 'unbounded' },
    )

    expect(result.valid).toBe(true)
    expect(result.reason).toBe('ok')
  })

  it('accepts isolated placement away from settled tiles', () => {
    const settled: TileInstance[] = [{
      id: 'existing',
      shape: 'square',
      color: '#fff',
      material: 'ceramic',
      transform: { position: vec2(0, 0), rotation: 0 },
      createdAt: 0,
    }]

    const result = validatePlacement(
      'square',
      { position: vec2(20, 20), rotation: 0 },
      settled,
      { mode: 'unbounded' },
    )

    expect(result.valid).toBe(true)
    expect(result.reason).toBe('ok')
  })

  it('derives the rotated geometry footprint and collision halo', () => {
    const bounds = derivePlacementBounds(
      'rectangle',
      { position: vec2(10, 20), rotation: Math.PI / 2 },
      MAX_GROUT_GAP,
    )

    expect(bounds.minX).toBeCloseTo(10 - 0.88 * 0.36 - MAX_GROUT_GAP)
    expect(bounds.maxX).toBeCloseTo(10 + 0.88 * 0.36 + MAX_GROUT_GAP)
    expect(bounds.minY).toBeCloseTo(20 - 0.88 * 0.68 - MAX_GROUT_GAP)
    expect(bounds.maxY).toBeCloseTo(20 + 0.88 * 0.68 + MAX_GROUT_GAP)
  })

  it('projects seam neighbors to the nearest periodic image before validation', () => {
    const topology = { patchRows: 1, patchColumns: 2, patchWidth: 10, patchHeight: 10 }
    const settled: TileInstance[] = [
      {
        id: 'seam-neighbor',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: { position: vec2(19.8, 5), rotation: 0 },
        createdAt: 0,
      },
    ]
    const candidate = { position: vec2(0.2, 5), rotation: 0 }

    const projected = projectPeriodicNeighbors(settled, candidate.position, topology)
    const result = validatePlacement('square', candidate, projected, { mode: 'unbounded' })

    expect(projected[0]?.transform.position.x).toBeCloseTo(-0.2)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('overlap')
  })
})