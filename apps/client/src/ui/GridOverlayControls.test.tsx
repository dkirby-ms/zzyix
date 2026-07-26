import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { GRID_PATTERNS } from '../domain/gridPatterns'
import { GridOverlayControls } from './GridOverlayControls'

afterEach(() => {
  cleanup()
})

const renderControls = (overrides: Partial<Parameters<typeof GridOverlayControls>[0]> = {}) => {
  const props: Parameters<typeof GridOverlayControls>[0] = {
    enabled: true,
    patterns: GRID_PATTERNS,
    selectedPatternId: 'square-lattice',
    activeShape: 'square',
    onEnabledChange: vi.fn(),
    onPatternChange: vi.fn(),
    ...overrides,
  }

  return { ...render(<GridOverlayControls {...props} />), props }
}

describe('GridOverlayControls', () => {
  it('exposes stable toggle semantics and the selected pattern', () => {
    const { props, rerender } = renderControls()
    const toggle = screen.getByRole('button', { name: 'Grid overlay' })

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(props.onEnabledChange).toHaveBeenCalledWith(false)

    rerender(<GridOverlayControls {...props} enabled={false} />)
    expect(screen.getByRole('button', { name: 'Grid overlay' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Square lattice')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Pattern' })).not.toBeInTheDocument()
  })

  it('renders only caller-provided constructible patterns and compatible shape text', () => {
    renderControls({
      patterns: GRID_PATTERNS.filter((pattern) => pattern.id !== 'triangle-tessellation'),
      selectedPatternId: 'running-bond',
      activeShape: 'rectangle',
    })

    const patternGroup = screen.getByRole('radiogroup', { name: 'Pattern' })
    expect(within(patternGroup).getByRole('radio', { name: 'Square lattice' })).toBeInTheDocument()
    expect(within(patternGroup).getByRole('radio', { name: 'Running bond' })).toBeInTheDocument()
    expect(within(patternGroup).queryByRole('radio', { name: 'Triangle tessellation' })).not.toBeInTheDocument()
    expect(screen.getByText('Compatible: Rectangle')).toBeInTheDocument()
  })

  it('supports arrow, Space, and Enter pattern selection', () => {
    const onPatternChange = vi.fn()
    renderControls({ onPatternChange })
    const square = screen.getByRole('radio', { name: 'Square lattice' })
    const runningBond = screen.getByRole('radio', { name: 'Running bond' })

    fireEvent.keyDown(square, { key: 'ArrowRight' })
    fireEvent.keyDown(runningBond, { key: ' ' })
    fireEvent.keyDown(runningBond, { key: 'Enter' })

    expect(onPatternChange).toHaveBeenNthCalledWith(1, 'running-bond')
    expect(onPatternChange).toHaveBeenNthCalledWith(2, 'running-bond')
    expect(onPatternChange).toHaveBeenNthCalledWith(3, 'running-bond')
  })

  it('announces actionable incompatibility and unavailable catalogs', () => {
    const { rerender } = renderControls({
      selectedPatternId: 'running-bond',
      activeShape: 'triangle',
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Triangle is not compatible with Running bond. Choose Rectangle.',
    )

    rerender(
      <GridOverlayControls
        enabled={false}
        patterns={[]}
        activeShape="square"
        onEnabledChange={vi.fn()}
        onPatternChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Grid overlay' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'No grid patterns are available for the current tile library.',
    )
  })
})
