// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ChatMessage } from '../../../server/src/contracts'
import { ChatPanel } from './ChatPanel'

const message = (body: string): ChatMessage => ({
  id: 'message-1' as ChatMessage['id'],
  conversationId: 'conversation' as ChatMessage['conversationId'],
  principalId: 'principal',
  clientMessageId: 'client-1',
  authorProfile: { displayName: 'Ada' },
  body,
  sequence: 1 as ChatMessage['sequence'],
  createdAt: 0,
})

const renderPanel = (overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}) => render(
  <ChatPanel
    messages={[]}
    pending={[]}
    connectionStatus="connected"
    onSend={vi.fn()}
    onLoadMoreHistory={vi.fn()}
    onClose={vi.fn()}
    {...overrides}
  />,
)

describe('ChatPanel', () => {
  afterEach(() => cleanup())

  it.each([
    ['loading', { loading: true }, 'Loading conversation...'],
    ['empty', {}, 'No messages yet. Start the conversation.'],
    ['disconnected', { connectionStatus: 'disconnected' as const }, 'Disconnected'],
    ['error', { error: 'Unable to load chat.' }, 'Unable to load chat.'],
  ])('renders the %s state', (_name, props, text) => {
    renderPanel(props)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('rejects empty and oversized messages', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    renderPanel({ onSend })
    const composer = screen.getByLabelText('Message')

    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('Enter a message before sending.')).toBeInTheDocument()
    fireEvent.change(composer, { target: { value: 'x'.repeat(2001) } })
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('Messages must be 2000 characters or fewer.')).toBeInTheDocument()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends on Enter, preserves Shift+Enter, and renders message bodies as text', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    renderPanel({ messages: [message('<strong>plain text</strong>')], onSend })
    const composer = screen.getByLabelText('Message')

    expect(screen.getByText('<strong>plain text</strong>')).toBeInTheDocument()
    await user.type(composer, 'hello{Enter}')
    expect(onSend).toHaveBeenCalledWith('hello')
    await user.type(composer, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(composer).toHaveValue('line one\nline two')
  })

  it('keeps the draft while disconnected', async () => {
    const user = userEvent.setup()
    renderPanel({ connectionStatus: 'disconnected' })
    const composer = screen.getByLabelText('Message')

    await user.type(composer, 'keep this draft')
    expect(composer).toHaveValue('keep this draft')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})