import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type { CanonicalTelemetryEvent } from '../migration/quiltTelemetry.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
export const RETIREMENT_THRESHOLDS = {
  minimumWindowSeconds: 86400, minimumAuthenticatedEntryAttempts: 100,
  minimumDiscoverySuccessRate: 0.995, minimumReadyEntryRate: 0.99,
  maximumAcceptedV1Entries: 0, minimumReconnectRecoveryRate: 0.99,
  maximumReconnectRecoveryP95Ms: 10000, maximumResyncsPerReadyEntry: 0.01,
  maximumFrameTimeP95Ms: 33.3, rollbackWindowSeconds: 300,
  rollbackMinimumAttempts: 20, rollbackMaximumFailureRate: 0.02,
} as const

export type CanonicalRetirementGroup = {
  canonicalGeneration: number; cohort: 'canary' | 'global'; eventCounts: Record<string, number>
  discoverySuccessRate: number | null; readyEntryRate: number | null; acceptedV1Entries: number
  reconnectRecoveryRate: number | null; reconnectRecoveryP95Ms: number | null
  resyncsPerReadyEntry: number | null; clientFrameSampleCount: number; frameTimeP95Ms: number | null
}
export type CanonicalRetirementReportV1 = {
  schemaVersion: 1; reportType: 'canonical-retirement'; generatedAt: string
  observationWindow: { from: string; to: string; durationSeconds: number }
  evidence: { inputSha256: string; acceptedEvents: number; exactDuplicatesIgnored: number }
  thresholds: typeof RETIREMENT_THRESHOLDS; groups: CanonicalRetirementGroup[]
  immediateRollbackTriggers: Array<{ code: 'accepted_v1_entry' | 'descriptor_leak' | 'target_invalidated'; occurredAt: string; eventId: string; canonicalGeneration: number; cohort: 'canary' | 'global' }>
  rollbackWindows: Array<{ metric: 'discovery_failure' | 'entry_failure' | 'reconnect_exhaustion'; from: string; to: string; attempts: number; failures: number; rate: number; canonicalGeneration: number; cohort: 'canary' | 'global' }>
  decision: { eligible: boolean; measuredWindowApproved: boolean; clientBudgetPassed: boolean; recommendation: 'promote' | 'hold' | 'rollback'; failedChecks: string[] }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const safeInteger = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value)
const utc = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value))
const keys = (value: Record<string, unknown>, required: string[], optional: string[] = []): boolean => {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key))
}
const base = ['schemaVersion', 'eventId', 'attemptId', 'occurredAt', 'quiltId', 'canonicalGeneration', 'cohort', 'name', 'outcome']

