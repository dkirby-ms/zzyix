import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './Dialog'

describe('Dialog primitives', () => {
  it('renders trigger and open content with expected class names', () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <button type="button">Open dialog</button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    const title = screen.getByText('Dialog title')
    expect(title).toBeInTheDocument()
    expect(title).toHaveClass('ui-dialog-title')
    const description = screen.getByText('Dialog description')
    expect(description).toBeInTheDocument()
    expect(description).toHaveClass('ui-dialog-description')
  })
})