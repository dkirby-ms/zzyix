import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from './primitives/Tooltip'
import { StatusIndicator } from './StatusIndicator'

afterEach(() => {
  cleanup()
})

describe('StatusIndicator', () => {
  it('shows an error tooltip when the keyboard focuses the trigger', async () => {
    render(
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <StatusIndicator
          connectionState={{
            status: 'error',
            lastError: 'Socket handshake failed',
          }}
        />
      </TooltipProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'View connection error details' })
    fireEvent.focus(trigger)

    expect(await screen.findByText('Socket handshake failed')).toBeInTheDocument()
  })

  it('does not render a tooltip trigger for non-error states', () => {
    render(
      <TooltipProvider>
        <StatusIndicator connectionState={{ status: 'connected' }} />
      </TooltipProvider>,
    )

    expect(screen.queryByRole('button', { name: 'View connection error details' })).not.toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })
})