export const parseCanonicalTelemetryEvent = (value: unknown): CanonicalTelemetryEvent => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !UUID.test(String(value.eventId)) || !UUID.test(String(value.attemptId))
    || !utc(value.occurredAt) || !UUID.test(String(value.quiltId)) || !Number.isSafeInteger(value.canonicalGeneration)
    || Number(value.canonicalGeneration) <= 0 || !['canary', 'global'].includes(String(value.cohort))) throw new Error('Invalid canonical telemetry envelope')
  const required = [...base]
  const optional: string[] = []
  switch (value.name) {
    case 'canonical_discovery':
      required.push('durationMs', 'httpStatus'); optional.push('reasonCode')
      if (!finite(value.durationMs) || !((value.outcome === 'success' && value.httpStatus === 200) || (value.outcome === 'unavailable' && value.httpStatus === 503) || (value.outcome === 'error' && value.httpStatus === 500))
        || (value.reasonCode !== undefined && !['missing', 'inactive', 'invalid_target', 'internal_error'].includes(String(value.reasonCode)))) throw new Error('Invalid canonical discovery event')
      break
    case 'canonical_entry':
      required.push('durationMs'); optional.push('selectedProtocolVersion')
      if (!finite(value.durationMs) || !['ready', 'discovery_failed', 'protocol_rejected', 'connection_failed', 'initial_sync_failed'].includes(String(value.outcome))
        || (value.selectedProtocolVersion !== undefined && ![1, 2].includes(Number(value.selectedProtocolVersion))) || (value.outcome === 'ready' && value.selectedProtocolVersion === undefined)) throw new Error('Invalid canonical entry event')
      break
    case 'canonical_reconnect':
      required.push('durationMs', 'attempts')
      if (!finite(value.durationMs) || !safeInteger(value.attempts) || !['recovered', 'exhausted'].includes(String(value.outcome))) throw new Error('Invalid canonical reconnect event')
      break
    case 'canonical_resubscribe':
      required.push('durationMs', 'requestedRooms', 'acceptedRooms', 'rejectedRooms', 'resyncRequired')
      if (!finite(value.durationMs) || ![value.requestedRooms, value.acceptedRooms, value.rejectedRooms, value.resyncRequired].every(safeInteger)
        || !['completed', 'failed'].includes(String(value.outcome))) throw new Error('Invalid canonical resubscribe event')
      break
    case 'canonical_old_client_rejected':
      required.push('transport'); optional.push('requestedSchemaVersion', 'requestedProtocolVersion')
      if (value.outcome !== 'rejected' || !['http', 'socket'].includes(String(value.transport))
        || (value.requestedSchemaVersion !== undefined && typeof value.requestedSchemaVersion !== 'string')
        || (value.requestedProtocolVersion !== undefined && !safeInteger(value.requestedProtocolVersion))) throw new Error('Invalid old-client event')
      break
    case 'canonical_safety':
      required.push('code'); optional.push('requestId')
      if (value.outcome !== 'detected' || !['descriptor_leak', 'target_invalidated'].includes(String(value.code)) || (value.requestId !== undefined && typeof value.requestId !== 'string')) throw new Error('Invalid safety event')
      break
    case 'client_runtime':
      required.push('frameTimeMs', 'retainedPatchCount', 'retainedTileCount', 'sceneObjectCount', 'drawCalls')
      if (value.outcome !== 'sampled' || ![value.frameTimeMs, value.retainedPatchCount, value.retainedTileCount, value.sceneObjectCount, value.drawCalls].every(finite)) throw new Error('Invalid runtime sample')
      break
    default: throw new Error('Unknown canonical telemetry event')
  }
  if (!keys(value, required, optional)) throw new Error('Unknown canonical telemetry field')
  return value as CanonicalTelemetryEvent
}

const sortValue = (value: unknown): unknown => Array.isArray(value) ? value.map(sortValue) : isRecord(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])])) : value
export const canonicalJson = (value: unknown): string => JSON.stringify(sortValue(value))
export const serializeCanonicalReport = (value: CanonicalRetirementReportV1): string => `${canonicalJson(value)}\n`
export const reportSha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const rate = (successes: number, attempts: number): number | null => attempts === 0 ? null : successes / attempts
const p95 = (values: number[]): number | null => values.length === 0 ? null : [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]
const groupKey = (event: CanonicalTelemetryEvent): string => `${event.canonicalGeneration}:${event.cohort}`

const findRollbackWindows = (events: CanonicalTelemetryEvent[]): CanonicalRetirementReportV1['rollbackWindows'] => {
  const definitions = [
    ['canonical_discovery', 'discovery_failure', (event: CanonicalTelemetryEvent) => event.name === 'canonical_discovery' && event.outcome !== 'success'],
    ['canonical_entry', 'entry_failure', (event: CanonicalTelemetryEvent) => event.name === 'canonical_entry' && event.outcome !== 'ready'],
    ['canonical_reconnect', 'reconnect_exhaustion', (event: CanonicalTelemetryEvent) => event.name === 'canonical_reconnect' && event.outcome === 'exhausted'],
  ] as const
  const result: CanonicalRetirementReportV1['rollbackWindows'] = []
  for (const terminal of events) for (const [name, metric, failed] of definitions) {
    if (terminal.name !== name) continue
    const end = Date.parse(terminal.occurredAt)
    const candidates = events.filter((event) => groupKey(event) === groupKey(terminal) && event.name === name && Date.parse(event.occurredAt) > end - 300_000 && Date.parse(event.occurredAt) <= end)
    const failures = candidates.filter(failed).length
    if (candidates.length >= 20 && failures / candidates.length > 0.02) result.push({ metric, from: new Date(end - 300_000).toISOString(), to: terminal.occurredAt, attempts: candidates.length, failures, rate: failures / candidates.length, canonicalGeneration: terminal.canonicalGeneration, cohort: terminal.cohort })
  }
  return result
}

