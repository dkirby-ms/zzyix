@description('The resource ID of the ACA managed environment to configure diagnostics for.')
param acaEnvironmentId string

@description('The resource ID of the Log Analytics workspace for diagnostic log destination.')
param logAnalyticsWorkspaceId string

// Resolve the ACA environment resource by ID using existing() to scope the diagnostic setting.
resource acaEnvironmentResource 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: last(split(acaEnvironmentId, '/'))
}

// Diagnostic settings for the ACA managed environment.
// Routes ContainerAppConsoleLogs and system logs to Log Analytics for queryability.
resource acaEnvironmentDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'aca-env-diagnostics'
  scope: acaEnvironmentResource
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'ContainerAppConsoleLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
      {
        category: 'ContainerAppSystemLogs'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: { enabled: false, days: 0 }
      }
    ]
  }
}
