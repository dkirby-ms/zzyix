@description('The Azure region for ACA resources.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the ACA infrastructure subnet.')
param acaSubnetId string

// Log Analytics workspace (backing store for Application Insights)
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: '${namePrefix}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    features: {
      enableLogAccessUsingOnlyResourcePermissions: false
    }
  }
}

// Workspace-based Application Insights for better UI and querying
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-ai'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
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
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output appInsightsResourceId string = appInsights.id
