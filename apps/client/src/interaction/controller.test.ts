import { describe, expect, it } from 'vitest'
import { vec2 } from '../domain/math2d'
import { createInitialGhost, stepGhost, tryPlaceTile, updateGhostTarget } from './controller'

describe('interaction controller', () => {
  it('eases ghost toward guided transform', () => {
    const active = {
      shape: 'square' as const,
      color: '#fff',
      material: 'ceramic' as const,
      rotation: 0,
      mirrored: false,
    }

    const initial = createInitialGhost()
    const targetGhost = updateGhostTarget(vec2(0.4, 0.2), active, [])
    const combined = {
      ...initial,
      target: targetGhost.target,
      confidence: targetGhost.confidence,
      valid: targetGhost.valid,
      rejection: targetGhost.rejection,
      magnetStrength: targetGhost.magnetStrength,
    }

    const stepped = stepGhost(combined, 1 / 60)
    expect(stepped.current.position.x).not.toBe(combined.current.position.x)
  })

  it('rejects invalid release and accepts valid release', () => {
    const active = {
      shape: 'square' as const,
      color: '#e3a',
      material: 'stone' as const,
      rotation: 0,
      mirrored: false,
    }

    const validGhost = {
      ...createInitialGhost(),
      current: {
        position: vec2(0, 0),
        rotation: 0,
      },
      target: {
        position: vec2(0, 0),
        rotation: 0,
      },
      valid: true,
    }

    const placed = tryPlaceTile(active, validGhost, [])
    expect(placed.rejected).toBe(false)
    expect(placed.placed).toBeDefined()

    const invalidGhost = {
      ...validGhost,
      valid: false,
    }

    const rejected = tryPlaceTile(active, invalidGhost, [])
    expect(rejected.rejected).toBe(true)
    expect(rejected.placed).toBeUndefined()
  })
})
