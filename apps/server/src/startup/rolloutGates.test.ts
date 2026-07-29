import { describe, expect, it } from 'vitest'
import { validateProductionRolloutGates } from './rolloutGates.js'

const approvedProduction = {
  NODE_ENV: 'production',
  AUTH_TELEMETRY_GATE_APPROVED: 'true',
  AUTH_ROLLBACK_GATE_APPROVED: 'true',
  AUTH_RETENTION_POLICY_APPROVED: 'true',
  AUTH_DELETION_COMPLETION_POLICY_APPROVED: 'true',
}

describe('production rollout gates', () => {
  it('rejects missing operational approvals', () => {
    expect(() => validateProductionRolloutGates({ NODE_ENV: 'production' })).toThrow(
      'Production rollout approvals are incomplete',
    )
  })

  it('rejects test authentication settings in production', () => {
    expect(() => validateProductionRolloutGates({
      ...approvedProduction,
      AUTH_TEST_ISSUER: 'true',
    })).toThrow('Production startup rejects test authentication settings')
  })

  it('keeps mutation disabled unless every mutation gate is approved', () => {
    expect(() => validateProductionRolloutGates({
      ...approvedProduction,
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toThrow('Production mutation approvals are incomplete')

    expect(() => validateProductionRolloutGates({
      ...approvedProduction,
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
      AUTH_OWNER_E2E_GATE_APPROVED: 'true',
      AUTH_MIGRATION_REHEARSAL_APPROVED: 'true',
      AUTH_MUTATION_ROLLBACK_APPROVED: 'true',
    })).not.toThrow()
  })

  it('does not impose production approvals in test mode', () => {
    expect(() => validateProductionRolloutGates({ NODE_ENV: 'test', E2E_TEST_MODE: 'true' })).not.toThrow()
  })
})