import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToggleGroup, ToggleGroupItem } from './ToggleGroup'

describe('ToggleGroup primitives', () => {
  it('renders group and items with expected class names', () => {
    render(
      <ToggleGroup type="single" defaultValue="one" aria-label="View mode">
        <ToggleGroupItem value="one" aria-label="One">
          One
        </ToggleGroupItem>
        <ToggleGroupItem value="two" aria-label="Two">
          Two
        </ToggleGroupItem>
      </ToggleGroup>,
    )

    const one = screen.getByRole('radio', { name: 'One' })
    expect(one).toBeInTheDocument()
    expect(one).toHaveClass('ui-toggle-group-item')
    expect(screen.getByRole('radio', { name: 'Two' })).toBeInTheDocument()
  })
})