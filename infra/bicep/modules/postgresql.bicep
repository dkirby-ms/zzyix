@description('The Azure region for PostgreSQL resources.')
param location string

@description('Name prefix for resources.')
param namePrefix string

@description('The resource ID of the PostgreSQL delegated subnet.')
param postgresSubnetId string

@description('The resource ID of the VNet containing the PostgreSQL subnet.')
param vnetId string

@description('The PostgreSQL administrator login.')
param adminLogin string

@description('The PostgreSQL administrator password.')
@secure()
param adminPassword string

var serverName = '${namePrefix}-psql'

// Private DNS zone is required for PostgreSQL Flexible Server VNet integration.
// Name must be in the form <unique>.private.postgres.database.azure.com.
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${serverName}.private.postgres.database.azure.com'
  location: 'global'
}

// Link the DNS zone to the VNet so ACA containers can resolve the server hostname
resource privateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${namePrefix}-dns-vnet-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}

// PostgreSQL Flexible Server — cheapest dev SKU:
//   Tier: Burstable (pay-per-use, no minimum cores reserved)
//   Compute: Standard_B1ms (1 vCore, 2 GiB RAM)
//   Storage: 32 GiB (minimum)
//   HA: Disabled (no standby replica)
//   Geo-backup: Disabled (dev environment only)
//   Network: Private access via VNet delegation — no public endpoint
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: postgresSubnetId
      privateDnsZoneArmResourceId: privateDnsZone.id
    }
  }
  dependsOn: [
    privateDnsZoneVnetLink
  ]
}

output postgresServerName string = postgresServer.name
output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
