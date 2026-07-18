@description('The Azure region for network resources.')
param location string

@description('Name prefix for network resources.')
param namePrefix string

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2025-07-01' = {
  name: '${namePrefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        // ACA consumption-only environments require a dedicated /21 or larger subnet
        name: 'aca-infrastructure'
        properties: {
          addressPrefix: '10.0.0.0/21'
          delegations: [
            {
              name: 'aca-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        // PostgreSQL Flexible Server VNet integration requires a dedicated delegated subnet
        name: 'postgres'
        properties: {
          addressPrefix: '10.0.8.0/28'
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

output vnetId string = virtualNetwork.id
output vnetName string = virtualNetwork.name
output acaSubnetId string = virtualNetwork.properties.subnets[0].id
output postgresSubnetId string = virtualNetwork.properties.subnets[1].id
