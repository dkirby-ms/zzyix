using 'main.bicep'

// Environment tag applied to all resource names (e.g. zzyix-dev-*)
param environmentName = 'dev'

// PostgreSQL administrator username
param postgresAdminLogin = 'pgadmin'

// ⚠ REQUIRED — override this value at deployment time; never commit a real password.
// Recommended: reference an Azure Key Vault secret so the value is never stored in source:
//   param postgresAdminPassword = getSecret('<subscriptionId>', '<rgName>', '<vaultName>', 'postgresAdminPassword')
// Alternatively, pass it via CLI and omit this line from the params file:
//   az deployment group create ... --parameters postgresAdminPassword='<secret>'
// The placeholder below will fail the @minLength(8) validation check if deployed as-is.
param postgresAdminPassword = 'REPLACE_ME'

// Required operational deployment values. Override all placeholders at deployment time.
param serverImage = 'ghcr.io/OWNER/REPOSITORY-server:IMMUTABLE_TAG'
param operationalDatabaseUrl = 'REPLACE_WITH_SECRET_DATABASE_URL'
param deploymentPrincipalId = '00000000-0000-0000-0000-000000000000'