export const buildCanonicalRetirementReport = (input: Buffer, from: string, to: string): CanonicalRetirementReportV1 => {
  if (!utc(from) || !utc(to) || Date.parse(to) <= Date.parse(from)) throw new Error('Invalid observation window')
  const deduped = new Map<string, { event: CanonicalTelemetryEvent; canonical: string }>()
  let exactDuplicatesIgnored = 0
  for (const [index, raw] of input.toString('utf8').split('\n').entries()) {
    if (!raw.trim()) continue
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error(`Invalid JSON on line ${index + 1}`) }
    const event = parseCanonicalTelemetryEvent(value)
    if (Date.parse(event.occurredAt) < Date.parse(from) || Date.parse(event.occurredAt) >= Date.parse(to)) throw new Error(`Out-of-window event ${event.eventId}`)
    const canonical = canonicalJson(event)
    const prior = deduped.get(event.eventId)
    if (prior) {
      if (prior.canonical !== canonical) throw new Error(`Conflicting duplicate eventId ${event.eventId}`)
      exactDuplicatesIgnored += 1; continue
    }
    deduped.set(event.eventId, { event, canonical })
  }
  const events = [...deduped.values()].map(({ event }) => event).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId))
  const terminals = new Set<string>()
  for (const event of events) {
    if (event.name === 'client_runtime') continue
    const key = `${event.name}:${event.attemptId}`
    if (terminals.has(key)) throw new Error(`Duplicate terminal ${key}`)
    terminals.add(key)
  }
  const grouped = new Map<string, CanonicalTelemetryEvent[]>()
  for (const event of events) grouped.set(groupKey(event), [...(grouped.get(groupKey(event)) ?? []), event])
  const groups = [...grouped.values()].map((items): CanonicalRetirementGroup => {
    const first = items[0]; const discoveries = items.filter((event) => event.name === 'canonical_discovery'); const entries = items.filter((event) => event.name === 'canonical_entry'); const reconnects = items.filter((event) => event.name === 'canonical_reconnect')
    const ready = entries.filter((event) => event.name === 'canonical_entry' && event.outcome === 'ready')
    const recovered = reconnects.filter((event): event is Extract<CanonicalTelemetryEvent, { name: 'canonical_reconnect' }> => event.name === 'canonical_reconnect' && event.outcome === 'recovered')
    const samples = items.filter((event): event is Extract<CanonicalTelemetryEvent, { name: 'client_runtime' }> => event.name === 'client_runtime')
    return { canonicalGeneration: first.canonicalGeneration, cohort: first.cohort, eventCounts: Object.fromEntries([...new Set(items.map((event) => event.name))].sort().map((name) => [name, items.filter((event) => event.name === name).length])), discoverySuccessRate: rate(discoveries.filter((event) => event.name === 'canonical_discovery' && event.outcome === 'success').length, discoveries.length), readyEntryRate: rate(ready.length, entries.length), acceptedV1Entries: ready.filter((event) => event.name === 'canonical_entry' && event.selectedProtocolVersion === 1).length, reconnectRecoveryRate: rate(recovered.length, reconnects.length), reconnectRecoveryP95Ms: p95(recovered.map((event) => event.durationMs)), resyncsPerReadyEntry: rate(items.reduce((sum, event) => sum + (event.name === 'canonical_resubscribe' ? event.resyncRequired : 0), 0), ready.length), clientFrameSampleCount: samples.length, frameTimeP95Ms: p95(samples.map((event) => event.frameTimeMs)) }
  }).sort((a, b) => a.canonicalGeneration - b.canonicalGeneration || a.cohort.localeCompare(b.cohort))
  const triggers = events.flatMap((event): CanonicalRetirementReportV1['immediateRollbackTriggers'] => { const code = event.name === 'canonical_entry' && event.outcome === 'ready' && event.selectedProtocolVersion === 1 ? 'accepted_v1_entry' : event.name === 'canonical_safety' ? event.code : null; return code ? [{ code, occurredAt: event.occurredAt, eventId: event.eventId, canonicalGeneration: event.canonicalGeneration, cohort: event.cohort }] : [] })
  const windows = findRollbackWindows(events); const durationSeconds = (Date.parse(to) - Date.parse(from)) / 1000
  const failedChecks: string[] = []
  if (durationSeconds < 86400) failedChecks.push('minimum_window')
  if (new Set(events.filter((event) => event.name === 'canonical_entry').map((event) => event.attemptId)).size < 100) failedChecks.push('minimum_authenticated_entry_attempts')
  if (!groups.some((group) => group.clientFrameSampleCount > 0)) failedChecks.push('minimum_frame_samples')
  const groupThresholds = groups.length > 0 && groups.every((group) => group.discoverySuccessRate !== null && group.discoverySuccessRate >= 0.995 && group.readyEntryRate !== null && group.readyEntryRate >= 0.99 && group.acceptedV1Entries === 0 && group.reconnectRecoveryRate !== null && group.reconnectRecoveryRate >= 0.99 && group.reconnectRecoveryP95Ms !== null && group.reconnectRecoveryP95Ms <= 10000 && group.resyncsPerReadyEntry !== null && group.resyncsPerReadyEntry <= 0.01)
  if (!groupThresholds) failedChecks.push('group_thresholds')
  const clientBudgetPassed = groups.length > 0 && groups.every((group) => group.frameTimeP95Ms !== null && group.frameTimeP95Ms <= 33.3)
  if (!clientBudgetPassed) failedChecks.push('client_budget')
  const eligible = !failedChecks.some((check) => ['minimum_window', 'minimum_authenticated_entry_attempts', 'minimum_frame_samples'].includes(check)) && groups.length > 0
  const measuredWindowApproved = eligible && groupThresholds && triggers.length === 0 && windows.length === 0
  const rollback = triggers.length > 0 || windows.length > 0
  return { schemaVersion: 1, reportType: 'canonical-retirement', generatedAt: to, observationWindow: { from, to, durationSeconds }, evidence: { inputSha256: reportSha256(input), acceptedEvents: events.length, exactDuplicatesIgnored }, thresholds: RETIREMENT_THRESHOLDS, groups, immediateRollbackTriggers: triggers, rollbackWindows: windows, decision: { eligible, measuredWindowApproved, clientBudgetPassed, recommendation: rollback ? 'rollback' : measuredWindowApproved && clientBudgetPassed ? 'promote' : 'hold', failedChecks: [...new Set(failedChecks)].sort() } }
}

