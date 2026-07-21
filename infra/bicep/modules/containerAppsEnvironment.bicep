@description('The Azure region for ACA resources.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the ACA infrastructure subnet.')
param acaSubnetId string

@description('The Log Analytics workspace customer ID for ACA app logs.')
param logAnalyticsCustomerId string

@description('The Log Analytics workspace shared key for ACA app logs.')
@secure()
param logAnalyticsSharedKey string

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
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
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

