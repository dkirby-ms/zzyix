@description('Short name for the target environment (e.g. dev, staging, prod). Used as a suffix on all resource names.')
param environmentName string = 'dev'

@description('Administrator login name for the PostgreSQL Flexible Server.')
param postgresAdminLogin string = 'pgadmin'

@description('Administrator password for the PostgreSQL Flexible Server. Must meet Azure complexity requirements.')
@secure()
@minLength(8)
param postgresAdminPassword string

@description('The immutable server container image reference used by operational jobs.')
param serverImage string

@description('The PostgreSQL connection string used only by operational jobs.')
@secure()
param operationalDatabaseUrl string

@description('The Microsoft Entra object ID of the deployment workflow service principal.')
param deploymentPrincipalId string

var namePrefix = 'zzyix-${environmentName}'
var deploymentLocation = resourceGroup().location

// ── Networking ────────────────────────────────────────────────────────────────
// VNet with two subnets:
//   • aca-infrastructure  /21  — delegated to ACA managed environment
//   • postgres            /28  — delegated to PostgreSQL Flexible Server
module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: deploymentLocation
    namePrefix: namePrefix
  }
}

// ── Monitoring ────────────────────────────────────────────────────────────────
// Log Analytics workspace for Container Apps environment logs.
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: deploymentLocation
    namePrefix: namePrefix
  }
}

// ── Azure Container Apps Environment ─────────────────────────────────────────
// Consumption-only plan (no dedicated workload profiles).
// VNet-integrated so containers can reach the private PostgreSQL subnet.
module containerAppsEnvironment 'modules/containerAppsEnvironment.bicep' = {
  name: 'containerAppsEnvironment'
  params: {
    location: deploymentLocation
    namePrefix: namePrefix
    acaSubnetId: network.outputs.acaSubnetId
    logAnalyticsCustomerId: monitoring.outputs.customerId
    logAnalyticsSharedKey: monitoring.outputs.sharedKey
  }
}

// ── Observability Diagnostics ─────────────────────────────────────────────────
// Adds platform-level diagnostic settings to ACA environment routing logs/metrics to Log Analytics.
module diagnostics 'modules/diagnostics.bicep' = {
  name: 'diagnostics'
  params: {
    acaEnvironmentId: containerAppsEnvironment.outputs.environmentId
    logAnalyticsWorkspaceId: monitoring.outputs.workspaceId
  }
}

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────
// Burstable B1ms (cheapest dev SKU), private-only (no public endpoint).
// ACA containers connect using the FQDN resolved via the private DNS zone.
module postgresql 'modules/postgresql.bicep' = {
  name: 'postgresql'
  params: {
    location: deploymentLocation
    namePrefix: namePrefix
    postgresSubnetId: network.outputs.postgresSubnetId
    vnetId: network.outputs.vnetId
    adminLogin: postgresAdminLogin
    adminPassword: postgresAdminPassword
  }
}

module recoveryJob 'modules/recovery-job.bicep' = {
  params: {
    databaseUrl: operationalDatabaseUrl
    environmentId: containerAppsEnvironment.outputs.environmentId
    invocationPrincipalId: deploymentPrincipalId
    location: deploymentLocation
    namePrefix: namePrefix
    serverImage: serverImage
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output acaEnvironmentName string = containerAppsEnvironment.outputs.environmentName
output acaDefaultDomain string = containerAppsEnvironment.outputs.defaultDomain
@description('Application Insights connection string for server SDK instrumentation.')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
output postgresServerName string = postgresql.outputs.postgresServerName
output postgresServerFqdn string = postgresql.outputs.postgresServerFqdn
output recoveryJobName string = recoveryJob.outputs.jobName
