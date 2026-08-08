using 'main.bicep'

// Environment tag applied to all resource names (e.g. zzyix-dev-*)
param environmentName = 'dev'

// Optional: deploy the same environment into multiple regions with a stable regional name suffix.
param deploymentLocation = 'westus3'
param deploymentStamp = 'westus3'

// PostgreSQL administrator username
param postgresAdminLogin = 'pgadmin'

// ⚠ REQUIRED — override this value at deployment time; never commit a real password.
// Recommended: reference an Azure Key Vault secret so the value is never stored in source:
//   param postgresAdminPassword = getSecret('<subscriptionId>', '<rgName>', '<vaultName>', 'postgresAdminPassword')
// Alternatively, pass it via CLI and omit this line from the params file:
//   az deployment group create ... --parameters postgresAdminPassword='<secret>'
// The placeholder below will fail the @minLength(8) validation check if deployed as-is.
param postgresAdminPassword = 'REPLACE_ME'
// Replace this placeholder before deployment.

// Worker image and internal server route configuration.
param agentWorkerImage = 'ghcr.io/example/zzyix-agent-worker:latest'
param agentServerBaseUrl = 'http://zzyix-server'
param agentPrincipalId = '11111111-1111-4111-8111-111111111111'

// Safe rollout defaults: model calls and structured proposals remain disabled.
param agentGatewayMode = 'fake'
param agentFeatureFoundryEnabled = false
param agentFeatureStructuredProposalsEnabled = false
param agentFeatureModelFreeEnabled = true
param agentControlPlaneSchema = 'agent_control_plane'

// Scale worker independently from the server.
param agentWorkerMinReplicas = 0
param agentWorkerMaxReplicas = 2
param agentLeaseTtlSeconds = 20
param agentPollIntervalSeconds = 1
param agentToolTimeoutSeconds = 5
