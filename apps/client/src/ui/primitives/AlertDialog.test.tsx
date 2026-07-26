import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './AlertDialog'

describe('AlertDialog primitives', () => {
  it('renders trigger and open content with expected class names', () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogTrigger asChild>
          <button type="button">Open alert dialog</button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Alert title</AlertDialogTitle>
          <AlertDialogDescription>Alert description</AlertDialogDescription>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Confirm</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    )

    const title = screen.getByText('Alert title')
    expect(title).toBeInTheDocument()
    expect(title).toHaveClass('ui-alert-dialog-title')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })
})