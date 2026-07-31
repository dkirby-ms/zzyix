import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCanonicalRetirementReport, reportSha256, serializeCanonicalReport } from '../operations/canonicalRetirementReportCli.js'
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

const retirementEnvironment = (recommendation: 'promote' | 'hold' = 'promote') => {
  const directory = mkdtempSync(join(tmpdir(), 'zzyix-retirement-'))
  const path = join(directory, 'report.json')
  const uuid = (value: number): string => `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`
  const attempts = recommendation === 'promote' ? 100 : 1
  const events = Array.from({ length: attempts }, (_, index) => {
    const occurredAt = new Date(Date.parse('2026-07-28T00:00:00.000Z') + index * 1_000).toISOString()
    const envelope = {
      schemaVersion: 1,
      attemptId: uuid(index + 1),
      occurredAt,
      quiltId: '10000000-0000-4000-8000-000000000001',
      canonicalGeneration: 2,
      cohort: 'global',
    }
    return [
      { ...envelope, eventId: uuid(index + 1), name: 'canonical_discovery', outcome: 'success', durationMs: 1, httpStatus: 200 },
      { ...envelope, eventId: uuid(index + 101), name: 'canonical_entry', outcome: 'ready', durationMs: 1, selectedProtocolVersion: 2 },
      { ...envelope, eventId: uuid(index + 201), attemptId: uuid(index + 1_001), parentAttemptId: envelope.attemptId, name: 'canonical_reconnect', outcome: 'recovered', durationMs: 1, attempts: 1 },
      { ...envelope, eventId: uuid(index + 301), attemptId: uuid(index + 2_001), parentAttemptId: envelope.attemptId, name: 'canonical_resubscribe', outcome: 'completed', durationMs: 1, requestedRooms: 1, acceptedRooms: 1, rejectedRooms: 0, resyncRequired: 0 },
    ]
  }).flat()
  events.push({
    schemaVersion: 1,
    eventId: uuid(500),
    attemptId: uuid(500),
    occurredAt: '2026-07-28T00:02:00.000Z',
    quiltId: '10000000-0000-4000-8000-000000000001',
    canonicalGeneration: 2,
    cohort: 'global',
    name: 'client_runtime',
    outcome: 'sampled',
    frameTimeMs: 16,
    retainedPatchCount: 1,
    retainedTileCount: 1,
    sceneObjectCount: 1,
    drawCalls: 1,
  })
  const input = Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
  const report = buildCanonicalRetirementReport(input, '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')
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

const approvedProductionMutation = () => ({
  ...retirementEnvironment(),
  FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
  AUTH_OWNER_E2E_GATE_APPROVED: 'true',
  AUTH_MIGRATION_REHEARSAL_APPROVED: 'true',
  AUTH_MUTATION_ROLLBACK_APPROVED: 'true',
  AUTH_PRODUCTION_AUTHORIZATION_BENCHMARK_APPROVED: 'true',
})

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
      ...retirementEnvironment(),
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toThrow('Production mutation approvals are incomplete')

    expect(() => validateProductionRolloutGates({
      ...retirementEnvironment(),
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

  it('keeps mutation disabled by default and honors explicit development enablement', () => {
    expect(resolveProtocolV2MutationEnabled(approvedProduction)).toBe(false)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'test',
      E2E_TEST_MODE: 'true',
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(true)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'development',
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(true)
    expect(resolveProtocolV2MutationEnabled({
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(true)
    expect(resolveProtocolV2MutationEnabled({
      NODE_ENV: 'test',
      FEATURE_PROTOCOL_V2_MUTATION_ENABLED: 'true',
    })).toBe(false)
  })

  it('enables production mutation only after every production approval passes', () => {
    expect(resolveProtocolV2MutationEnabled(approvedProductionMutation())).toBe(true)
    expect(() => resolveProtocolV2MutationEnabled({
      ...approvedProductionMutation(),
      AUTH_OWNER_E2E_GATE_APPROVED: 'false',
    })).toThrow('AUTH_OWNER_E2E_GATE_APPROVED')
  })

  it('requires digest-bound promote evidence for production retirement', () => {
    expect(() => validateProductionRolloutGates(approvedProduction)).toThrow('report path and SHA-256')
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