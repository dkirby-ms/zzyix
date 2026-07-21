import { describe, expect, it } from 'vitest'
import { vec2 } from '../domain/math2d'
import {
  applySequencedSnapshot,
  createServerTileId,
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

  it('honors provided bounds when computing ghost validity', () => {
    const active = {
      shape: 'square' as const,
      color: '#fff',
      material: 'ceramic' as const,
      rotation: 0,
      mirrored: false,
    }

    const narrowBounds = {
      minX: -1,
      maxX: 1,
      minY: -1,
      maxY: 1,
    }

    const ghostOutsideNarrowBounds = updateGhostTarget(vec2(4, 0), active, [], narrowBounds)
    expect(ghostOutsideNarrowBounds.valid).toBe(false)

    const wideBounds = {
      minX: -8,
      maxX: 8,
      minY: -4,
      maxY: 4,
    }

    const ghostInsideWideBounds = updateGhostTarget(vec2(4, 0), active, [], wideBounds)
    expect(ghostInsideWideBounds.valid).toBe(true)
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
      revision: 3,
    })

    expect(snapshot.tiles).toEqual([serverTile])
    expect(snapshot.lastOpSeq).toBe(7)
    expect(snapshot.requiresSnapshot).toBe(false)
  })

  it('deduplicates already-processed placement broadcasts and flags gaps for recovery', () => {
    const current = {
      tiles: [serverTile],
      lastOpSeq: 2,
      revision: 0,
      requiresSnapshot: false,
    }

    const duplicate = reconcileSequencedTilePlaced(current, {
      opSeq: 2,
      revision: 1,
      tile: {
        ...serverTile,
        id: '33333333-3333-4333-8333-333333333333',
      },
    })

    expect(duplicate).toBe(current)

    const gap = reconcileSequencedTilePlaced(current, {
      opSeq: 4,
      revision: 2,
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
      revision: 0,
      requiresSnapshot: false,
    }

    const duplicate = reconcileSequencedTileRemoved(current, {
      tileId: serverTile.id,
      opSeq: 5,
      revision: 1,
    })

    expect(duplicate).toBe(current)

    const gap = reconcileSequencedTileRemoved(current, {
      tileId: serverTile.id,
      opSeq: 8,
      revision: 2,
    })

    expect(gap.lastOpSeq).toBe(5)
    expect(gap.tiles).toBe(current.tiles)
    expect(gap.requiresSnapshot).toBe(true)
  })

  it('replaces temp tile with server tile on accepted ack', () => {
    const tempTile = {
      ...serverTile,
      id: 'temp-accept',
      settleFrom: {
        position: vec2(0.25, 0.5),
        rotation: 0,
        mirrored: false,
      },
    }

    const state = {
      tiles: [tempTile],
      lastOpSeq: 2,
      revision: 1,
      requiresSnapshot: false,
    }

    const ackedTile = {
      ...serverTile,
      id: '22222222-2222-4222-8222-222222222222',
    }

    const next = reconcileOptimisticPlacementAck(state, tempTile, {
      placed: ackedTile,
      rejected: false,
      opSeq: 3,
      newRevision: 2,
    })

    expect(next.tiles).toHaveLength(1)
    expect(next.tiles[0].id).toBe(ackedTile.id)
    expect(next.tiles[0].settleFrom).toEqual(tempTile.settleFrom)
    expect(next.lastOpSeq).toBe(3)
    expect(next.requiresSnapshot).toBe(false)
    expect(next.revision).toBe(2)
  })

  it('removes temp tile on rejected ack', () => {
    const tempTile = {
      ...serverTile,
      id: 'temp-reject',
    }

    const state = {
      tiles: [tempTile],
      lastOpSeq: 4,
      revision: 5,
      requiresSnapshot: false,
    }

    const next = reconcileOptimisticPlacementAck(state, tempTile, {
      placed: null,
      rejected: true,
    })

    expect(next.tiles).toHaveLength(0)
    expect(next.lastOpSeq).toBe(4)
    expect(next.requiresSnapshot).toBe(false)
    expect(next.revision).toBe(5)
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
      revision: 2,
      requiresSnapshot: false,
    }

    const next = reconcileOptimisticPlacementAck(state, tempTile, {
      placed: serverTile,
      rejected: false,
      opSeq: 4,
      newRevision: 3,
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

  it('creates UUID tile ids acceptable to server validation', () => {
    const first = createServerTileId()
    const second = createServerTileId()

    expect(isServerTileId(first)).toBe(true)
    expect(isServerTileId(second)).toBe(true)
    expect(first).not.toBe(second)
  })

  it('initializes revision to 0 in createInitialSequencedTilesState', () => {
    const state = createInitialSequencedTilesState()
    expect(state.revision).toBe(0)
  })

  it('applySequencedSnapshot sets revision from snapshot payload', () => {
    const state = applySequencedSnapshot({
      tiles: [serverTile],
      lastOpSeq: 5,
      revision: 7,
    })
    expect(state.revision).toBe(7)
  })

  it('reconcileOptimisticPlacementAck advances revision to newRevision on acceptance', () => {
    const tempTile = { ...serverTile, id: 'temp-rev-accept' }
    const state = {
      tiles: [tempTile],
      lastOpSeq: 1,
      revision: 4,
      requiresSnapshot: false,
    }
    const ackedTile = { ...serverTile, id: '55555555-5555-4555-8555-555555555555' }

    const next = reconcileOptimisticPlacementAck(state, tempTile, {
      placed: ackedTile,
      rejected: false,
      opSeq: 2,
      newRevision: 5,
    })

    expect(next.revision).toBe(5)
  })

  it('reconcileOptimisticPlacementAck leaves revision unchanged on rejection', () => {
    const tempTile = { ...serverTile, id: 'temp-rev-reject' }
    const state = {
      tiles: [tempTile],
      lastOpSeq: 1,
      revision: 4,
      requiresSnapshot: false,
    }

    const next = reconcileOptimisticPlacementAck(state, tempTile, {
      placed: null,
      rejected: true,
    })

    expect(next.revision).toBe(4)
  })

  it('stores placedBy on tiles after reconcileSequencedTilePlaced', () => {
    const state = createInitialSequencedTilesState()

    const tileA = {
      ...serverTile,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      placedBy: 'client-a',
    }

    const tileB = {
      ...serverTile,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      placedBy: 'client-b',
    }

    const afterA = reconcileSequencedTilePlaced(state, { tile: tileA, opSeq: 1, revision: 1 })
    const afterB = reconcileSequencedTilePlaced(afterA, { tile: tileB, opSeq: 2, revision: 2 })

    expect(afterB.tiles[0].placedBy).toBe('client-a')
    expect(afterB.tiles[1].placedBy).toBe('client-b')
  })

  it('advances revision on sequenced tile_placed broadcasts for passive clients', () => {
    const state = {
      tiles: [],
      lastOpSeq: 0,
      revision: 0,
      requiresSnapshot: false,
    }

    const next = reconcileSequencedTilePlaced(state, {
      tile: { ...serverTile, placedBy: 'client-a' },
      opSeq: 1,
      revision: 1,
    })

    expect(next.lastOpSeq).toBe(1)
    expect(next.revision).toBe(1)
    expect(next.tiles[0].placedBy).toBe('client-a')
  })

  it('advances revision on sequenced tile_removed broadcasts for passive clients', () => {
    const state = {
      tiles: [{ ...serverTile, placedBy: 'client-a' }],
      lastOpSeq: 1,
      revision: 1,
      requiresSnapshot: false,
    }

    const next = reconcileSequencedTileRemoved(state, {
      tileId: serverTile.id,
      opSeq: 2,
      revision: 2,
    })

    expect(next.tiles).toHaveLength(0)
    expect(next.lastOpSeq).toBe(2)
    expect(next.revision).toBe(2)
  })

  it('keeps placedBy through snapshot application for reconnect/resync undo attribution', () => {
    const snapshotTile = { ...serverTile, placedBy: 'client-a' }
    const state = applySequencedSnapshot({
      tiles: [snapshotTile],
      lastOpSeq: 5,
      revision: 5,
    })

    expect(state.tiles[0].placedBy).toBe('client-a')
  })

  it('filtering tiles by placedBy returns only that client\'s tiles', () => {
    const tileA = {
      ...serverTile,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      placedBy: 'client-a',
    }

    const tileB = {
      ...serverTile,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      placedBy: 'client-b',
    }

    const tiles = [tileA, tileB]
    const clientATiles = tiles.filter((t) => t.placedBy === 'client-a')

    expect(clientATiles).toHaveLength(1)
    expect(clientATiles[0].id).toBe(tileA.id)
  })
})
