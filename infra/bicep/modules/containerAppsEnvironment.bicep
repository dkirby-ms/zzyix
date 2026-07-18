@description('The Azure region for ACA resources.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the ACA infrastructure subnet.')
param acaSubnetId string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: '${namePrefix}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Consumption-only ACA environment with VNet integration so it can reach PostgreSQL
// on the private subnet. No workloadProfiles → pure Consumption plan (no dedicated nodes).
// Note: logAnalyticsConfiguration requires the workspace shared key because the
// Microsoft.App/managedEnvironments API has no Managed Identity path for this property.
// listKeys() is called inline and is never surfaced in deployment outputs.
resource acaEnvironment 'Microsoft.App/managedEnvironments@2026-01-01' = {
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
