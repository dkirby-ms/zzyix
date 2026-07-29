import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  authorizationAuditEvents,
  canonicalWorld,
  externalPrincipalMappings,
  patchClaimQuotaRecords,
  patches,
  patchVisibilityPolicies,
  pendingOwnershipTransfers,
  principals,
  quiltPresenceLeases,
} from './schema.js'

const configFor = (table: Parameters<typeof getTableConfig>[0]) => getTableConfig(table)

describe('authentication and authorization schema', () => {
  it('defines the constrained and indexed canonical singleton pointer', () => {
    const config = configFor(canonicalWorld)

    expect(config.columns.find((column) => column.name === 'product_key')?.primary).toBe(true)
    expect(config.checks.map((constraint) => constraint.name)).toEqual(expect.arrayContaining([
      'canonical_world_product_key_check',
      'canonical_world_status_check',
      'canonical_world_generation_check',
    ]))
    expect(config.indexes.map((index) => index.config.name)).toContain('canonical_world_quilt_id_idx')
    expect(config.foreignKeys[0]?.reference().foreignTable).toBeDefined()
  })

  it('defaults principals to active and keeps profile claims non-unique', () => {
    const config = configFor(principals)

    expect(config.columns.find((column) => column.name === 'status')?.default).toBe('active')
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).not.toContain('principals_email_unique')
    expect(config.checks.map((constraint) => constraint.name)).toContain('principals_deletion_timeline_check')
  })

  it('defines expiring per-socket quilt presence leases', () => {
    const config = configFor(quiltPresenceLeases)

    expect(config.columns.find((column) => column.name === 'socket_id')?.primary).toBe(true)
    expect(config.foreignKeys).toHaveLength(2)
    expect(config.indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      'quilt_presence_leases_principal_expiry_idx',
      'quilt_presence_leases_expiry_idx',
    ]))
  })

  it('enforces exact tuple and reverse principal mapping uniqueness', () => {
    const config = configFor(externalPrincipalMappings)

    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'provider_namespace',
      'external_subject',
    ])
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      'external_principal_mappings_principal_id_unique',
    )
  })

  it('persists conservative visibility defaults for every protected surface', () => {
    const config = configFor(patchVisibilityPolicies)
    const defaults = Object.fromEntries(config.columns.map((column) => [column.name, column.default]))

    expect(defaults).toMatchObject({
      existence: 'authenticated',
      fine_data: 'authenticated',
      aggregate_data: 'authenticated',
      presence: 'authenticated',
      search: 'authenticated',
      durable_events: 'authenticated',
      claim_enabled: false,
      policy_version: 1,
    })
    expect(config.foreignKeys[0]?.reference().foreignTable).toBe(patches)
  })

  it('defines durable quota, transfer, and general audit records without external identity fields', () => {
    expect(configFor(patchClaimQuotaRecords).indexes.map((index) => index.config.name)).toContain(
      'patch_claim_quota_records_principal_attempt_idx',
    )
    expect(configFor(pendingOwnershipTransfers).checks.map((constraint) => constraint.name)).toContain(
      'pending_ownership_transfers_distinct_principals_check',
    )

    const auditColumns = configFor(authorizationAuditEvents).columns.map((column) => column.name)
    expect(auditColumns).toContain('actor_principal_id')
    expect(auditColumns).not.toContain('external_subject')
    expect(auditColumns).not.toContain('token')
  })
})