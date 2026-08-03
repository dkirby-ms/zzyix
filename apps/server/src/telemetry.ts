import { useAzureMonitor } from '@azure/monitor-opentelemetry'

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
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: parseSamplingRatio(process.env.OTEL_SAMPLING_RATIO),
  })
}
