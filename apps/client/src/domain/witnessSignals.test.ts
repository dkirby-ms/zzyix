import { describe, expect, it } from 'vitest'
import witnessSignalsSource from './witnessSignals.ts?raw'
import {
  DEFAULT_WITNESS_SIGNAL_GATES,
  areWitnessSignalsEnabled,
  getPrototypeWitnessSignals,
  resetPrototypeWitnessSignals,
} from './witnessSignals'

const enabledGates = {
  prototypeFeatureEnabled: true,
  consentedStudyEnabled: true,
} as const

describe('witnessSignals', () => {
  it('returns no signals by default or when either required gate is absent', () => {
    expect(getPrototypeWitnessSignals()).toEqual([])
    expect(getPrototypeWitnessSignals(DEFAULT_WITNESS_SIGNAL_GATES)).toEqual([])
    expect(getPrototypeWitnessSignals({ prototypeFeatureEnabled: true })).toEqual([])
    expect(getPrototypeWitnessSignals({ consentedStudyEnabled: true })).toEqual([])
    expect(areWitnessSignalsEnabled()).toBe(false)
    expect(areWitnessSignalsEnabled({ prototypeFeatureEnabled: true })).toBe(false)
    expect(areWitnessSignalsEnabled({ consentedStudyEnabled: true })).toBe(false)
  })

  it('returns the Fantome prototype fixture only when both gates are enabled', () => {
    expect(areWitnessSignalsEnabled(enabledGates)).toBe(true)
    expect(getPrototypeWitnessSignals(enabledGates)).toEqual([
      {
        id: 'fantome-witness-01',
        kind: 'glyph',
        anchor: { x: 7.5, y: -3 },
        residentId: 'fantome',
        label: 'Fantome resident witness mark. This prototype signal did not change the mosaic.',
        source: 'prototype-fixture',
      },
    ])
    expect(getPrototypeWitnessSignals({ ...enabledGates, studyCondition: 'no-signal' })).toEqual([])
  })

  it('returns deterministic fixture data and resets to the initial gated condition', () => {
    const initialSignals = getPrototypeWitnessSignals(enabledGates)

    expect(getPrototypeWitnessSignals(enabledGates)).toBe(initialSignals)
    expect(resetPrototypeWitnessSignals(enabledGates)).toBe(initialSignals)
    expect(resetPrototypeWitnessSignals()).toEqual([])
  })

  it('does not import canonical state, collaboration, transport, or history modules', () => {
    expect(witnessSignalsSource).not.toMatch(
      /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]*(?:tile|collaborator|socket|patch|undo|replay|cache)[^'"]*['"]/i,
    )
  })
})