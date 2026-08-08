@description('The Azure region for the worker container app.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the Azure Container Apps managed environment.')
param managedEnvironmentId string

@description('Container image for the worker application.')
param workerImage string

@description('Application Insights connection string for worker telemetry.')
param appInsightsConnectionString string

@description('Internal base URL for the server worker-read routes.')
param agentServerBaseUrl string

@description('Pre-provisioned principal identifier for the worker runtime.')
param agentPrincipalId string

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

@description('Gateway mode for the worker runtime.')
@allowed([
  'fake'
  'foundry'
])
param agentGatewayMode string = 'fake'

@description('Enables Foundry provider calls when true; remains disabled by default.')
param agentFeatureFoundryEnabled bool = false

@description('Enables structured proposal drafting when true; remains disabled by default.')
param agentFeatureStructuredProposalsEnabled bool = false

@description('Enables the model-free deterministic read-only runtime. Enabled by default for safe rollout.')
param agentFeatureModelFreeEnabled bool = true

@description('Name of the PostgreSQL schema accessible to the worker control-plane role.')
@allowed([
  'agent_control'
])
param agentControlPlaneSchema string = 'agent_control'

@description('Optional Foundry endpoint for provider calls when enabled.')
param agentFoundryEndpoint string?

@description('OAuth scope used by the worker managed identity for Foundry provider calls.')
param agentFoundryTokenScope string?

@description('Minimum worker replicas for the container app.')
@minValue(1)
param minReplicas int = 1

@description('Maximum worker replicas for the container app.')
@minValue(1)
param maxReplicas int = 2

@description('Lease duration in seconds for one active quilt workflow.')
@minValue(1)
param leaseTtlSeconds int = 20

@description('Idle polling interval in seconds for trigger ingestion.')
@minValue(1)
param pollIntervalSeconds int = 1

@description('Timeout in seconds for worker read tools.')
@minValue(1)
param toolTimeoutSeconds int = 5

var workerSecrets = [
  {
    name: 'agent-control-plane-dsn'
    value: agentControlPlaneDsn
  }
]

var workerEnvironmentVariables = concat(
  [
    {
      name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
      value: appInsightsConnectionString
    }
    {
      name: 'AGENT_SERVER_BASE_URL'
      value: agentServerBaseUrl
    }
    {
      name: 'AGENT_PRINCIPAL_ID'
      value: agentPrincipalId
    }
    {
      name: 'AGENT_SERVER_TOKEN_SCOPE'
      value: agentServerTokenScope
    }
    {
      name: 'AGENT_AUTH_TRUSTED_ISSUER'
      value: agentAuthTrustedIssuer
    }
    {
      name: 'AGENT_AUTH_API_AUDIENCE'
      value: agentAuthApiAudience
    }
    {
      name: 'AGENT_AUTH_REQUIRED_ROLE'
      value: agentAuthRequiredRole
    }
    {
      name: 'FEATURE_AGENT_READS_ENABLED'
      value: string(agentFeatureServerReadsEnabled)
    }
    {
      name: 'AGENT_GATEWAY_MODE'
      value: agentFeatureFoundryEnabled ? agentGatewayMode : 'fake'
    }
    {
      name: 'AGENT_FEATURE_FOUNDRY_ENABLED'
      value: string(agentFeatureFoundryEnabled)
    }
    {
      name: 'AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED'
      value: string(agentFeatureStructuredProposalsEnabled)
    }
    {
      name: 'AGENT_FEATURE_MODEL_FREE_ENABLED'
      value: string(agentFeatureModelFreeEnabled)
    }
    {
      name: 'AGENT_CONTROL_PLANE_SCHEMA'
      value: agentControlPlaneSchema
    }
    {
      name: 'AGENT_CANONICAL_DB_ACCESS'
      value: 'disabled'
    }
    {
      name: 'AGENT_MUTATIONS_ENABLED'
      value: 'false'
    }
    {
      name: 'AGENT_MEMORY_ENABLED'
      value: 'false'
    }
    {
      name: 'AGENT_LEASE_TTL_SECONDS'
      value: string(leaseTtlSeconds)
    }
    {
      name: 'AGENT_POLL_INTERVAL_SECONDS'
      value: string(pollIntervalSeconds)
    }
    {
      name: 'AGENT_TOOL_TIMEOUT_SECONDS'
      value: string(toolTimeoutSeconds)
    }
  ],
  [
    {
      name: 'AGENT_CONTROL_PLANE_DSN'
      secretRef: 'agent-control-plane-dsn'
    }
  ],
  agentFoundryEndpoint == null ? [] : [
    {
      name: 'AGENT_FOUNDRY_ENDPOINT'
      value: agentFoundryEndpoint ?? ''
    }
  ],
  agentFoundryTokenScope == null ? [] : [
    {
      name: 'AGENT_FOUNDRY_TOKEN_SCOPE'
      value: agentFoundryTokenScope ?? ''
    }
  ]
)

resource workerContainerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-agent-worker'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: workerSecrets
    }
    template: {
      containers: [
        {
          name: 'agent-worker'
          image: workerImage
          env: workerEnvironmentVariables
          resources: {
            cpu: 1
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

@description('Worker container app name.')
output containerAppName string = workerContainerApp.name

@description('System-assigned managed identity principal ID for the worker.')
output principalId string = workerContainerApp.identity.principalId ?? ''
