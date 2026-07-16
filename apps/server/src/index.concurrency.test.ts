import { describe, expect, it } from 'vitest'
import { applyPlaceTile, applyRemoveTile, createAuthoritativeSessionState } from './index'
import { vec2 } from './domain/math2d'

describe('deterministic concurrency convergence', () => {
  it('produces stable first-write-wins outcomes across repeated runs', () => {
    for (let run = 0; run < 25; run += 1) {
      const state = createAuthoritativeSessionState(`repeat-session-${run}`, 1)

      const first = applyPlaceTile(
        state,
        {
          shape: 'square',
          color: '#111',
          material: 'ceramic',
          transform: { position: vec2(0, 0), rotation: 0 },
        },
        'client-a',
      )

      const second = applyPlaceTile(
        state,
        {
          shape: 'square',
          color: '#222',
          material: 'glass',
          transform: { position: vec2(0.01, 0.01), rotation: 0 },
        },
        'client-b',
      )

      expect(first.ack.rejected).toBe(false)
      expect(second.ack.rejected).toBe(true)
      expect(state.session.tiles).toHaveLength(1)
    }
  })

  it('uses first-write-wins for conflicting place_tile operations', () => {
    const state = createAuthoritativeSessionState('session-1', 1)

    const first = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#111',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    const second = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#222',
        material: 'glass',
        transform: { position: vec2(0.01, 0.01), rotation: 0 },
      },
      'client-b',
    )

    expect(first.opSeq).toBe(1)
    expect(second.opSeq).toBe(2)
    expect(first.ack.rejected).toBe(false)
    expect(second.ack.rejected).toBe(true)
    if (second.ack.rejected) {
      expect(second.ack.reason).toBe('OVERLAP')
    }
    expect(state.session.tiles).toHaveLength(1)
  })

  it('commits non-conflicting place_tile operations deterministically', () => {
    const state = createAuthoritativeSessionState('session-2', 1)

    const first = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#111',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    const second = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#222',
        material: 'glass',
        transform: { position: vec2(1.01, 0), rotation: 0 },
      },
      'client-b',
    )

    expect(first.ack.rejected).toBe(false)
    expect(second.ack.rejected).toBe(false)
    expect(state.session.tiles).toHaveLength(2)
  })

  it('applies remove_tile idempotently for the same tile id', () => {
    const state = createAuthoritativeSessionState('session-3', 1)

    const place = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#111',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(place.ack.rejected).toBe(false)
    if (place.ack.rejected) {
      throw new Error('expected place tile success')
    }

    const firstRemove = applyRemoveTile(state, { tileId: place.ack.placed.id }, 'client-a')
    const secondRemove = applyRemoveTile(state, { tileId: place.ack.placed.id }, 'client-b')

    expect(firstRemove.opSeq).toBe(2)
    expect(secondRemove.opSeq).toBe(3)
    expect(firstRemove.ack.removed).toBe(true)
    expect(secondRemove.ack.removed).toBe(false)
    expect(state.session.tiles).toHaveLength(0)
  })

  it('respects operation order for place then remove on same authoritative tile', () => {
    const state = createAuthoritativeSessionState('session-4', 1)

    const place = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#111',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(place.ack.rejected).toBe(false)
    if (place.ack.rejected) {
      throw new Error('expected place tile success')
    }

    const remove = applyRemoveTile(state, { tileId: place.ack.placed.id }, 'client-b')

    expect(remove.ack.removed).toBe(true)
    expect(state.session.tiles).toHaveLength(0)
  })
})
