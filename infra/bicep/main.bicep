@description('Short name for the target environment (e.g. dev, staging, prod). Used as a suffix on all resource names.')
param environmentName string = 'dev'

@description('Azure region for regional application resources. Defaults to the resource group location.')
param deploymentLocation string = resourceGroup().location

@description('Optional stable suffix for deploying the same environment into multiple regions simultaneously, for example westus3.')
param deploymentStamp string = ''

@description('Administrator login name for the PostgreSQL Flexible Server.')
param postgresAdminLogin string = 'pgadmin'

@description('Administrator password for the PostgreSQL Flexible Server. Must meet Azure complexity requirements.')
@secure()
@minLength(8)
param postgresAdminPassword string

@description('The application database name to provision on the PostgreSQL Flexible Server.')
param postgresDatabaseName string = 'zzyix'

@description('Optional Azure region for Log Analytics and Application Insights. Defaults to deploymentLocation.')
param monitoringLocation string = ''

@description('Container image for the Python agent worker.')
param agentWorkerImage string = 'ghcr.io/example/zzyix-agent-worker:latest'

@description('Internal server base URL used by the worker for read-only API calls.')
param agentServerBaseUrl string = 'http://zzyix-server'

@description('Pre-provisioned principal identifier for the worker runtime.')
param agentPrincipalId string = '11111111-1111-4111-8111-111111111111'

@description('Restricted PostgreSQL DSN for the durable worker control-plane schema.')
@secure()
@minLength(1)
param agentControlPlaneDsn string

@description('OAuth scope used by the worker managed identity for server app-only reads.')
@minLength(1)
param agentServerTokenScope string

@description('Issuer configured for worker app-only token validation.')
@minLength(1)
param agentAuthTrustedIssuer string

@description('Audience configured for worker app-only token validation.')
@minLength(1)
param agentAuthApiAudience string

@description('Application role required for worker app-only tokens.')
@allowed([
  'agent.runtime'
])
param agentAuthRequiredRole string = 'agent.runtime'

@description('Enables the worker server-read runtime gate.')
param agentFeatureServerReadsEnabled bool = false

@description('Gateway mode for worker model calls.')
@allowed([
  'fake'
  'foundry'
])
param agentGatewayMode string = 'fake'

@description('Enable Foundry model calls for the worker. Disabled by default for safe rollout.')
param agentFeatureFoundryEnabled bool = false

@description('Enable structured proposal drafting in the worker. Disabled by default for safe rollout.')
param agentFeatureStructuredProposalsEnabled bool = false

@description('Enable the model-free deterministic read-only worker runtime.')
param agentFeatureModelFreeEnabled bool = true

@description('PostgreSQL schema exposed to the restricted worker control-plane role.')
@allowed([
  'agent_control'
])
param agentControlPlaneSchema string = 'agent_control'

@description('Optional Foundry endpoint for worker model calls.')
param agentFoundryEndpoint string?

@description('OAuth scope used by the worker managed identity for Foundry provider calls.')
param agentFoundryTokenScope string?

@description('Minimum replica count for the worker container app.')
@minValue(1)
param agentWorkerMinReplicas int = 1

@description('Maximum replica count for the worker container app.')
@minValue(1)
param agentWorkerMaxReplicas int = 2

@description('Lease duration in seconds for one active quilt workflow.')
@minValue(1)
param agentLeaseTtlSeconds int = 20

@description('Idle polling interval in seconds for trigger ingestion.')
@minValue(1)
param agentPollIntervalSeconds int = 1

@description('Timeout in seconds for worker read tools.')
@minValue(1)
param agentToolTimeoutSeconds int = 5

var deploymentStampSuffix = empty(deploymentStamp) ? '' : '-${toLower(deploymentStamp)}'
var effectiveMonitoringLocation = empty(monitoringLocation) ? deploymentLocation : monitoringLocation
var namePrefix = 'zzyix-${environmentName}${deploymentStampSuffix}'

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
    location: effectiveMonitoringLocation
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
    logAnalyticsWorkspaceId: monitoring.outputs.workspaceId
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

// ── Agent Worker ─────────────────────────────────────────────────────────────
// Deploys the Python worker as an independently scalable Container App with
// a managed identity and feature-gated model settings.
module agentWorker 'modules/agent-worker.bicep' = {
  name: 'agentWorker'
  params: {
    location: deploymentLocation
    namePrefix: namePrefix
    managedEnvironmentId: containerAppsEnvironment.outputs.environmentId
    workerImage: agentWorkerImage
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    agentServerBaseUrl: agentServerBaseUrl
    agentPrincipalId: agentPrincipalId
    agentControlPlaneDsn: agentControlPlaneDsn
    agentServerTokenScope: agentServerTokenScope
    agentAuthTrustedIssuer: agentAuthTrustedIssuer
    agentAuthApiAudience: agentAuthApiAudience
    agentAuthRequiredRole: agentAuthRequiredRole
    agentFeatureServerReadsEnabled: agentFeatureServerReadsEnabled
    agentGatewayMode: agentGatewayMode
    agentFeatureFoundryEnabled: agentFeatureFoundryEnabled
    agentFeatureStructuredProposalsEnabled: agentFeatureStructuredProposalsEnabled
    agentFeatureModelFreeEnabled: agentFeatureModelFreeEnabled
    agentControlPlaneSchema: agentControlPlaneSchema
    agentFoundryEndpoint: agentFoundryEndpoint
    agentFoundryTokenScope: agentFoundryTokenScope
    minReplicas: agentWorkerMinReplicas
    maxReplicas: agentWorkerMaxReplicas
    leaseTtlSeconds: agentLeaseTtlSeconds
    pollIntervalSeconds: agentPollIntervalSeconds
    toolTimeoutSeconds: agentToolTimeoutSeconds
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
    databaseName: postgresDatabaseName
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output acaEnvironmentName string = containerAppsEnvironment.outputs.environmentName
output acaDefaultDomain string = containerAppsEnvironment.outputs.defaultDomain
@description('Application Insights connection string for server SDK instrumentation.')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
output postgresServerName string = postgresql.outputs.postgresServerName
output postgresServerFqdn string = postgresql.outputs.postgresServerFqdn
output agentWorkerContainerAppName string = agentWorker.outputs.containerAppName
output agentWorkerPrincipalId string = agentWorker.outputs.principalId
