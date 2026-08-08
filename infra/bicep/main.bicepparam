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
// The placeholder below is not a real secret and must be replaced before deployment.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', 'REPLACE_ME')
// Replace this placeholder before deployment.

// Worker image and internal server route configuration.
param agentWorkerImage = readEnvironmentVariable('AGENT_WORKER_IMAGE', 'ghcr.io/example/zzyix-agent-worker:latest')
param agentServerBaseUrl = readEnvironmentVariable('AGENT_SERVER_BASE_URL', 'https://replace-with-internal-server-origin')
param agentPrincipalId = readEnvironmentVariable('AGENT_PRINCIPAL_ID', '11111111-1111-4111-8111-111111111111')

// Required deployment inputs. Supply these through a deployment-specific parameter overlay or CLI.
// No token, DSN, or tenant secret is stored in this repository.
param agentServerTokenScope = readEnvironmentVariable('AGENT_SERVER_TOKEN_SCOPE', 'api://zzyix-agent-reader/.default')
param agentAuthTrustedIssuer = readEnvironmentVariable('AUTH_AGENT_TRUSTED_ISSUER', 'https://login.microsoftonline.com/REPLACE_TENANT_ID/v2.0')
param agentAuthApiAudience = readEnvironmentVariable('AUTH_AGENT_API_AUDIENCE', 'api://zzyix-agent-reader')
param agentAuthRequiredRole = readEnvironmentVariable('AUTH_AGENT_REQUIRED_ROLE', 'agent.runtime')
param agentFeatureServerReadsEnabled = false
param agentControlPlaneDsn = readEnvironmentVariable('AGENT_CONTROL_PLANE_DSN', 'postgresql://replace-with-agent-control-worker-dsn')

// Safe rollout defaults: model calls and structured proposals remain disabled.
param agentGatewayMode = 'fake'
param agentFeatureFoundryEnabled = false
param agentFeatureStructuredProposalsEnabled = false
param agentFeatureModelFreeEnabled = true
param agentControlPlaneSchema = 'agent_control'

// Scale worker independently from the server.
param agentWorkerMinReplicas = 1
param agentWorkerMaxReplicas = 2
param agentLeaseTtlSeconds = 20
param agentPollIntervalSeconds = 1
param agentToolTimeoutSeconds = 5
