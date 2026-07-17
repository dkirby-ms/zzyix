import { describe, expect, it } from 'vitest'
import { vec2 } from '../domain/math2d'
import {
  applySequencedSnapshot,
  createInitialGhost,
  createInitialSequencedTilesState,
  isServerTileId,
  reconcileOptimisticPlacementAck,
  reconcileSequencedTilePlaced,
  reconcileSequencedTileRemoved,
  stepGhost,
  tryPlaceTile,
  updateGhostTarget,
} from './controller'

describe('interaction controller', () => {
  const serverTile = {
    id: '11111111-1111-4111-8111-111111111111',
    shape: 'square' as const,
    color: '#fff',
    material: 'ceramic' as const,
    transform: {
      position: vec2(0, 0),
      rotation: 0,
    },
    createdAt: 1,
  }

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

  it('resets tiles and lastOpSeq from a sequenced snapshot', () => {
    const snapshot = applySequencedSnapshot({
      tiles: [serverTile],
      lastOpSeq: 7,
    })

    expect(snapshot.tiles).toEqual([serverTile])
    expect(snapshot.lastOpSeq).toBe(7)
    expect(snapshot.requiresSnapshot).toBe(false)
  })

  it('deduplicates already-processed placement broadcasts and flags gaps for recovery', () => {
    const current = {
      tiles: [serverTile],
      lastOpSeq: 2,
      requiresSnapshot: false,
    }

    const duplicate = reconcileSequencedTilePlaced(current, {
      opSeq: 2,
      tile: {
        ...serverTile,
        id: '33333333-3333-4333-8333-333333333333',
      },
    })

    expect(duplicate).toBe(current)

    const gap = reconcileSequencedTilePlaced(current, {
      opSeq: 4,
      tile: {
        ...serverTile,
        id: '44444444-4444-4444-8444-444444444444',
      },
    })

    expect(gap.lastOpSeq).toBe(2)
    expect(gap.tiles).toBe(current.tiles)
    expect(gap.requiresSnapshot).toBe(true)
  })

  it('removes tiles and flags gaps for removal broadcasts', () => {
    const current = {
      tiles: [serverTile],
      lastOpSeq: 5,
      requiresSnapshot: false,
    }

    const duplicate = reconcileSequencedTileRemoved(current, {
      tileId: serverTile.id,
      opSeq: 5,
    })

    expect(duplicate).toBe(current)

    const gap = reconcileSequencedTileRemoved(current, {
      tileId: serverTile.id,
      opSeq: 8,
    })

    expect(gap.lastOpSeq).toBe(5)
    expect(gap.tiles).toBe(current.tiles)
    expect(gap.requiresSnapshot).toBe(true)
  })

  it('reconciles optimistic placement acks when the broadcast already arrived', () => {
    const tempTile = {
      ...serverTile,
      id: 'temp-1',
      settleFrom: {
        position: vec2(1, 1),
        rotation: 0,
        mirrored: false,
      },
    }

    const state = {
      tiles: [tempTile, serverTile],
      lastOpSeq: 3,
      requiresSnapshot: false,
    }

    const next = reconcileOptimisticPlacementAck(state, tempTile, {
      placed: serverTile,
      rejected: false,
      opSeq: 4,
    })

    expect(next.tiles).toEqual([serverTile])
    expect(next.lastOpSeq).toBe(4)
    expect(next.requiresSnapshot).toBe(false)
  })

  it('accepts settled server tile ids and rejects optimistic temp ids', () => {
    expect(isServerTileId('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isServerTileId('temp-1234')).toBe(false)
    expect(isServerTileId('9e3d6f0a-59b7-4f40-bf4d-5f2a1b7a9cde')).toBe(true)
  })
})
