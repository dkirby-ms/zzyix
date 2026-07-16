import { describe, expect, it } from 'vitest'
import {
  applyPlaceTile,
  applyRemoveTile,
  cleanupSessions,
  createAuthoritativeSessionState,
  getSessionState,
  handlePlaceTileRequest,
  handleRemoveTileRequest,
  isValidTileId,
  invokeAckSafely,
  isPlaceTilePayload,
  isRemoveTilePayload,
  resolveCorsOrigin,
  shouldCleanupSession,
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
      expect(result.ack.opSeq).toBe(1)
    }

    expect(state.session.tiles).toHaveLength(1)
    expect(result.event?.tile.id).toBe(state.session.tiles[0].id)
    expect(result.event?.placedBy).toBe('client-a')
    expect(result.event?.opSeq).toBe(1)
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
    expect(remove.ack.opSeq).toBe(2)
    expect(remove.event?.tileId).toBe(placed.ack.placed.id)
    expect(remove.event?.removedBy).toBe('client-a')
    expect(remove.event?.opSeq).toBe(2)
    expect(state.session.tiles).toHaveLength(0)
  })

  it('rejects malformed place payloads before domain logic', () => {
    const state = createAuthoritativeSessionState('session-5', 1)

    expect(
      handlePlaceTileRequest(
        state,
        {
          shape: 'square',
          color: '#fff',
          material: 'ceramic',
          transform: { position: { x: 0, y: 'oops' }, rotation: 0 },
        },
        'client-a',
      ).ack,
    ).toEqual({
      placed: null,
      rejected: true,
      reason: 'PLACEMENT_REJECTED',
    })

    expect(state.session.tiles).toHaveLength(0)
  })

  it('rejects malformed remove payloads before mutation logic', () => {
    const state = createAuthoritativeSessionState('session-6', 1)
    const malformedRemove = handleRemoveTileRequest(state, { tileId: 123 }, 'client-a')

    expect(malformedRemove.ack).toEqual({ removed: false })
    expect(malformedRemove.event).toBeUndefined()
  })

  it('invokes ack only when callback is a function', () => {
    const captured: Array<{ removed: boolean }> = []
    invokeAckSafely<{ removed: boolean }>(null, { removed: false })
    invokeAckSafely<{ removed: boolean }>('not-a-function', { removed: false })
    invokeAckSafely<{ removed: boolean }>((value) => captured.push(value), { removed: true })

    expect(captured).toEqual([{ removed: true }])
  })

  it('validates place/remove payload guards with unknown inputs', () => {
    expect(isPlaceTilePayload(null)).toBe(false)
    expect(isPlaceTilePayload({})).toBe(false)
    expect(
      isPlaceTilePayload({
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
      }),
    ).toBe(true)

    expect(isRemoveTilePayload(null)).toBe(false)
    expect(isRemoveTilePayload({ tileId: 123 })).toBe(false)
    expect(isRemoveTilePayload({ tileId: 'abc' })).toBe(true)
  })

  it('uses safe CORS defaults when wildcard is missing or configured', () => {
    expect(resolveCorsOrigin(undefined)).toBe('http://localhost:5173')
    expect(resolveCorsOrigin('*')).toBe('http://localhost:5173')
    expect(resolveCorsOrigin('https://a.example.com')).toBe('https://a.example.com')
    expect(resolveCorsOrigin('https://a.example.com, https://b.example.com')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ])
    expect(resolveCorsOrigin('*, https://b.example.com')).toBe('https://b.example.com')
  })

  it('cleans up empty sessions immediately and stale sessions deterministically', () => {
    const now = 10_000
    const staleAfterMs = 5_000
    const empty = getSessionState('cleanup-empty')
    empty.clients.set('fixture-keeper-empty', { clientId: 'fixture-keeper-empty', joinedAt: 1 })

    const stale = getSessionState('cleanup-stale')
    stale.clients.set('fixture-keeper-stale', { clientId: 'fixture-keeper-stale', joinedAt: 1 })

    const active = getSessionState('cleanup-active')

    stale.session.tiles.push({
      id: '11111111-1111-4111-8111-111111111111',
      shape: 'square',
      color: '#000',
      material: 'ceramic',
      transform: {
        position: vec2(0, 0),
        rotation: 0,
      },
      createdAt: 1,
    })
    stale.session.updatedAt = now - (staleAfterMs + 1)

    active.session.tiles.push({
      id: '22222222-2222-4222-8222-222222222222',
      shape: 'square',
      color: '#000',
      material: 'glass',
      transform: {
        position: vec2(1.1, 0),
        rotation: 0,
      },
      createdAt: 1,
    })
    active.session.updatedAt = now

    // Release fixture clients just before cleanup checks.
    empty.clients.delete('fixture-keeper-empty')
    stale.clients.delete('fixture-keeper-stale')

    expect(shouldCleanupSession(empty, now, staleAfterMs)).toBe(true)
    expect(shouldCleanupSession(stale, now, staleAfterMs)).toBe(true)
    expect(shouldCleanupSession(active, now, staleAfterMs)).toBe(false)

    const removed = cleanupSessions(now, staleAfterMs)
    expect(removed).toEqual(expect.arrayContaining(['cleanup-empty', 'cleanup-stale']))
    expect(removed).not.toContain('cleanup-active')

    const removedAgain = cleanupSessions(now, staleAfterMs)
    expect(removedAgain).toEqual([])
  })
})
