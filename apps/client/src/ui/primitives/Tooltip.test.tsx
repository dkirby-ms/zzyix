import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './Tooltip'

describe('Tooltip primitives', () => {
  it('renders trigger and tooltip content with expected class names', () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <button type="button">Open hint</button>
          </TooltipTrigger>
          <TooltipContent>Helpful hint</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )

    expect(screen.getByRole('button', { name: 'Open hint' })).toBeInTheDocument()
    const content = screen.getByText('Helpful hint')
    expect(content).toBeInTheDocument()
    expect(content).toHaveClass('ui-tooltip-content')
  })
})
