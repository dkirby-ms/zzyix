import { describe, expect, it } from 'vitest'
import { applyPlaceTile, getSessionState } from './index'
import { vec2 } from './domain/math2d'

let sessionCounter = 0

const nextSessionId = (): string => {
  sessionCounter += 1
  return `integration-session-${sessionCounter}`
}

describe('authoritative snapshot reconciliation', () => {
  it('builds snapshot payload from canonical server tiles for first connect', () => {
    const sessionId = nextSessionId()
    const state = getSessionState(sessionId)

    const place = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'authoritative-client',
    )

    expect(place.ack.rejected).toBe(false)

    const joinedAt = 10
    state.clients.set('client-1', { clientId: 'client-1', joinedAt })
    const snapshot = {
      session: state.session,
      clients: [...state.clients.values()],
    }

    expect(snapshot.session.id).toBe(sessionId)
    expect(snapshot.session.tiles).toHaveLength(1)
    expect(snapshot.clients).toEqual([{ clientId: 'client-1', joinedAt }])
  })

  it('reconnect snapshot reflects latest canonical session state', () => {
    const sessionId = nextSessionId()
    const state = getSessionState(sessionId)

    const firstPlace = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#123',
        material: 'glass',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(firstPlace.ack.rejected).toBe(false)

  state.clients.set('client-a', { clientId: 'client-a', joinedAt: 5 })

    // Simulate reconnect: same session id resolves to the same authoritative state.
  const reconnectState = getSessionState(sessionId)
    reconnectState.clients.set('client-a', { clientId: 'client-a', joinedAt: 15 })

    const reconnectSnapshot = {
      session: reconnectState.session,
      clients: [...reconnectState.clients.values()],
    }

    expect(reconnectSnapshot.session.id).toBe(sessionId)
    expect(reconnectSnapshot.session.tiles).toHaveLength(1)
    expect(reconnectSnapshot.clients).toEqual([{ clientId: 'client-a', joinedAt: 15 }])
  })
})