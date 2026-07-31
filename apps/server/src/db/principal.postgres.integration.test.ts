import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import { completePrincipalDeletion, recoverPrincipalDeletion, requestPrincipalDeletion } from './repository.js'
import { authorizationAuditEvents, externalPrincipalMappings, patches, principals, quilts } from './schema.js'

describe('principal deletion lifecycle', () => {
  let database: PostgresTestDatabase
  const principalId = 'b1000000-0000-4000-8000-000000000001'
  const quiltId = 'b2000000-0000-4000-8000-000000000001'
  const patchId = 'b3000000-0000-4000-8000-000000000001'

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_principal_deletion')
    await database.db.insert(principals).values({
      id: principalId, kind: 'human', displayName: 'Delete Me', email: 'delete@example.test',
    })
    await database.db.insert(externalPrincipalMappings).values({
      providerNamespace: 'https://issuer.example.test', externalSubject: 'subject-private', principalId,
    })
    await database.db.insert(quilts).values({
      id: quiltId, patchRows: 1, patchColumns: 1,
      patchWidth: 10, patchHeight: 10, topology: 'toroidal', protocolVersion: 2,
    })
    await database.db.insert(patches).values({
      id: patchId, quiltId, row: 0, column: 0, ownerPrincipalId: principalId, state: 'active',
    })
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  it('disables immediately, recovers in-window, and preserves the principal', async () => {
    await expect(requestPrincipalDeletion({
      operationId: randomUUID(), principalId, requestedAt: new Date('2026-06-01T00:00:00Z'),
    })).resolves.toMatchObject({ succeeded: true })
    expect((await database.db.select().from(principals).where(eq(principals.id, principalId)))[0].status)
      .toBe('deletion_pending')

    await expect(recoverPrincipalDeletion({
      operationId: randomUUID(), principalId, recoveredAt: new Date('2026-06-15T00:00:00Z'),
    })).resolves.toMatchObject({ succeeded: true })
    expect((await database.db.select().from(principals).where(eq(principals.id, principalId)))[0].status)
      .toBe('active')
  })

  it('fails closed at day 30 while ownership remains and while retention is unapproved', async () => {
    await requestPrincipalDeletion({
      operationId: randomUUID(), principalId, requestedAt: new Date('2026-06-20T00:00:00Z'),
    })
    const completedAt = new Date('2026-07-20T00:00:01Z')
    await expect(completePrincipalDeletion({
      operationId: randomUUID(), principalId, retentionApproved: true, completedAt,
    })).resolves.toMatchObject({ succeeded: false, reason: 'OWNERSHIP_UNRESOLVED' })

    await database.db.update(patches).set({ ownerPrincipalId: null, state: 'unclaimed' }).where(eq(patches.id, patchId))
    await expect(completePrincipalDeletion({
      operationId: randomUUID(), principalId, retentionApproved: false, completedAt,
    })).resolves.toMatchObject({ succeeded: false, reason: 'RETENTION_UNAPPROVED' })
    expect(await database.db.select().from(externalPrincipalMappings)).toHaveLength(1)
    expect(JSON.stringify(await database.db.select().from(authorizationAuditEvents))).not.toContain('subject-private')
  })
})