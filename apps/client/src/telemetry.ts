/**
 * Client-side telemetry initialization using Application Insights.
 * This module is imported early in main.tsx before React components render.
 */

import { ApplicationInsights } from '@microsoft/applicationinsights-web'
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
      const applicationInsights = new ApplicationInsights({
        config: {
          connectionString: config.connectionString,
        },
      })
      applicationInsights.loadAppInsights()
      applicationInsights.trackPageView()
      console.debug('[telemetry] Application Insights initialized successfully')
    } catch (error) {
      console.error('[telemetry] Failed to initialize Application Insights', error)
    }
  } catch (error) {
    console.error('[telemetry] Unexpected error during telemetry initialization', error)
  }
}
