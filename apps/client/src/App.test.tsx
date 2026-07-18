import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { SessionSummary } from './network/session'

const { createSessionMock, listSessionsMock, useSocketConnectionMock } = vi.hoisted(() => ({
  createSessionMock: vi.fn<() => Promise<string>>(),
  listSessionsMock: vi.fn<() => Promise<SessionSummary[]>>(),
  useSocketConnectionMock: vi.fn(() => ({ current: null })),
}))

const sessionState = {
  storedSessionId: 'session-1',
}

const mockSessions: SessionSummary[] = [
  {
    id: 'session-1',
    displayName: 'Canvas session-1',
    connectedUserCount: 2,
    canvasSize: { width: 10, height: 6 },
  },
]

vi.mock('./network/session', () => ({
  ensureClientId: vi.fn(() => 'client-1'),
  createSession: createSessionMock,
  listSessions: listSessionsMock,
  getStoredSessionId: vi.fn(() => sessionState.storedSessionId),
  setStoredSessionId: vi.fn(),
}))

vi.mock('./network/useSocketConnection', () => ({
  useSocketConnection: useSocketConnectionMock,
}))

vi.mock('./ui/ControlsPanel', () => ({
  ControlsPanel: () => <div data-testid="controls-panel">controls</div>,
}))

vi.mock('./render/MosaicScene', () => ({
  MosaicScene: () => <div data-testid="mosaic-scene">scene</div>,
}))

describe('App lobby-first behavior', () => {
  beforeEach(() => {
    sessionState.storedSessionId = 'session-1'
    listSessionsMock.mockReset()
    createSessionMock.mockReset()
    useSocketConnectionMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not implicitly join from stored session id on load', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByText('Choose a Canvas')
    expect(screen.getByText('Last used')).toBeInTheDocument()
    expect(screen.queryByTestId('controls-panel')).not.toBeInTheDocument()
    expect(useSocketConnectionMock).toHaveBeenCalled()
    const firstSocketCall = useSocketConnectionMock.mock.calls[0] as unknown[] | undefined
    expect(firstSocketCall?.[1]).toBeNull()
  })

  it('explicit join transitions to canvas mode', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(screen.getByTestId('controls-panel')).toBeInTheDocument()
      expect(screen.getByTestId('mosaic-scene')).toBeInTheDocument()
    })

    const lastSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[] | undefined
    expect(lastSocketCall?.[1]).toBe('session-1')
  })

  it('create action transitions to canvas mode', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)
    createSessionMock.mockResolvedValue('created-session-1')

    render(<App />)

    await screen.findByRole('button', { name: 'Create Canvas' })
    fireEvent.click(screen.getByRole('button', { name: 'Create Canvas' }))

    await waitFor(() => {
      expect(screen.getByTestId('controls-panel')).toBeInTheDocument()
    })

    expect(createSessionMock).toHaveBeenCalledTimes(1)
    const lastSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[] | undefined
    expect(lastSocketCall?.[1]).toBe('created-session-1')
  })
})
