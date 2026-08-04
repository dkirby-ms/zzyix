@description('The Azure region for ACA resources.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the ACA infrastructure subnet.')
param acaSubnetId string

@description('The resource ID of the Log Analytics workspace for ACA app logs.')
param logAnalyticsWorkspaceId string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' existing = {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

// Consumption-only ACA environment with VNet integration so it can reach PostgreSQL
// on the private subnet. No workloadProfiles → pure Consumption plan (no dedicated nodes).
// Logs are sent to Log Analytics via Application Insights instrumentation.
resource acaEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-aca-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: acaSubnetId
      internal: false
    }
  }
}

output environmentId string = acaEnvironment.id
output environmentName string = acaEnvironment.name
output defaultDomain string = acaEnvironment.properties.defaultDomain

