import { describe, expect, it } from 'vitest'
import {
  applyPlaceTile,
  applyRemoveTile,
  buildListSessionsResponse,
  cleanupSessions,
  createAuthoritativeSessionState,
  getSessionState,
  handlePlaceTileRequest,
  handleRemoveTileRequest,
  isCreateSessionRequest,
  isValidTileId,
  invokeAckSafely,
  isPlaceTilePayload,
  isRemoveTilePayload,
  resolveCanvasConfigFromPreset,
  isSelectionUpdatePayload,
  isOriginAllowed,
  resolveCorsOrigin,
  shouldCleanupSession,
  toRejectReason,
} from './index.js'
import { vec2 } from './domain/math2d.js'

describe('authoritative handler semantics', () => {
  it('builds lobby summary metadata with deterministic V1 fallbacks', () => {
    const payload = buildListSessionsResponse([
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', participantCount: 2 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', participantCount: 0 },
    ])

    expect(payload).toEqual({
      sessions: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          displayName: 'Canvas aaaaaaaa',
          participantCount: 2,
          canvasSize: { width: 10.4, height: 6.8 },
          canvasConfig: {
            canvasSize: { width: 10.4, height: 6.8 },
            boundsPolicy: {
              mode: 'bounded',
              bounds: { minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4 },
            },
          },
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          displayName: 'Canvas bbbbbbbb',
          participantCount: 0,
          canvasSize: { width: 10.4, height: 6.8 },
          canvasConfig: {
            canvasSize: { width: 10.4, height: 6.8 },
            boundsPolicy: {
              mode: 'bounded',
              bounds: { minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4 },
            },
          },
        },
      ],
    })
  })

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
        tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

  it('accepts far placement when session bounds policy is unbounded', () => {
    const state = createAuthoritativeSessionState('session-unbounded', 1, {
      canvasSize: { width: 10.4, height: 6.8 },
      boundsPolicy: { mode: 'unbounded' },
    })

    const result = applyPlaceTile(
      state,
      {
        tileId: 'abababab-abab-4bab-8bab-abababababab',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: {
          position: vec2(99, 0),
          rotation: 0,
        },
      },
      'client-a',
    )

    expect(result.ack.rejected).toBe(false)
    expect(state.session.tiles).toHaveLength(1)
  })

  it('emits tile_placed payload only after successful state mutation', () => {
    const state = createAuthoritativeSessionState('session-2', 1)

    const result = applyPlaceTile(
      state,
      {
        tileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
      expect(result.ack.placed.id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      expect(isValidTileId(result.ack.placed.id)).toBe(true)
      expect(result.ack.opSeq).toBe(1)
    }

    expect(state.session.tiles).toHaveLength(1)
    expect(result.event?.tile.id).toBe(state.session.tiles[0].id)
    expect(result.event?.placedBy).toBe('client-a')
    expect(result.event?.opSeq).toBe(1)
    expect(result.event?.revision).toBe(1)
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

  it('keeps remove replay ordering deterministic across repeated duplicate requests', () => {
    const state = createAuthoritativeSessionState('session-3-replay', 1)

    const placed = applyPlaceTile(
      state,
      {
        tileId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
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

    const firstRemove = applyRemoveTile(state, { tileId: placed.ack.placed.id }, 'client-a')
    const replayRemoveA = applyRemoveTile(state, { tileId: placed.ack.placed.id }, 'client-a')
    const replayRemoveB = applyRemoveTile(state, { tileId: placed.ack.placed.id }, 'client-a')

    expect(firstRemove.ack).toEqual({ removed: true, opSeq: 2, newRevision: 2 })
    expect(replayRemoveA.ack).toEqual({ removed: false })
    expect(replayRemoveB.ack).toEqual({ removed: false })
    expect(firstRemove.opSeq).toBe(2)
    expect(replayRemoveA.opSeq).toBe(3)
    expect(replayRemoveB.opSeq).toBe(4)
    expect(state.lastOpSeq).toBe(4)
    expect(state.session.tiles).toHaveLength(0)
  })

  it('removes known tile id and emits tile_removed payload', () => {
    const state = createAuthoritativeSessionState('session-4', 1)
    const placed = applyPlaceTile(
      state,
      {
        tileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
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
    expect(remove.event?.revision).toBe(2)
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
        tileId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
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

  it('validates create session request presets', () => {
    expect(isCreateSessionRequest({})).toBe(true)
    expect(isCreateSessionRequest({ canvasPreset: 'classic' })).toBe(true)
    expect(isCreateSessionRequest({ canvasPreset: 'expanded' })).toBe(true)
    expect(isCreateSessionRequest({ canvasPreset: 'vast' })).toBe(true)
    expect(isCreateSessionRequest({ canvasPreset: 'invalid' })).toBe(false)
    expect(isCreateSessionRequest(null)).toBe(false)
  })

  it('resolves larger bounded canvas config for expanded and vast presets', () => {
    const classic = resolveCanvasConfigFromPreset('classic')
    const expanded = resolveCanvasConfigFromPreset('expanded')
    const vast = resolveCanvasConfigFromPreset('vast')

    expect(classic.canvasSize.width).toBe(10.4)
    expect(classic.canvasSize.height).toBe(6.8)

    expect(expanded.canvasSize.width).toBe(20.8)
    expect(expanded.canvasSize.height).toBe(13.6)
    if (expanded.boundsPolicy.mode !== 'bounded') {
      throw new Error('expected bounded policy for expanded preset')
    }
    expect(expanded.boundsPolicy.bounds.maxX).toBe(10.4)
    expect(expanded.boundsPolicy.bounds.maxY).toBe(6.8)

    expect(vast.canvasSize.width).toBe(31.2)
    expect(vast.canvasSize.height).toBe(20.4)
    if (vast.boundsPolicy.mode !== 'bounded') {
      throw new Error('expected bounded policy for vast preset')
    }
    expect(vast.boundsPolicy.bounds.minX).toBe(-15.6)
    expect(vast.boundsPolicy.bounds.minY).toBe(-10.2)
  })

  it('accepts only non-negative integer expectedRevision values in payload guards', () => {
    expect(
      isPlaceTilePayload({
        tileId: '11111111-1111-4111-8111-111111111111',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        expectedRevision: 2,
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
      }),
    ).toBe(true)
    expect(
      isPlaceTilePayload({
        tileId: '22222222-2222-4222-8222-222222222222',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        expectedRevision: -1,
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
      }),
    ).toBe(false)
    expect(
      isPlaceTilePayload({
        tileId: '33333333-3333-4333-8333-333333333333',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        expectedRevision: 1.5,
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
      }),
    ).toBe(false)

    expect(isRemoveTilePayload({ tileId: 'abc', expectedRevision: 0 })).toBe(true)
    expect(isRemoveTilePayload({ tileId: 'abc', expectedRevision: -1 })).toBe(false)
    expect(isRemoveTilePayload({ tileId: 'abc', expectedRevision: 1.2 })).toBe(false)
  })

  it('validates selection_update payload guards for canvas and client identity fields', () => {
    expect(
      isSelectionUpdatePayload({
        canvasId: 'session-1',
        clientId: 'client-a',
        tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        updatedAt: Date.now(),
      }),
    ).toBe(true)

    expect(
      isSelectionUpdatePayload({
        canvasId: 'session-1',
        clientId: 'client-a',
        updatedAt: Date.now(),
      }),
    ).toBe(true)

    expect(
      isSelectionUpdatePayload({
        canvasId: '',
        clientId: 'client-a',
        updatedAt: Date.now(),
      }),
    ).toBe(false)

    expect(
      isSelectionUpdatePayload({
        canvasId: 'session-1',
        clientId: '',
        updatedAt: Date.now(),
      }),
    ).toBe(false)

    expect(
      isSelectionUpdatePayload({
        canvasId: 'session-1',
        clientId: 'client-a',
        tileId: 'not-a-uuid',
        updatedAt: Date.now(),
      }),
    ).toBe(false)
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

  it('parses multiple configured CORS origins for request-origin matching', () => {
    const allowed = resolveCorsOrigin('https://a.example.com, https://b.example.com')

    expect(Array.isArray(allowed)).toBe(true)
    expect(allowed).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('matches request origin only when present in allow-list', () => {
    const allowList = resolveCorsOrigin('https://a.example.com, https://b.example.com')

    expect(isOriginAllowed('https://a.example.com', allowList)).toBe(true)
    expect(isOriginAllowed('https://b.example.com', allowList)).toBe(true)
    expect(isOriginAllowed('https://c.example.com', allowList)).toBe(false)
  })

  it('does not match partial origin strings', () => {
    expect(isOriginAllowed('https://good.example.com.evil.net', 'https://good.example.com')).toBe(false)
    expect(isOriginAllowed('https://good.example.com', 'https://good.example.com')).toBe(true)
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

  it('keeps deterministic local sequencing when duplicate place is re-submitted in memory', () => {
    const state = createAuthoritativeSessionState('session-duplicate-place', 1)
    const payload = {
      tileId: '11111111-1111-4111-8111-111111111111',
      shape: 'square' as const,
      color: '#fff',
      material: 'ceramic' as const,
      transform: {
        position: vec2(0, 0),
        rotation: 0,
      },
    }

    const first = applyPlaceTile(state, payload, 'client-a')
    const replay = applyPlaceTile(state, payload, 'client-a')

    expect(first.ack.rejected).toBe(false)
    expect(replay.ack.rejected).toBe(true)
    if (!first.ack.rejected) {
      expect(first.ack.opSeq).toBe(1)
      expect(first.ack.placed.id).toBe(payload.tileId)
    }
    if (replay.ack.rejected) {
      expect(replay.ack.reason).toBe('OVERLAP')
    }
    expect(state.session.tiles).toHaveLength(1)
    expect(state.lastOpSeq).toBe(2)
  })
})
