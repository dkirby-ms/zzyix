import { describe, expect, it } from 'vitest'
import {
  buildCanonicalRetirementReport,
  parseCanonicalRetirementReport,
  parseCanonicalTelemetryEvent,
  reportSha256,
  serializeCanonicalReport,
} from './canonicalRetirementReportCli.js'

const uuid = (value: number): string => `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`
const base = (eventId: number, attemptId: number, occurredAt: string) => ({
  schemaVersion: 1 as const, eventId: uuid(eventId), attemptId: uuid(attemptId), occurredAt,
  quiltId: '10000000-0000-4000-8000-000000000001', canonicalGeneration: 2, cohort: 'global' as const,
})

const evidence = (): Buffer => {
  const events: unknown[] = []
  for (let index = 0; index < 100; index += 1) {
    const occurredAt = new Date(Date.parse('2026-07-28T00:00:00.000Z') + index * 1_000).toISOString()
    events.push({ ...base(index + 1, index + 1, occurredAt), name: 'canonical_discovery', outcome: 'success', durationMs: index, httpStatus: 200 })
    events.push({ ...base(index + 101, index + 1, occurredAt), name: 'canonical_entry', outcome: 'ready', durationMs: index, selectedProtocolVersion: 2 })
    events.push({ ...base(index + 201, index + 1, occurredAt), name: 'canonical_reconnect', outcome: 'recovered', durationMs: index === 99 ? 9_000 : index, attempts: 1 })
    events.push({ ...base(index + 301, index + 1, occurredAt), name: 'canonical_resubscribe', outcome: 'completed', durationMs: index, requestedRooms: 1, acceptedRooms: 1, rejectedRooms: 0, resyncRequired: 0 })
  }
  events.push({ ...base(401, 401, '2026-07-28T00:02:00.000Z'), name: 'client_runtime', outcome: 'sampled', frameTimeMs: 16, retainedPatchCount: 1, retainedTileCount: 1, sceneObjectCount: 1, drawCalls: 1 })
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
}

