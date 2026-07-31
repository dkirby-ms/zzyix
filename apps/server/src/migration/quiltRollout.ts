import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  parseCanonicalRetirementReport,
  reportSha256,
  serializeCanonicalReport,
} from '../operations/canonicalRetirementReportCli.js'

export type QuiltCanaryConfig = {
  enabled: boolean
  dualReadEnabled: boolean
  protocolV2Enabled: boolean
  quiltIds: Set<string>
  principalIds: Set<string>
  cohortPercent: number
}

export type QuiltCanarySubject = {
  quiltId: string
  principalId?: string
}

export type QuiltRolloutDecision = {
  canary: boolean
  dualReadEnabled: boolean
  protocolV2Enabled: boolean
}

export type LegacyRetirementGates = {
  requested: boolean
  parityPassed: boolean
  recoveryPassed: boolean
  multiReplicaPassed: boolean
  authenticatedPrincipalIntegrationPassed: boolean
  clientBudgetPassed: boolean
  measuredWindowApproved: boolean
  rollbackPolicyApproved: boolean
}

export type LegacyRetirementDecision = {
  retireLegacy: boolean
  unmetGates: Array<Exclude<keyof LegacyRetirementGates, 'requested'>>
}

const parseSet = (value: string | undefined): Set<string> => new Set(
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
)

const parsePercent = (value: string | undefined): number => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0
}

const parseBoolean = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true'

export const loadQuiltCanaryConfig = (environment: NodeJS.ProcessEnv = process.env): QuiltCanaryConfig => ({
  enabled: parseBoolean(environment.FEATURE_QUILT_DUAL_READ_CANARY_ENABLED),
  dualReadEnabled: parseBoolean(environment.FEATURE_QUILT_DUAL_READ_ENABLED),
  protocolV2Enabled: parseBoolean(environment.FEATURE_QUILT_PROTOCOL_V2_ENABLED),
  quiltIds: parseSet(environment.FEATURE_QUILT_DUAL_READ_CANARY_QUILT_IDS),
  principalIds: parseSet(environment.FEATURE_QUILT_DUAL_READ_CANARY_PRINCIPAL_IDS),
  cohortPercent: parsePercent(environment.FEATURE_QUILT_DUAL_READ_CANARY_PERCENT),
})

export const isQuiltCanarySubject = (
  subject: QuiltCanarySubject,
  config: QuiltCanaryConfig,
): boolean => {
  if (!config.enabled || !subject.principalId) return false
  if (config.quiltIds.has(subject.quiltId) && config.principalIds.has(subject.principalId)) return true
  if (config.cohortPercent <= 0) return false

  const digest = createHash('sha256')
    .update(`${subject.quiltId}:${subject.principalId}`)
    .digest()
  const bucket = digest.readUInt32BE(0) % 10_000
  return bucket < config.cohortPercent * 100
}

export const resolveQuiltRollout = (
  subject: QuiltCanarySubject,
  config: QuiltCanaryConfig,
): QuiltRolloutDecision => {
  const canary = isQuiltCanarySubject(subject, config)
  return {
    canary,
    dualReadEnabled: config.dualReadEnabled || canary,
    protocolV2Enabled: config.protocolV2Enabled || canary,
  }
}

export const loadLegacyRetirementGates = (
  environment: NodeJS.ProcessEnv = process.env,
): LegacyRetirementGates => {
  const requested = parseBoolean(environment.FEATURE_LEGACY_RETIREMENT_REQUESTED)
  let clientBudgetPassed = false
  let measuredWindowApproved = false
  if (requested) {
    const reportPath = environment.LEGACY_RETIREMENT_REPORT_PATH
    const expectedDigest = environment.LEGACY_RETIREMENT_REPORT_SHA256?.toLowerCase()
    if (!reportPath || !expectedDigest || !/^[0-9a-f]{64}$/.test(expectedDigest)) {
      throw new Error('Legacy retirement requires a report path and SHA-256 digest')
    }
    const reportBytes = readFileSync(reportPath)
    if (reportSha256(reportBytes) !== expectedDigest) throw new Error('Legacy retirement report digest mismatch')
    const report = parseCanonicalRetirementReport(JSON.parse(reportBytes.toString('utf8')))
    if (serializeCanonicalReport(report) !== reportBytes.toString('utf8')) throw new Error('Legacy retirement report is not canonical JSON')
    if (report.decision.recommendation !== 'promote') throw new Error('Legacy retirement report does not recommend promotion')
    clientBudgetPassed = report.decision.clientBudgetPassed
    measuredWindowApproved = report.decision.measuredWindowApproved
  }
  return {
    requested,
    parityPassed: parseBoolean(environment.LEGACY_RETIREMENT_PARITY_PASSED),
    recoveryPassed: parseBoolean(environment.LEGACY_RETIREMENT_RECOVERY_PASSED),
    multiReplicaPassed: parseBoolean(environment.LEGACY_RETIREMENT_MULTI_REPLICA_PASSED),
    authenticatedPrincipalIntegrationPassed: parseBoolean(environment.LEGACY_RETIREMENT_AUTHENTICATED_PRINCIPAL_INTEGRATION_PASSED),
    clientBudgetPassed,
    measuredWindowApproved,
    rollbackPolicyApproved: parseBoolean(environment.LEGACY_RETIREMENT_ROLLBACK_POLICY_APPROVED),
  }
}

export const decideLegacyRetirement = (gates: LegacyRetirementGates): LegacyRetirementDecision => {
  const gateNames: LegacyRetirementDecision['unmetGates'] = [
    'parityPassed',
    'recoveryPassed',
    'multiReplicaPassed',
    'authenticatedPrincipalIntegrationPassed',
    'clientBudgetPassed',
    'measuredWindowApproved',
    'rollbackPolicyApproved',
  ]
  const unmetGates = gateNames.filter((gate) => !gates[gate])

  return {
    retireLegacy: gates.requested && unmetGates.length === 0,
    unmetGates,
  }
}