export const parseCanonicalRetirementReport = (value: unknown): CanonicalRetirementReportV1 => {
  const invalid = (): never => { throw new Error('Invalid canonical retirement report') }
  if (!isRecord(value) || !keys(value, ['schemaVersion', 'reportType', 'generatedAt', 'observationWindow', 'evidence', 'thresholds', 'groups', 'immediateRollbackTriggers', 'rollbackWindows', 'decision'])
    || value.schemaVersion !== 1 || value.reportType !== 'canonical-retirement' || !utc(value.generatedAt)) throw new Error('Invalid canonical retirement report')
  const report = value

  const window = report.observationWindow
  if (!isRecord(window) || !keys(window, ['from', 'to', 'durationSeconds']) || !utc(window.from) || !utc(window.to)
    || !finite(window.durationSeconds) || Date.parse(window.to) <= Date.parse(window.from)
    || window.durationSeconds !== (Date.parse(window.to) - Date.parse(window.from)) / 1000 || report.generatedAt !== window.to) invalid()

  const evidence = report.evidence
  if (!isRecord(evidence) || !keys(evidence, ['inputSha256', 'acceptedEvents', 'exactDuplicatesIgnored'])
    || !SHA256.test(String(evidence.inputSha256)) || !safeInteger(evidence.acceptedEvents) || !safeInteger(evidence.exactDuplicatesIgnored)) invalid()

  if (!isRecord(report.thresholds) || !keys(report.thresholds, Object.keys(RETIREMENT_THRESHOLDS))
    || canonicalJson(report.thresholds) !== canonicalJson(RETIREMENT_THRESHOLDS)) invalid()

  const nullableFinite = (candidate: unknown): boolean => candidate === null || finite(candidate)
  const nullableRate = (candidate: unknown): boolean => candidate === null || (finite(candidate) && candidate <= 1)
  if (!Array.isArray(report.groups) || !report.groups.every((group: unknown) => {
    if (!isRecord(group) || !keys(group, ['canonicalGeneration', 'cohort', 'eventCounts', 'discoverySuccessRate', 'readyEntryRate', 'acceptedV1Entries', 'reconnectRecoveryRate', 'reconnectRecoveryP95Ms', 'resyncsPerReadyEntry', 'clientFrameSampleCount', 'frameTimeP95Ms'])
      || !Number.isSafeInteger(group.canonicalGeneration) || Number(group.canonicalGeneration) <= 0 || !['canary', 'global'].includes(String(group.cohort))
      || !isRecord(group.eventCounts) || !Object.values(group.eventCounts).every(safeInteger)) return false
    return nullableRate(group.discoverySuccessRate) && nullableRate(group.readyEntryRate) && safeInteger(group.acceptedV1Entries)
      && nullableRate(group.reconnectRecoveryRate) && nullableFinite(group.reconnectRecoveryP95Ms)
      && nullableFinite(group.resyncsPerReadyEntry) && safeInteger(group.clientFrameSampleCount) && nullableFinite(group.frameTimeP95Ms)
  })) invalid()

  if (!Array.isArray(report.immediateRollbackTriggers) || !report.immediateRollbackTriggers.every((trigger: unknown) => isRecord(trigger)
    && keys(trigger, ['code', 'occurredAt', 'eventId', 'canonicalGeneration', 'cohort'])
    && ['accepted_v1_entry', 'descriptor_leak', 'target_invalidated'].includes(String(trigger.code)) && utc(trigger.occurredAt)
    && UUID.test(String(trigger.eventId)) && Number.isSafeInteger(trigger.canonicalGeneration) && Number(trigger.canonicalGeneration) > 0
    && ['canary', 'global'].includes(String(trigger.cohort)))) invalid()

  if (!Array.isArray(report.rollbackWindows) || !report.rollbackWindows.every((rollbackWindow: unknown) => isRecord(rollbackWindow)
    && keys(rollbackWindow, ['metric', 'from', 'to', 'attempts', 'failures', 'rate', 'canonicalGeneration', 'cohort'])
    && ['discovery_failure', 'entry_failure', 'reconnect_exhaustion'].includes(String(rollbackWindow.metric))
    && utc(rollbackWindow.from) && utc(rollbackWindow.to) && Date.parse(String(rollbackWindow.to)) > Date.parse(String(rollbackWindow.from))
    && safeInteger(rollbackWindow.attempts) && safeInteger(rollbackWindow.failures) && Number(rollbackWindow.failures) <= Number(rollbackWindow.attempts)
    && finite(rollbackWindow.rate) && Number(rollbackWindow.rate) <= 1 && Number.isSafeInteger(rollbackWindow.canonicalGeneration)
    && Number(rollbackWindow.canonicalGeneration) > 0 && ['canary', 'global'].includes(String(rollbackWindow.cohort)))) invalid()

  const decision = report.decision
  if (!isRecord(decision) || !keys(decision, ['eligible', 'measuredWindowApproved', 'clientBudgetPassed', 'recommendation', 'failedChecks'])
    || typeof decision.eligible !== 'boolean' || typeof decision.measuredWindowApproved !== 'boolean' || typeof decision.clientBudgetPassed !== 'boolean'
    || !['promote', 'hold', 'rollback'].includes(String(decision.recommendation)) || !Array.isArray(decision.failedChecks)
    || !decision.failedChecks.every((check) => typeof check === 'string')) invalid()
  return value as unknown as CanonicalRetirementReportV1
}

const argumentsFrom = (args: string[]): { input: string; output: string; from: string; to: string } => {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) { const name = args[index]; const value = args[index + 1]; if (!['--input', '--output', '--from', '--to'].includes(name ?? '') || !value || values.has(name)) throw new Error('Usage: --input <path> --output <path> --from <utc> --to <utc>'); values.set(name, value) }
  if (values.size !== 4) throw new Error('Usage: --input <path> --output <path> --from <utc> --to <utc>')
  return { input: values.get('--input')!, output: values.get('--output')!, from: values.get('--from')!, to: values.get('--to')! }
}
const main = async (): Promise<void> => { const args = argumentsFrom(process.argv.slice(2)); const report = buildCanonicalRetirementReport(await readFile(args.input), args.from, args.to); const output = serializeCanonicalReport(report); await writeFile(args.output, output, { flag: 'wx' }); await writeFile(`${args.output}.sha256`, `${reportSha256(output)}\n`, { flag: 'wx' }) }
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main().catch((error) => { console.error(error instanceof Error ? error.message : 'Report generation failed'); process.exitCode = 1 })