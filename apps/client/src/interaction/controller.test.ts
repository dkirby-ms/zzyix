import { describe, expect, it } from 'vitest'
import { vec2 } from '../domain/math2d'
import {
  applySequencedSnapshot,
  createInitialGhost,
  createInitialSequencedTilesState,
  reconcileSequencedTilePlaced,
  reconcileSequencedTileRemoved,
  stepGhost,
  tryPlaceTile,
  updateGhostTarget,
} from './controller'

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

  it('applies ordered sequence events and flags gaps for snapshot recovery', () => {
    const base = applySequencedSnapshot({ tiles: [], lastOpSeq: 0 })
    const first = reconcileSequencedTilePlaced(base, {
      opSeq: 1,
      tile: {
        id: '11111111-1111-4111-8111-111111111111',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: {
          position: vec2(0, 0),
          rotation: 0,
        },
        createdAt: 1,
      },
    })

    expect(first.lastOpSeq).toBe(1)
    expect(first.tiles).toHaveLength(1)
    expect(first.requiresSnapshot).toBe(false)

    const removed = reconcileSequencedTileRemoved(first, {
      tileId: '11111111-1111-4111-8111-111111111111',
      opSeq: 2,
    })

    expect(removed.lastOpSeq).toBe(2)
    expect(removed.tiles).toHaveLength(0)
    expect(removed.requiresSnapshot).toBe(false)

    const gap = reconcileSequencedTilePlaced(createInitialSequencedTilesState(), {
      opSeq: 3,
      tile: {
        id: '22222222-2222-4222-8222-222222222222',
        shape: 'square',
        color: '#000',
        material: 'glass',
        transform: {
          position: vec2(1, 0),
          rotation: 0,
        },
        createdAt: 2,
      },
    })

    expect(gap.requiresSnapshot).toBe(true)
    expect(gap.lastOpSeq).toBe(0)
  })
})
