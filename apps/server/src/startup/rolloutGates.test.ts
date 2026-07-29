import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reportSha256, serializeCanonicalReport, type CanonicalRetirementReportV1, RETIREMENT_THRESHOLDS } from '../operations/canonicalRetirementReportCli.js'
import {
  resolveCanonicalDiscoveryEnabled,
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

const approvedProductionMutation = {
  ...approvedProduction,
  FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
  AUTH_OWNER_E2E_GATE_APPROVED: 'true',
  AUTH_MIGRATION_REHEARSAL_APPROVED: 'true',
  AUTH_MUTATION_ROLLBACK_APPROVED: 'true',
  AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED: 'true',
}

const retirementEnvironment = (recommendation: 'promote' | 'hold' = 'promote') => {
  const directory = mkdtempSync(join(tmpdir(), 'zzyix-retirement-'))
  const path = join(directory, 'report.json')
  const report: CanonicalRetirementReportV1 = {
    schemaVersion: 1,
    reportType: 'canonical-retirement',
    generatedAt: '2026-07-29T00:00:00.000Z',
    observationWindow: { from: '2026-07-28T00:00:00.000Z', to: '2026-07-29T00:00:00.000Z', durationSeconds: 86400 },
    evidence: { inputSha256: 'a'.repeat(64), acceptedEvents: 401, exactDuplicatesIgnored: 0 },
    thresholds: RETIREMENT_THRESHOLDS,
    groups: [],
    immediateRollbackTriggers: [],
    rollbackWindows: [],
    decision: { eligible: true, measuredWindowApproved: true, clientBudgetPassed: true, recommendation, failedChecks: [] },
  }
  const bytes = serializeCanonicalReport(report)
  writeFileSync(path, bytes)
  return {
    ...approvedProduction,
    FEATURE_LEGACY_RETIREMENT_REQUESTED: 'true',
    LEGACY_RETIREMENT_REPORT_PATH: path,
    LEGACY_RETIREMENT_REPORT_SHA256: reportSha256(bytes),
    LEGACY_RETIREMENT_PARITY_PASSED: 'true',
    LEGACY_RETIREMENT_RECOVERY_PASSED: 'true',
    LEGACY_RETIREMENT_MULTI_REPLICA_PASSED: 'true',
    LEGACY_RETIREMENT_AUTHENTICATED_PRINCIPAL_INTEGRATION_PASSED: 'true',
    LEGACY_RETIREMENT_ROLLBACK_POLICY_APPROVED: 'true',
  }
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
      AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED: 'true',
    })).not.toThrow()
  })

  it('rejects mutation when the production authorization benchmark is unapproved', () => {
    expect(() => validateProductionRolloutGates({
      ...approvedProduction,
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
      AUTH_OWNER_E2E_GATE_APPROVED: 'true',
      AUTH_MIGRATION_REHEARSAL_APPROVED: 'true',
      AUTH_MUTATION_ROLLBACK_APPROVED: 'true',
      AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED: 'false',
    })).toThrow('AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED')
  })

  it('does not impose production approvals in test mode', () => {
    expect(() => validateProductionRolloutGates({ NODE_ENV: 'test', E2E_TEST_MODE: 'true' })).not.toThrow()
  })

  it('keeps mutation disabled by default and isolates local enablement to test mode', () => {
    expect(resolveProtocolV2MutationEnabled(approvedProduction)).toBe(false)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'test',
      E2E_TEST_MODE: 'true',
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(true)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'development',
      E2E_TEST_MODE: 'true',
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(false)
  })

  it('enables production mutation only after every production approval passes', () => {
    expect(resolveProtocolV2MutationEnabled(approvedProductionMutation)).toBe(true)
    expect(() => resolveProtocolV2MutationEnabled({
      ...approvedProductionMutation,
      AUTH_OWNER_E2E_GATE_APPROVED: 'false',
    })).toThrow('AUTH_OWNER_E2E_GATE_APPROVED')
  })

  it('keeps canonical discovery independent from mutation enablement', () => {
    expect(resolveCanonicalDiscoveryEnabled({})).toBe(false)
    expect(resolveCanonicalDiscoveryEnabled({ FEATURE_CANONICAL_DISCOVERY_ENABLED: 'true' })).toBe(true)
    expect(resolveCanonicalDiscoveryEnabled({
      FEATURE_CANONICAL_DISCOVERY_ENABLED: 'false',
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(false)
    expect(resolveCanonicalDiscoveryEnabled({ FEATURE_CANONICAL_DISCOVERY_ENABLED: 'TRUE' })).toBe(false)
  })

  it('requires digest-bound promote evidence for production retirement', () => {
    expect(() => validateProductionRolloutGates({
      ...approvedProduction,
      FEATURE_LEGACY_RETIREMENT_REQUESTED: 'true',
    })).toThrow('report path and SHA-256')
    expect(() => validateProductionRolloutGates({
      ...retirementEnvironment(),
      LEGACY_RETIREMENT_REPORT_SHA256: '0'.repeat(64),
    })).toThrow('digest mismatch')
    expect(() => validateProductionRolloutGates(retirementEnvironment('hold'))).toThrow('does not recommend promotion')
    expect(() => validateProductionRolloutGates({
      ...retirementEnvironment(),
      LEGACY_RETIREMENT_MEASURED_WINDOW_APPROVED: 'false',
      LEGACY_RETIREMENT_CLIENT_BUDGET_PASSED: 'false',
    })).not.toThrow()
  })
})