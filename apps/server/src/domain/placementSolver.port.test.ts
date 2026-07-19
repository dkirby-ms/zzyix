import { describe, expect, it } from 'vitest'
import { defaultBounds, validatePlacement, type TileInstance } from './placementSolver.js'
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
})