import { describe, expect, it } from 'vitest'
import {
  decideLegacyRetirement,
  isQuiltCanarySubject,
  loadLegacyRetirementGates,
  loadQuiltCanaryConfig,
} from './quiltRollout.js'

describe('quilt migration rollout controls', () => {
  it('requires a quilt and authenticated principal cohort', () => {
    const config = loadQuiltCanaryConfig({
      FEATURE_QUILT_DUAL_READ_CANARY_ENABLED: 'true',
      FEATURE_QUILT_DUAL_READ_CANARY_QUILT_IDS: 'quilt-a',
      FEATURE_QUILT_DUAL_READ_CANARY_PRINCIPAL_IDS: 'principal-a',
    })

    expect(isQuiltCanarySubject({ quiltId: 'quilt-a', principalId: 'principal-a' }, config)).toBe(true)
    expect(isQuiltCanarySubject({ quiltId: 'quilt-a' }, config)).toBe(false)
    expect(isQuiltCanarySubject({ quiltId: 'quilt-b', principalId: 'principal-a' }, config)).toBe(false)
  })

  it('uses a stable percentage cohort for the quilt and principal pair', () => {
    const enabled = loadQuiltCanaryConfig({
      FEATURE_QUILT_DUAL_READ_CANARY_ENABLED: 'true',
      FEATURE_QUILT_DUAL_READ_CANARY_PERCENT: '100',
    })
    const disabled = { ...enabled, cohortPercent: 0 }
    const subject = { quiltId: 'quilt-a', principalId: 'principal-a' }

    expect(isQuiltCanarySubject(subject, enabled)).toBe(true)
    expect(isQuiltCanarySubject(subject, disabled)).toBe(false)
  })

  it('keeps legacy available until every external exit gate passes', () => {
    const incomplete = loadLegacyRetirementGates({ FEATURE_LEGACY_RETIREMENT_REQUESTED: 'true' })
    expect(decideLegacyRetirement(incomplete)).toMatchObject({
      retireLegacy: false,
      unmetGates: expect.arrayContaining(['authenticatedPrincipalIntegrationPassed', 'measuredWindowApproved']),
    })

    const complete = Object.fromEntries(
      Object.keys(incomplete).map((key) => [key, true]),
    ) as typeof incomplete
    expect(decideLegacyRetirement(complete)).toEqual({ retireLegacy: true, unmetGates: [] })
  })
})