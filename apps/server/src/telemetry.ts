import { useAzureMonitor } from '@azure/monitor-opentelemetry'
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api'
import crypto from 'node:crypto'

const parseSamplingRatio = (rawRatio: string | undefined): number => {
  const parsed = Number(rawRatio ?? '1.0')
  if (!Number.isFinite(parsed)) {
    return 1.0
  }

  if (parsed < 0) {
    return 0
  }

  if (parsed > 1) {
    return 1
  }

  return parsed
}

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  try {
    useAzureMonitor({
      azureMonitorExporterOptions: {
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
      },
      samplingRatio: parseSamplingRatio(process.env.OTEL_SAMPLING_RATIO),
    })
  } catch (error) {
    console.error('[telemetry] Azure Monitor initialization failed; continuing without telemetry', error)
  }
}

const agentReadTracer = trace.getTracer('zzyix.server.agent-reads')

const REDACTED_IDENTIFIER_ATTRIBUTE_PATTERN = /(?:^|\.)(?:quilt_id|patch_id|run_id|trigger_id|principal_id|agent_principal_id)$/

const redactWorkerReadAttributes = (attributes: Attributes): Attributes => {
  const redacted: Attributes = {}

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string' && REDACTED_IDENTIFIER_ATTRIBUTE_PATTERN.test(key)) {
      redacted[key] = crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)
      continue
    }

    redacted[key] = value
  }

  return redacted
}

export const annotateWorkerReadTelemetry = (attributes: Attributes): void => {
  trace.getActiveSpan()?.setAttributes({
    'agent.read.payload_redacted': true,
    ...redactWorkerReadAttributes(attributes),
  })
}

export const runWithWorkerReadTelemetry = async <T>(
  spanName: string,
  attributes: Attributes,
  work: () => Promise<T>,
): Promise<T> => agentReadTracer.startActiveSpan(spanName, { attributes }, async (span) => {
  try {
    const result = await work()
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (error) {
    span.recordException(error as Error)
    span.setStatus({ code: SpanStatusCode.ERROR })
    throw error
  } finally {
    span.end()
  }
})
