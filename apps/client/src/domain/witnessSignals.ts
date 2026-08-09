export type WitnessSignal = {
  id: string
  kind: 'glyph'
  anchor: Readonly<{
    x: number
    y: number
  }>
  residentId: 'fantome'
  label: string
  source: 'prototype-fixture'
}

export type WitnessSignalGates = {
  prototypeFeatureEnabled: boolean
  consentedStudyEnabled: boolean
  studyCondition?: 'no-signal' | 'one-signal'
}

export const DEFAULT_WITNESS_SIGNAL_GATES: Readonly<WitnessSignalGates> = Object.freeze({
  prototypeFeatureEnabled: false,
  consentedStudyEnabled: false,
  studyCondition: 'one-signal',
})

const EMPTY_WITNESS_SIGNALS: readonly WitnessSignal[] = Object.freeze([])

const PROTOTYPE_WITNESS_SIGNALS: readonly WitnessSignal[] = Object.freeze([
  Object.freeze({
    id: 'fantome-witness-01',
    kind: 'glyph' as const,
    anchor: Object.freeze({ x: 7.5, y: -3 }),
    residentId: 'fantome' as const,
    label: 'Fantome resident witness mark. This prototype signal did not change the mosaic.',
    source: 'prototype-fixture' as const,
  }),
])

export const areWitnessSignalsEnabled = (
  gates: Partial<WitnessSignalGates> = DEFAULT_WITNESS_SIGNAL_GATES,
): boolean => gates.prototypeFeatureEnabled === true && gates.consentedStudyEnabled === true

export const getPrototypeWitnessSignals = (
  gates: Partial<WitnessSignalGates> = DEFAULT_WITNESS_SIGNAL_GATES,
): readonly WitnessSignal[] =>
  areWitnessSignalsEnabled(gates) && gates.studyCondition !== 'no-signal'
    ? PROTOTYPE_WITNESS_SIGNALS
    : EMPTY_WITNESS_SIGNALS

export const resetPrototypeWitnessSignals = (
  gates: Partial<WitnessSignalGates> = DEFAULT_WITNESS_SIGNAL_GATES,
): readonly WitnessSignal[] => getPrototypeWitnessSignals(gates)