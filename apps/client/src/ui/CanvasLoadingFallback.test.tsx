import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CanvasLoadingFallback } from './CanvasLoadingFallback'

describe('CanvasLoadingFallback', () => {
  it('renders an accessible loading status with spinner', () => {
    render(<CanvasLoadingFallback />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    const spinner = document.querySelector('.canvas-loading-spinner')
    expect(spinner).not.toBeNull()
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Unearthing relic field...')).toBeInTheDocument()
  })
})
