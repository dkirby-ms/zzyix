import { describe, expect, it } from 'vitest'
import {
  defaultBoundsPolicy,
  defaultBounds,
  solveGuidedPlacement,
  validatePlacement,
  type TileInstance,
} from './placementSolver'
import { vec2 } from './math2d'

describe('placementSolver', () => {
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
  })

  it('marks out of bounds as near-valid or invalid with correction', () => {
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
  })

  it('returns guided valid target when nearby anchor is placeable', () => {
    const guided = solveGuidedPlacement(vec2(0.11, -0.08), 'triangle', 0, false, [], defaultBounds)

    expect(guided.valid).toBe(true)
    expect(guided.state).toBe('valid')
    expect(guided.magnetStrength).toBe(0) // snapping disabled
  })

  it('supports explicit bounded policy mode', () => {
    const result = validatePlacement(
      'square',
      {
        position: vec2(defaultBounds.maxX + 0.3, 0),
        rotation: 0,
      },
      [],
      defaultBoundsPolicy,
    )

    expect(result.valid).toBe(false)
    expect(result.reason.startsWith('out-of-bounds')).toBe(true)
  })

  it('supports unbounded-ready policy mode', () => {
    const result = validatePlacement(
      'square',
      {
        position: vec2(defaultBounds.maxX + 30, 0),
        rotation: 0,
      },
      [],
      { mode: 'unbounded' },
    )

    expect(result.valid).toBe(true)
    expect(result.reason).toBe('ok')
  })
})
