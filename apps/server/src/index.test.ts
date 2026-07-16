import { describe, expect, it } from 'vitest'
import {
  applyPlaceTile,
  applyRemoveTile,
  createAuthoritativeSessionState,
  isValidTileId,
  toRejectReason,
} from './index'
import { vec2 } from './domain/math2d'

describe('authoritative handler semantics', () => {
  it('maps placement solver reject reasons to a closed deterministic set', () => {
    expect(toRejectReason('out-of-bounds (correction 0.123)')).toBe('OUT_OF_BOUNDS')
    expect(toRejectReason('overlap (depth 0.456)')).toBe('OVERLAP')
    expect(toRejectReason('gap too large (0.789 > max 0.22)')).toBe('GAP_TOO_LARGE')
    expect(toRejectReason('anything-else')).toBe('PLACEMENT_REJECTED')
  })

  it('rejects out-of-bounds place_tile with deterministic reason', () => {
    const state = createAuthoritativeSessionState('session-1', 1)

    const result = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: {
          position: vec2(9, 0),
          rotation: 0,
        },
      },
      'client-a',
    )

    expect(result.opSeq).toBe(1)
    expect(result.ack.rejected).toBe(true)
    if (result.ack.rejected) {
      expect(result.ack.reason).toBe('OUT_OF_BOUNDS')
    }
    expect(result.event).toBeUndefined()
    expect(state.session.tiles).toHaveLength(0)
  })

  it('emits tile_placed payload only after successful state mutation', () => {
    const state = createAuthoritativeSessionState('session-2', 1)

    const result = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: {
          position: vec2(0, 0),
          rotation: 0,
        },
      },
      'client-a',
    )

    expect(result.opSeq).toBe(1)
    expect(result.ack.rejected).toBe(false)
    if (!result.ack.rejected) {
      expect(result.ack.placed.id).toBeTruthy()
      expect(isValidTileId(result.ack.placed.id)).toBe(true)
    }

    expect(state.session.tiles).toHaveLength(1)
    expect(result.event?.tile.id).toBe(state.session.tiles[0].id)
    expect(result.event?.placedBy).toBe('client-a')
  })

  it('returns removed:false for malformed and unknown tile ids (idempotent)', () => {
    const state = createAuthoritativeSessionState('session-3', 1)

    const malformed = applyRemoveTile(state, { tileId: 'tile-123' }, 'client-a')
    expect(malformed.opSeq).toBe(1)
    expect(malformed.ack.removed).toBe(false)
    expect(malformed.event).toBeUndefined()

    const unknownValid = applyRemoveTile(state, { tileId: '11111111-1111-4111-8111-111111111111' }, 'client-a')
    expect(unknownValid.opSeq).toBe(2)
    expect(unknownValid.ack.removed).toBe(false)
    expect(unknownValid.event).toBeUndefined()
  })

  it('removes known tile id and emits tile_removed payload', () => {
    const state = createAuthoritativeSessionState('session-4', 1)
    const placed = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: {
          position: vec2(0, 0),
          rotation: 0,
        },
      },
      'client-a',
    )

    expect(placed.ack.rejected).toBe(false)
    if (placed.ack.rejected) {
      throw new Error('expected place tile success')
    }

    const remove = applyRemoveTile(state, { tileId: placed.ack.placed.id }, 'client-a')

    expect(remove.ack.removed).toBe(true)
    expect(remove.event?.tileId).toBe(placed.ack.placed.id)
    expect(remove.event?.removedBy).toBe('client-a')
    expect(state.session.tiles).toHaveLength(0)
  })
})
