import { describe, expect, it } from 'vitest'
import { GRID_PATTERNS, generateGridPatternSlots } from './gridPatterns'
import { resolveGridPlacement } from './gridPlacement'
import type { TileInstance } from './placementSolver'

const unbounded = { mode: 'unbounded' as const }
const squarePattern = GRID_PATTERNS.find((pattern) => pattern.id === 'square-lattice')!
const runningBond = GRID_PATTERNS.find((pattern) => pattern.id === 'running-bond')!
const triangles = GRID_PATTERNS.find((pattern) => pattern.id === 'triangle-tessellation')!

describe('resolveGridPlacement', () => {
  it('strictly snaps nearby pointers to the same exact slot transform', () => {
    const first = resolveGridPlacement({ x: 0.1, y: 0.1 }, 'square', squarePattern, [], unbounded)
    const second = resolveGridPlacement({ x: -0.1, y: 0.08 }, 'square', squarePattern, [], unbounded)

    expect(first.transform).toEqual(second.transform)
    expect(first.transform.position).toEqual({ x: 0, y: 0 })
  })

  it('uses slot-owned orientation and deterministic tie breaking', () => {
    const downSlot = generateGridPatternSlots(triangles, {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    }).find((slot) => slot.templateSlotId === 'down')!
    const result = resolveGridPlacement(
      downSlot.transform.position,
      'triangle',
      triangles,
      [],
      unbounded,
    )

    expect(result.slot.id).toBe(downSlot.id)
    expect(result.transform.rotation).toBe(Math.PI)
    expect(result.transform.mirrored).toBe(false)
  })

  it('returns an aligned invalid target for incompatible shapes', () => {
    const result = resolveGridPlacement({ x: 0.13, y: -0.17 }, 'triangle', runningBond, [], unbounded)

    expect(result.valid).toBe(false)
    expect(result.slot.patternId).toBe('running-bond')
    expect(result.transform.position).not.toEqual({ x: 0.13, y: -0.17 })
    expect(result.reason).toContain('Choose Rectangle')
  })

  it('prefers a valid candidate over a closer occupied slot without moving settled tiles', () => {
    const originSlot = generateGridPatternSlots(squarePattern, {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })[0]
    const settled: TileInstance[] = [
      {
        id: 'existing',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: originSlot.transform,
        createdAt: 0,
      },
    ]
    const snapshot = structuredClone(settled)
    const result = resolveGridPlacement({ x: 0.02, y: 0 }, 'square', squarePattern, settled, unbounded)

    expect(result.valid).toBe(true)
    expect(result.slot.id).not.toBe(originSlot.id)
    expect(settled).toEqual(snapshot)
  })

  it('returns the closest exact slot as invalid when bounds block every candidate', () => {
    const result = resolveGridPlacement(
      { x: 8.33, y: 8.67 },
      'square',
      squarePattern,
      [],
      { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    )

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('out-of-bounds')
    expect(result.transform.position).not.toEqual({ x: 8.33, y: 8.67 })
  })
})
