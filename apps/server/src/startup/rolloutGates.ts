type RolloutEnvironment = Record<string, string | undefined>

const enabled = (environment: RolloutEnvironment, name: string): boolean => environment[name] === 'true'

export const validateProductionRolloutGates = (environment: RolloutEnvironment = process.env): void => {
  if (environment.NODE_ENV !== 'production') return

  if (enabled(environment, 'E2E_TEST_MODE') || enabled(environment, 'AUTH_TEST_ISSUER')) {
    throw new Error('Production startup rejects test authentication settings')
  }

  const requiredApprovals = [
    'AUTH_TELEMETRY_GATE_APPROVED',
    'AUTH_ROLLBACK_GATE_APPROVED',
    'AUTH_RETENTION_POLICY_APPROVED',
    'AUTH_DELETION_COMPLETION_POLICY_APPROVED',
  ]
  const missingApprovals = requiredApprovals.filter((name) => !enabled(environment, name))
  if (missingApprovals.length > 0) {
    throw new Error(`Production rollout approvals are incomplete: ${missingApprovals.join(', ')}`)
  }

}

export const resolveProtocolV2MutationEnabled = (
  environment: RolloutEnvironment = process.env,
): boolean => {
  if (environment.NODE_ENV === 'test') {
    return enabled(environment, 'E2E_TEST_MODE')
  }

  return true
}