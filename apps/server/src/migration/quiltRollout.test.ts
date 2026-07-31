import { describe, expect, it } from 'vitest'
import {
  decideLegacyRetirement,
  isQuiltCanarySubject,
  loadLegacyRetirementGates,
  loadQuiltCanaryConfig,
  resolveQuiltRollout,
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

  it('enables dual-read and protocol v2 only for the selected cohort', () => {
    const config = loadQuiltCanaryConfig({
      FEATURE_QUILT_DUAL_READ_CANARY_ENABLED: 'true',
      FEATURE_QUILT_DUAL_READ_CANARY_QUILT_IDS: 'quilt-a',
      FEATURE_QUILT_DUAL_READ_CANARY_PRINCIPAL_IDS: 'principal-a',
    })

    expect(resolveQuiltRollout({ quiltId: 'quilt-a', principalId: 'principal-a' }, config)).toEqual({
      canary: true,
      dualReadEnabled: true,
      protocolV2Enabled: true,
    })
    expect(resolveQuiltRollout({ quiltId: 'quilt-a', principalId: 'principal-b' }, config)).toEqual({
      canary: false,
      dualReadEnabled: false,
      protocolV2Enabled: false,
    })
  })

  it('preserves global execution flags and rolls canary execution back when disabled', () => {
    const globallyEnabled = loadQuiltCanaryConfig({
      FEATURE_QUILT_DUAL_READ_ENABLED: 'true',
      FEATURE_QUILT_PROTOCOL_V2_ENABLED: 'true',
    })
    const rolledBack = loadQuiltCanaryConfig({
      FEATURE_QUILT_DUAL_READ_CANARY_ENABLED: 'false',
      FEATURE_QUILT_DUAL_READ_CANARY_QUILT_IDS: 'quilt-a',
      FEATURE_QUILT_DUAL_READ_CANARY_PRINCIPAL_IDS: 'principal-a',
    })
    const subject = { quiltId: 'quilt-a', principalId: 'principal-a' }

    expect(resolveQuiltRollout(subject, globallyEnabled)).toEqual({
      canary: false,
      dualReadEnabled: true,
      protocolV2Enabled: true,
    })
    expect(resolveQuiltRollout(subject, rolledBack)).toEqual({
      canary: false,
      dualReadEnabled: false,
      protocolV2Enabled: false,
    })
  })

  it('keeps legacy available until every external exit gate passes', () => {
    const incomplete = loadLegacyRetirementGates()
    expect(decideLegacyRetirement(incomplete)).toMatchObject({
      retireLegacy: false,
      unmetGates: expect.arrayContaining(['authenticatedPrincipalIntegrationPassed', 'measuredWindowApproved']),
    })
  })

  it('rejects retirement when report evidence is absent instead of trusting free-standing booleans', () => {
    expect(() => loadLegacyRetirementGates({
      FEATURE_LEGACY_RETIREMENT_REQUESTED: 'true',
      LEGACY_RETIREMENT_MEASURED_WINDOW_APPROVED: 'true',
      LEGACY_RETIREMENT_CLIENT_BUDGET_PASSED: 'true',
    })).toThrow('report path and SHA-256')
  })
})