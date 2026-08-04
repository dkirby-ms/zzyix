import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

const CrashingChild = () => {
  throw new Error('expected render crash')
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a helpful diagnostic page when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onAction = vi.fn()

    render(
      <AppErrorBoundary actionLabel="Try again" onAction={onAction}>
        <CrashingChild />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zzyix ran into a problem' })).toBeInTheDocument()
    expect(screen.getByText('expected render crash')).toBeInTheDocument()
    expect(screen.getByText('Error ID')).toBeInTheDocument()
    expect(screen.getByText('Page')).toBeInTheDocument()
    expect(screen.getByText(window.location.href)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onAction).toHaveBeenCalledOnce()
  })
})