import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import { externalPrincipalMappings, principals } from '../db/schema.js'
import type { PrincipalStatusValue } from '../db/types.js'
import { resolveAgentPrincipal, resolveOrProvisionPrincipal } from './principalContext.js'
import type { VerifiedExternalIdentity } from './tokenVerifier.js'

const ISSUER = 'https://issuer.example.test/tenant/v2.0'

const identity = (
  subject: string,
  overrides: Partial<VerifiedExternalIdentity> = {},
): VerifiedExternalIdentity => ({
  kind: 'delegated_user',
  issuer: ISSUER,
  subject,
  expiresAt: new Date(Date.now() + 5 * 60_000),
  scope: ['quilt.access'],
  roles: [],
  displayName: `User ${subject}`,
  email: 'shared@example.test',
  ...overrides,
})

const agentIdentity = (
  appId: string,
  overrides: Partial<VerifiedExternalIdentity> = {},
): VerifiedExternalIdentity => ({
  kind: 'app_agent',
  issuer: ISSUER,
  subject: `app:${appId}`,
  applicationId: appId,
  expiresAt: new Date(Date.now() + 5 * 60_000),
  scope: [],
  roles: ['agent.runtime'],
  ...overrides,
})

describe('transactional principal resolution', () => {
  let database: PostgresTestDatabase
  let pool: Pool

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_principal_context')
    pool = database.createConnection()
  }, 30_000)

  afterAll(async () => {
    await pool?.end()
    await database?.dispose()
  }, 30_000)

  it('converges concurrent first login to one immutable principal and mapping', async () => {
    const contexts = await Promise.all(
      Array.from({ length: 12 }, () => resolveOrProvisionPrincipal(identity('concurrent-subject'))),
    )

    expect(new Set(contexts.map((context) => context.principalId))).toHaveLength(1)
    const counts = await pool.query<{ principals: number; mappings: number }>(`
      SELECT
        (SELECT count(*)::int FROM principals WHERE display_name = 'User concurrent-subject') AS principals,
        (SELECT count(*)::int FROM external_principal_mappings
          WHERE provider_namespace = $1 AND external_subject = 'concurrent-subject') AS mappings
    `, [ISSUER])
    expect(counts.rows[0]).toEqual({ principals: 1, mappings: 1 })
  })

  it('never merges identities by email, display name, subject alone, or issuer alone', async () => {
    const first = await resolveOrProvisionPrincipal(identity('metadata-a', { displayName: 'Same Name' }))
    const second = await resolveOrProvisionPrincipal(identity('metadata-b', { displayName: 'Same Name' }))
    const otherIssuer = await resolveOrProvisionPrincipal(identity('metadata-a', {
      issuer: 'https://other-issuer.example.test/tenant/v2.0',
      displayName: 'Same Name',
    }))

    expect(new Set([first.principalId, second.principalId, otherIssuer.principalId])).toHaveLength(3)
  })

  it('updates profile metadata without changing the mapped principal', async () => {
    const first = await resolveOrProvisionPrincipal(identity('profile-update', { email: 'old@example.test' }))
    const second = await resolveOrProvisionPrincipal(identity('profile-update', {
      displayName: 'Updated Name',
      email: 'new@example.test',
    }))

    expect(second.principalId).toBe(first.principalId)
    const [profile] = await database.db
      .select({ displayName: principals.displayName, email: principals.email })
      .from(principals)
      .where(eq(principals.id, first.principalId))
    expect(profile).toEqual({ displayName: 'Updated Name', email: 'new@example.test' })
  })

  it.each<PrincipalStatusValue>(['disabled', 'deletion_pending', 'deleted'])(
    'fails closed immediately for a %s principal',
    async (status) => {
      const subject = `inactive-${status}`
      const context = await resolveOrProvisionPrincipal(identity(subject))
      const now = new Date()
      await database.db
        .update(principals)
        .set({
          status,
          deletionRequestedAt: status === 'disabled' ? null : now,
          deletionRecoveryDeadline: status === 'deletion_pending' ? new Date(now.getTime() + 60_000) : null,
          deletionCompletedAt: status === 'deleted' ? now : null,
        })
        .where(eq(principals.id, context.principalId))

      await expect(resolveOrProvisionPrincipal(identity(subject))).rejects.toMatchObject({
        code: 'principal_inactive',
        status: 403,
      })
    },
  )

  it('enforces reverse principal uniqueness independently of exact tuple uniqueness', async () => {
    const context = await resolveOrProvisionPrincipal(identity('reverse-unique'))

    await expect(database.db.insert(externalPrincipalMappings).values({
      providerNamespace: ISSUER,
      externalSubject: 'second-subject-for-same-principal',
      principalId: context.principalId,
    })).rejects.toMatchObject({
      cause: {
        code: '23505',
        constraint: 'external_principal_mappings_principal_id_unique',
      },
    })
  })

  it('accepts only pre-provisioned active agent principals', async () => {
    const agentPrincipalId = '55555555-5555-4555-8555-555555555555'
    await database.db.insert(principals).values({
      id: agentPrincipalId,
      kind: 'agent',
      status: 'active',
      displayName: 'Fantome Agent',
    })
    await database.db.insert(externalPrincipalMappings).values({
      providerNamespace: ISSUER,
      externalSubject: 'app:00000000-0000-0000-0000-000000000123',
      principalId: agentPrincipalId,
    })

    await expect(resolveAgentPrincipal(agentIdentity('00000000-0000-0000-0000-000000000123')))
      .resolves
      .toMatchObject({ principalId: agentPrincipalId, status: 'active' })
  })

  it('rejects unknown agent identities without creating principal records', async () => {
    const before = await pool.query<{ count: number }>('select count(*)::int as count from principals')

    await expect(resolveAgentPrincipal(agentIdentity('00000000-0000-0000-0000-000000000124')))
      .rejects
      .toMatchObject({ code: 'principal_inactive', status: 403 })

    const after = await pool.query<{ count: number }>('select count(*)::int as count from principals')
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count)
  })

  it('rejects inactive agent mappings', async () => {
    const agentPrincipalId = '66666666-6666-4666-8666-666666666666'
    await database.db.insert(principals).values({
      id: agentPrincipalId,
      kind: 'agent',
      status: 'disabled',
      displayName: 'Inactive Agent',
    })
    await database.db.insert(externalPrincipalMappings).values({
      providerNamespace: ISSUER,
      externalSubject: 'app:00000000-0000-0000-0000-000000000125',
      principalId: agentPrincipalId,
    })

    await expect(resolveAgentPrincipal(agentIdentity('00000000-0000-0000-0000-000000000125')))
      .rejects
      .toMatchObject({ code: 'principal_inactive', status: 403 })
  })
})