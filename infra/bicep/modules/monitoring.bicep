@description('The Azure region for monitoring resources.')
param location string

@description('Name prefix for monitoring resources.')
param namePrefix string

// Log Analytics workspace used by the Container Apps environment.
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${namePrefix}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

@description('The Log Analytics workspace resource ID.')
output workspaceId string = logAnalyticsWorkspace.id

@description('The Log Analytics workspace customer ID.')
output customerId string = logAnalyticsWorkspace.properties.customerId

@description('The Log Analytics workspace shared key.')
#disable-next-line outputs-should-not-contain-secrets
output sharedKey string = logAnalyticsWorkspace.listKeys().primarySharedKey
