import { describe, expect, it } from 'vitest'
import {
  resolveProtocolV2MutationEnabled,
  validateProductionRolloutGates,
} from './rolloutGates.js'

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

  it('does not impose production approvals in test mode', () => {
    expect(() => validateProductionRolloutGates({ NODE_ENV: 'test', E2E_TEST_MODE: 'true' })).not.toThrow()
  })

  it('enables canonical mutation outside tests', () => {
    expect(resolveProtocolV2MutationEnabled(approvedProduction)).toBe(true)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'development',
    })).toBe(true)
    expect(resolveProtocolV2MutationEnabled({})).toBe(true)
  })

  it('keeps mutation opt-in for tests', () => {
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'test',
    })).toBe(false)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'test',
      E2E_TEST_MODE: 'true',
    })).toBe(true)
  })
})