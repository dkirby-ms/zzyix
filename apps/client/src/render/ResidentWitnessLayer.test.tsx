import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ResidentWitnessLayer, WITNESS_MARK_DETAIL } from './ResidentWitnessLayer'
import type { WitnessSignal } from '../domain/witnessSignals'

vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: ReactNode }) => <div data-testid="witness-accessibility">{children}</div>,
}))

afterEach(() => {
  cleanup()
})

const witnessSignal: WitnessSignal = {
  id: 'fantome-witness-test',
  kind: 'glyph',
  anchor: { x: 2, y: -1 },
  residentId: 'fantome',
  label: 'Fantome observed this area.',
  source: 'prototype-fixture',
}

describe('ResidentWitnessLayer', () => {
  it('renders an attributable witness mark and reports its detail without mutating signals', () => {
    const signals = Object.freeze([Object.freeze({ ...witnessSignal, anchor: Object.freeze({ ...witnessSignal.anchor }) })])
    const onDetail = vi.fn()

    const { container, getByRole, getByText } = render(
      <ResidentWitnessLayer signals={signals} onDetail={onDetail} />,
    )

    expect(container.querySelector('[data-witness-signal="fantome-witness-test"]')).toBeInTheDocument()
    expect(getByRole('button', { name: /Fantome resident witness mark/ })).toBeInTheDocument()
    expect(getByText(WITNESS_MARK_DETAIL)).toBeInTheDocument()

    fireEvent.click(getByRole('button', { name: /Fantome resident witness mark/ }))

    expect(onDetail).toHaveBeenCalledWith(signals[0])
    expect(signals).toEqual([witnessSignal])
  })
})