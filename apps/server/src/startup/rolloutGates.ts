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

  if (enabled(environment, 'FEATURE_PROTOCOL_V2_MUTATION_ENABLED')) {
    const mutationApprovals = [
      'AUTH_OWNER_E2E_GATE_APPROVED',
      'AUTH_MIGRATION_REHEARSAL_APPROVED',
      'AUTH_MUTATION_ROLLBACK_APPROVED',
      'AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED',
    ]
    const missingMutationApprovals = mutationApprovals.filter((name) => !enabled(environment, name))
    if (missingMutationApprovals.length > 0) {
      throw new Error(`Production mutation approvals are incomplete: ${missingMutationApprovals.join(', ')}`)
    }
  }
}

export const resolveProtocolV2MutationEnabled = (
  environment: RolloutEnvironment = process.env,
): boolean => {
  if (!enabled(environment, 'FEATURE_PROTOCOL_V2_MUTATION_ENABLED')) return false

  if (environment.NODE_ENV === 'production') {
    validateProductionRolloutGates(environment)
    return true
  }

  return environment.NODE_ENV === 'test' && enabled(environment, 'E2E_TEST_MODE')
}