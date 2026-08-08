---
title: Fantome Agent Entra Setup
description: Entra ID and Azure RBAC setup required for the Fantome resident agent worker
ms.date: 2026-08-08
ms.topic: how-to
keywords:
  - Entra ID
  - managed identity
  - app roles
  - Azure Container Apps
  - resident agents
estimated_reading_time: 6
---

## Purpose

The Fantome worker uses a system-assigned managed identity from Azure Container
Apps. That identity calls the server with an app-only token and, later, calls
Foundry when model execution is enabled.

The additive infrastructure deployment provisions the shared Container Apps
environment, networking, PostgreSQL, and monitoring resources. GitHub CD is the
sole owner of the worker Container App: it creates or updates the worker image,
managed identity, secrets, environment variables, and replica settings. The
app-role grant to that managed identity happens after CD creates the Container
App, because the identity principal ID does not exist beforehand.

## Current identity model

This implementation does not use Microsoft Entra Agent ID. It uses existing
Azure workload identity primitives:

* A system-assigned managed identity on the worker Container App
* A server API app registration that exposes the `agent.runtime` app role
* A Zzyix database `agent` principal used for application authorization,
  quilt assignment, and audit

Microsoft Entra Agent ID is a separate Entra agent identity platform for
creating and governing agent identities and agent identity blueprints at
enterprise scale. Adopting it would change this runbook and the runtime identity
contract. The worker would need to obtain and present an Agent ID-backed
identity rather than relying only on the Container App managed identity and
server API app-role assignment.

For the current MVP, the managed identity plus app-role assignment is the
activation path.

## Required inputs

Collect these values before enabling worker server reads:

| Value | Example | Source |
|-------|---------|--------|
| Tenant ID | `<tenant-id>` | Entra tenant that issues worker tokens |
| Trusted issuer | `https://login.microsoftonline.com/<tenant-id>/v2.0` | Server app-only token validation |
| Server API audience | `api://zzyix-agent-reader` | Exposed API app registration |
| Agent JWKS URI | `https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys` | Signing keys for app-only token validation |
| Server token scope | `api://zzyix-agent-reader/.default` | Worker managed identity token request |
| Required app role | `agent.runtime` | App role required by server auth |
| Worker principal ID | Deployment output | System-assigned managed identity object ID used for app role assignment |
| Agent control principal ID | UUID from `principals.id` | Database principal used by `AGENT_PRINCIPAL_ID` in worker control-plane records |
| Restricted control-plane DSN | Secret value | PostgreSQL role limited to `agent_control` |

The server must receive matching auth configuration through its runtime
environment:

```text
AUTH_AGENT_TRUSTED_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
AUTH_AGENT_API_AUDIENCE=api://zzyix-agent-reader
AUTH_AGENT_JWKS_URI=https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys
AUTH_AGENT_REQUIRED_ROLE=agent.runtime
```

GitHub environment variables carry the same contract values for operational
traceability and token acquisition:

```text
AGENT_SERVER_TOKEN_SCOPE=api://zzyix-agent-reader/.default
AUTH_AGENT_TRUSTED_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
AUTH_AGENT_API_AUDIENCE=api://zzyix-agent-reader
AUTH_AGENT_JWKS_URI=https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys
AUTH_AGENT_REQUIRED_ROLE=agent.runtime
```

## Pre-deployment setup

Create or verify the server API app registration before deployment.

1. Confirm the API application ID URI matches `AUTH_AGENT_API_AUDIENCE`, for
  example `api://zzyix-agent-reader`.
2. Confirm the API exposes an application role with value `agent.runtime`.
3. Confirm the server runtime can validate app-only tokens for the issuer,
   audience, and role listed above.
4. Create or retrieve the restricted PostgreSQL DSN for the `agent_control_worker`
  role. Store it outside source control as the GitHub environment secret
  `AGENT_CONTROL_PLANE_DSN`.

GitHub CD can deploy the worker before assigning `agent.runtime` to its managed
identity, but keep these environment variables disabled until the grant is
complete:

```text
FEATURE_AGENT_READS_ENABLED=false
AGENT_FEATURE_FOUNDRY_ENABLED=false
AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED=false
AGENT_GATEWAY_MODE=fake
```

