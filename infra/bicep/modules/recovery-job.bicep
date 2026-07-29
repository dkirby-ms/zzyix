@description('The Azure region for the recovery job.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the Container Apps managed environment.')
param environmentId string

@description('The immutable server container image reference used by the recovery job.')
param serverImage string

@description('The PostgreSQL connection string used only by the recovery job.')
@secure()
param databaseUrl string

@description('The Microsoft Entra object ID of the deployment workflow service principal.')
param invocationPrincipalId string

resource recoveryJob 'Microsoft.App/jobs@2025-01-01' = {
  name: '${namePrefix}-principal-recovery'
  location: location
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'principal-recovery'
          image: serverImage
          command: [
            'node'
          ]
          args: [
            'dist/operations/principalRecoveryCli.js'
          ]
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

resource recoveryInvocationRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'principal-recovery-job-invoker')
  properties: {
    roleName: '${namePrefix} Principal Recovery Job Invoker'
    description: 'Starts and observes only the restricted principal recovery job.'
    type: 'CustomRole'
    assignableScopes: [
      resourceGroup().id
    ]
    permissions: [
      {
        actions: [
          'Microsoft.App/jobs/read'
          'Microsoft.App/jobs/start/action'
          'Microsoft.App/jobs/executions/read'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
  }
}

resource recoveryInvocationAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(recoveryJob.id, invocationPrincipalId, recoveryInvocationRole.id)
  scope: recoveryJob
  properties: {
    principalId: invocationPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: recoveryInvocationRole.id
    description: 'Allows the deployment workflow identity to invoke only the restricted recovery job.'
  }
}

@description('The provisioned restricted recovery job name.')
output jobName string = recoveryJob.name