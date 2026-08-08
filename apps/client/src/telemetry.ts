/**
 * Client-side telemetry initialization using Azure Monitor OpenTelemetry.
 * This module is imported early in main.tsx before React components render.
 */

import { useAzureMonitor } from '@azure/monitor-opentelemetry-web'
import { loadRuntimeTelemetryConfig } from './config/telemetryConfig'

/**
 * Initializes Application Insights telemetry.
 * This function should be called as early as possible in the application startup.
 */
export const initializeTelemetry = async (): Promise<void> => {
  try {
    const config = await loadRuntimeTelemetryConfig()
    
    if (!config) {
      console.debug('[telemetry] Application Insights not configured; skipping initialization')
      return
    }

    try {
      useAzureMonitor({
        azureMonitorExporterOptions: {
          connectionString: config.connectionString,
        },
      })
      console.debug('[telemetry] Application Insights initialized successfully')
    } catch (error) {
      console.error('[telemetry] Failed to initialize Application Insights', error)
    }
  } catch (error) {
    console.error('[telemetry] Unexpected error during telemetry initialization', error)
  }
}