describe('canonical retirement report', () => {
  it('generates deterministic promotion evidence with nearest-rank p95 and input binding', () => {
    const input = evidence()
    const report = buildCanonicalRetirementReport(input, '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')
    const output = serializeCanonicalReport(report)

    expect(report.generatedAt).toBe('2026-07-29T00:00:00.000Z')
    expect(report.evidence.inputSha256).toBe(reportSha256(input))
    expect(report.groups[0]).toMatchObject({ reconnectRecoveryP95Ms: 94, frameTimeP95Ms: 16 })
    expect(report.decision).toMatchObject({ eligible: true, measuredWindowApproved: true, clientBudgetPassed: true, recommendation: 'promote' })
    expect(output.endsWith('\n')).toBe(true)
    expect(serializeCanonicalReport(buildCanonicalRetirementReport(input, '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z'))).toBe(output)
  })

  it('strictly validates the complete startup report schema', () => {
    const report = buildCanonicalRetirementReport(evidence(), '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')
    expect(parseCanonicalRetirementReport(report)).toEqual(report)
    expect(() => parseCanonicalRetirementReport({ ...report, unknown: true })).toThrow('Invalid canonical retirement report')
    expect(() => parseCanonicalRetirementReport({ ...report, thresholds: { ...report.thresholds, maximumFrameTimeP95Ms: 40 } })).toThrow('Invalid canonical retirement report')
    expect(() => parseCanonicalRetirementReport({ ...report, groups: report.groups.map((group) => ({ ...group, unknown: true })) })).toThrow('Invalid canonical retirement report')
    expect(() => parseCanonicalRetirementReport({ ...report, generatedAt: report.observationWindow.from })).toThrow('Invalid canonical retirement report')
    expect(() => parseCanonicalRetirementReport({
      ...report,
      decision: { ...report.decision, recommendation: 'hold' },
    })).toThrow('Invalid canonical retirement report')
    expect(() => parseCanonicalRetirementReport({
      ...report,
      groups: [],
    })).toThrow('Invalid canonical retirement report')
  })

  it('keeps pre-world failures out of canonical generation groups and blocks promotion', () => {
    const input = Buffer.concat([
      evidence(),
      Buffer.from(`${JSON.stringify({
        schemaVersion: 1,
        eventId: uuid(900),
        attemptId: uuid(900),
        occurredAt: '2026-07-28T00:03:00.000Z',
        quiltId: null,
        canonicalGeneration: null,
        cohort: 'global',
        name: 'canonical_discovery',
        outcome: 'unavailable',
        durationMs: 5,
        httpStatus: 503,
        reasonCode: 'missing',
      })}\n`),
    ])

    const report = buildCanonicalRetirementReport(input, '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')

    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].canonicalGeneration).toBe(2)
    expect(report.decision).toMatchObject({ recommendation: 'hold' })
    expect(report.decision.failedChecks).toContain('pre_world_discovery_failure')
  })

  it('ignores exact event-ID duplicates and rejects conflicts, unknown fields, and duplicate terminals', () => {
    const event = { ...base(1, 1, '2026-07-28T00:00:01.000Z'), name: 'canonical_entry', outcome: 'ready', durationMs: 1, selectedProtocolVersion: 2 }
    const duplicate = Buffer.from(`${JSON.stringify(event)}\n${JSON.stringify(event)}\n`)
    expect(buildCanonicalRetirementReport(duplicate, '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z').evidence.exactDuplicatesIgnored).toBe(1)
    expect(() => buildCanonicalRetirementReport(Buffer.from(`${JSON.stringify(event)}\n${JSON.stringify({ ...event, durationMs: 2 })}\n`), '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')).toThrow('Conflicting duplicate')
    expect(() => parseCanonicalTelemetryEvent({ ...event, extra: true })).toThrow('Unknown canonical telemetry field')
    expect(() => buildCanonicalRetirementReport(Buffer.from(`${JSON.stringify(event)}\n${JSON.stringify({ ...event, eventId: uuid(2) })}\n`), '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')).toThrow('Duplicate terminal')
  })

  it('accepts multiple runtime samples for one entry attempt', () => {
    const events = [
      { ...base(1, 1, '2026-07-28T00:00:01.000Z'), name: 'canonical_entry', outcome: 'ready', durationMs: 1, selectedProtocolVersion: 2 },
      { ...base(2, 1, '2026-07-28T00:00:02.000Z'), name: 'client_runtime', outcome: 'sampled', frameTimeMs: 10, retainedPatchCount: 1, retainedTileCount: 1, sceneObjectCount: 1, drawCalls: 1 },
      { ...base(3, 1, '2026-07-28T00:00:03.000Z'), name: 'client_runtime', outcome: 'sampled', frameTimeMs: 30, retainedPatchCount: 1, retainedTileCount: 1, sceneObjectCount: 1, drawCalls: 1 },
    ]
    const input = Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`)

    const report = buildCanonicalRetirementReport(input, '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')

    expect(report.evidence.acceptedEvents).toBe(3)
    expect(report.groups[0]).toMatchObject({
      eventCounts: { canonical_entry: 1, client_runtime: 2 },
      clientFrameSampleCount: 2,
      frameTimeP95Ms: 30,
    })
  })

  it('uses half-open five-minute windows and rejects out-of-window records', () => {
    const events = Array.from({ length: 20 }, (_, index) => ({
      ...base(index + 1, index + 1, new Date(Date.parse('2026-07-28T00:05:00.000Z') + index).toISOString()),
      name: 'canonical_entry', outcome: index === 0 ? 'connection_failed' : 'ready', durationMs: 1,
      ...(index === 0 ? {} : { selectedProtocolVersion: 2 }),
    }))
    const report = buildCanonicalRetirementReport(Buffer.from(events.map((event) => JSON.stringify(event)).join('\n')), '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')
    expect(report.rollbackWindows.at(-1)).toMatchObject({ attempts: 20, failures: 1, rate: 0.05 })
    expect(report.decision.recommendation).toBe('rollback')
    expect(() => buildCanonicalRetirementReport(Buffer.from(JSON.stringify({ ...events[0], occurredAt: '2026-07-29T00:00:00.000Z' })), '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z')).toThrow('Out-of-window')
  })
})