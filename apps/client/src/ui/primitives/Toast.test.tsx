import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './Toast'

afterEach(() => {
  cleanup()
})

describe('Toast primitives', () => {
  it('renders viewport and open toast with expected class names', () => {
    render(
      <ToastProvider>
        <ToastViewport />
        <Toast open>
          <ToastTitle>Saved</ToastTitle>
          <ToastDescription>Changes were saved.</ToastDescription>
        </Toast>
      </ToastProvider>,
    )

    const title = screen.getByText('Saved')
    expect(title).toBeInTheDocument()
    expect(title).toHaveClass('ui-toast-title')
    const description = screen.getByText('Changes were saved.')
    expect(description).toBeInTheDocument()
    expect(description).toHaveClass('ui-toast-description')
  })
})