## Additive infrastructure deployment

Run a what-if first so the existing environment receives only the expected
additive changes:

```bash
az deployment group what-if \
  --resource-group <resource-group> \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/host.main.bicepparam
```

Deploy when the what-if output matches the expected shared infrastructure
changes. The worker Container App is deployed separately by GitHub CD:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --name fantome-agent-worker \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/host.main.bicepparam
```

GitHub CD then creates or updates the worker Container App. Capture its managed
identity principal ID after the CD run:

```bash
WORKER_PRINCIPAL_ID=$(az containerapp show \
  --resource-group <resource-group> \
  --name <agent-worker-container-app-name> \
  --query identity.principalId \
  -o tsv)
```

## Assign the server app role

Use Microsoft Graph to assign the `agent.runtime` app role to the worker managed
identity. The target resource service principal is the enterprise application
for the server API app registration.

```bash
SERVER_API_APP_ID='<server-api-application-client-id-or-app-id-uri>'

SERVER_RESOURCE_SP_ID=$(az ad sp show \
  --id "$SERVER_API_APP_ID" \
  --query id \
  -o tsv)

APP_ROLE_ID=$(az ad sp show \
  --id "$SERVER_API_APP_ID" \
  --query "appRoles[?value=='agent.runtime'].id | [0]" \
  -o tsv)

az rest \
  --method post \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${WORKER_PRINCIPAL_ID}/appRoleAssignments" \
  --headers 'Content-Type=application/json' \
  --body "{\"principalId\":\"${WORKER_PRINCIPAL_ID}\",\"resourceId\":\"${SERVER_RESOURCE_SP_ID}\",\"appRoleId\":\"${APP_ROLE_ID}\"}"
```

The account running this command needs permission to assign app roles in Entra.
If the command fails with an authorization error, an Entra administrator must
perform the assignment or grant the required directory permission.

## Provision the agent principal

The server rejects unknown or inactive agent identities. Before enabling worker
reads, create an active `agent` principal that corresponds to the app identity
the token verifier maps, typically `app:<application-id>`.

Record the created principal ID as the `agentPrincipalId` deployment parameter,
set `AGENT_PRINCIPAL_ID` to that same value, and use the same principal in
`agent_control.agent_assignments` for each quilt the worker may process.

`AGENT_PRINCIPAL_ID` is the database principal UUID, not the worker Container
App managed identity object ID.

## Enable server reads

After the app-role assignment and principal provisioning are complete, redeploy
or update configuration with server reads enabled:

```text
FEATURE_AGENT_READS_ENABLED=true
```

Keep Foundry disabled until the Foundry RBAC assignment and model gateway
configuration are ready.

## Optional Foundry RBAC

Foundry access is only required when both of these settings are enabled:

```bicep
param agentFeatureFoundryEnabled = true
param agentGatewayMode = 'foundry'
```

Assign the worker managed identity the least-privilege role required by the
target Foundry resource or project:

```bash
az role assignment create \
  --assignee-object-id "$WORKER_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role '<foundry-role-name>' \
  --scope '<foundry-resource-or-project-resource-id>'
```

Set the Foundry token scope and endpoint only after that assignment is in place:

```text
agentFoundryEndpoint=<foundry-endpoint>
agentFoundryTokenScope=<foundry-token-scope>
```

## Validation checklist

Use this checklist before turning on production worker behavior:

* The server API app registration exposes `agent.runtime` as an application role.
* The worker Container App has a system-assigned managed identity.
* The worker managed identity has the `agent.runtime` app-role assignment.
* The server has `AUTH_AGENT_TRUSTED_ISSUER`, `AUTH_AGENT_API_AUDIENCE`, and
  `AUTH_AGENT_REQUIRED_ROLE` configured.
* The worker has `AGENT_SERVER_TOKEN_SCOPE` configured to the server API
  `.default` scope.
* The `agentPrincipalId` parameter points to an active pre-provisioned `agent`
  principal.
* The restricted DSN authenticates as a role with access to `agent_control` and
  no canonical quilt write access.
* `FEATURE_AGENT_READS_ENABLED` remains false until the identity and
  principal checks pass.
* Foundry settings remain disabled until Foundry RBAC and gateway policy values
  are confirmed.