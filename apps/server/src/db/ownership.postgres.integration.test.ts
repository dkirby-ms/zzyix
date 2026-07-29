import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import {
  abandonPatch,
  acceptOwnershipTransfer,
  cancelOwnershipTransfer,
  claimPatch,
  completePrincipalDeletion,
  createOwnershipTransfer,
  expireOwnershipTransfers,
  recoverPrincipalDeletion,
  requestPrincipalDeletion,
} from './repository.js'
import {
  authorizationAuditEvents,
  patchClaimQuotaRecords,
  patchMemberships,
  patches,
  patchVisibilityPolicies,
  pendingOwnershipTransfers,
  principals,
  quilts,
} from './schema.js'

describe('patch ownership claims', () => {
  let database: PostgresTestDatabase
  const quiltId = 'a1000000-0000-4000-8000-000000000001'
  const patchId = 'a2000000-0000-4000-8000-000000000001'
  const firstPrincipalId = 'a3000000-0000-4000-8000-000000000001'
  const secondPrincipalId = 'a3000000-0000-4000-8000-000000000002'

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_ownership_claims')
    await database.db.insert(principals).values([
      { id: firstPrincipalId, kind: 'human' },
      { id: secondPrincipalId, kind: 'human' },
    ])
    await database.db.insert(quilts).values({
      id: quiltId,
      patchRows: 1,
      patchColumns: 2,
      patchWidth: 10,
      patchHeight: 10,
      topology: 'toroidal',
      protocolVersion: 2,
    })
    await database.db.insert(patches).values({ id: patchId, quiltId, row: 0, column: 0 })
    await database.db.insert(patchVisibilityPolicies).values({ patchId, claimEnabled: true })
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  it('produces exactly one winner and audits both concurrent attempts', async () => {
    const operationIds = [randomUUID(), randomUUID()]
    const results = await Promise.all([
      claimPatch({ operationId: operationIds[0], principalId: firstPrincipalId, patchId }),
      claimPatch({ operationId: operationIds[1], principalId: secondPrincipalId, patchId }),
    ])

    expect(results.filter((result) => result.claimed)).toHaveLength(1)
    expect(results.filter((result) => result.reason === 'PATCH_UNAVAILABLE')).toHaveLength(1)
    expect(await database.db.select().from(patchMemberships)).toHaveLength(1)
    expect(await database.db.select().from(patchClaimQuotaRecords)).toHaveLength(2)
    expect(await database.db.select().from(authorizationAuditEvents)).toHaveLength(2)

    const winnerOperationId = operationIds[results.findIndex((result) => result.claimed)]
    await expect(claimPatch({
      operationId: winnerOperationId,
      principalId: results[0].claimed ? firstPrincipalId : secondPrincipalId,
      patchId,
    })).resolves.toMatchObject({ claimed: true, idempotent: true })
    expect(await database.db.select().from(authorizationAuditEvents)).toHaveLength(2)
  })

  it('denies claims when persisted policy disables them', async () => {
    const disabledPatchId = 'a2000000-0000-4000-8000-000000000002'
    await database.db.insert(patches).values({ id: disabledPatchId, quiltId, row: 0, column: 1 })
    await database.db.insert(patchVisibilityPolicies).values({ patchId: disabledPatchId, claimEnabled: false })

    await expect(claimPatch({
      operationId: randomUUID(),
      principalId: secondPrincipalId,
      patchId: disabledPatchId,
    })).resolves.toMatchObject({ claimed: false, reason: 'CLAIMS_DISABLED' })

    const [unchanged] = await database.db.select().from(patches).where(eq(patches.id, disabledPatchId))
    expect(unchanged.ownerPrincipalId).toBeNull()
  })

  it('audits an unknown patch denial without persisting unsafe identifiers', async () => {
    const operationId = randomUUID()
    await expect(claimPatch({
      operationId,
      principalId: secondPrincipalId,
      patchId: 'a2000000-0000-4000-8000-000000000099',
    })).resolves.toMatchObject({ claimed: false, reason: 'PATCH_UNAVAILABLE' })
    const [audit] = await database.db.select().from(authorizationAuditEvents)
      .where(eq(authorizationAuditEvents.operationId, operationId))
    expect(audit).toMatchObject({ outcome: 'denied', reasonCode: 'PATCH_UNAVAILABLE', patchId: null, quiltId: null })
  })

  it('enforces three attempts per ten minutes and one active patch per quilt', async () => {
    const quotaPrincipalId = 'a3000000-0000-4000-8000-000000000008'
    const quotaQuiltId = 'a1000000-0000-4000-8000-000000000005'
    await database.db.insert(principals).values({ id: quotaPrincipalId, kind: 'human' })
    await database.db.insert(quilts).values({
      id: quotaQuiltId, patchRows: 1, patchColumns: 4,
      patchWidth: 10, patchHeight: 10, topology: 'toroidal', protocolVersion: 2,
    })
    const quotaPatchIds = Array.from({ length: 4 }, (_, index) =>
      `a2000000-0000-4000-8000-00000000010${index}`)
    await database.db.insert(patches).values(quotaPatchIds.map((id, column) => ({
      id, quiltId: quotaQuiltId, row: 0, column,
    })))
    await database.db.insert(patchVisibilityPolicies).values(quotaPatchIds.map((id) => ({ patchId: id, claimEnabled: false })))
    const attemptedAt = new Date('2026-07-28T12:00:00Z')
    for (const id of quotaPatchIds.slice(0, 3)) {
      await claimPatch({ operationId: randomUUID(), principalId: quotaPrincipalId, patchId: id, attemptedAt })
    }
    await database.db.update(patchVisibilityPolicies).set({ claimEnabled: true })
      .where(eq(patchVisibilityPolicies.patchId, quotaPatchIds[3]))
    await expect(claimPatch({
      operationId: randomUUID(), principalId: quotaPrincipalId,
      patchId: quotaPatchIds[3], attemptedAt: new Date(attemptedAt.getTime() + 1),
    })).resolves.toMatchObject({ claimed: false, reason: 'QUOTA_EXCEEDED' })

    const ownerPrincipalId = 'a3000000-0000-4000-8000-000000000009'
    await database.db.insert(principals).values({ id: ownerPrincipalId, kind: 'human' })
    await database.db.update(patches).set({ ownerPrincipalId, state: 'active' }).where(eq(patches.id, quotaPatchIds[0]))
    await database.db.insert(patchMemberships).values({ patchId: quotaPatchIds[0], principalId: ownerPrincipalId, role: 'owner' })
    await database.db.update(patchVisibilityPolicies).set({ claimEnabled: true })
      .where(eq(patchVisibilityPolicies.patchId, quotaPatchIds[1]))
    await expect(claimPatch({
      operationId: randomUUID(), principalId: ownerPrincipalId, patchId: quotaPatchIds[1],
    })).resolves.toMatchObject({ claimed: false, reason: 'QUOTA_EXCEEDED' })
  })

  it('changes ownership only after the intended recipient accepts', async () => {
    const ownerId = 'a3000000-0000-4000-8000-000000000003'
    const recipientId = 'a3000000-0000-4000-8000-000000000004'
    const transferPatchId = 'a2000000-0000-4000-8000-000000000003'
    const transferQuiltId = 'a1000000-0000-4000-8000-000000000002'
    await database.db.insert(principals).values([{ id: ownerId, kind: 'human' }, { id: recipientId, kind: 'human' }])
    await database.db.insert(quilts).values({
      id: transferQuiltId, patchRows: 1, patchColumns: 1,
      patchWidth: 10, patchHeight: 10, topology: 'toroidal', protocolVersion: 2,
    })
    await database.db.insert(patches).values({
      id: transferPatchId, quiltId: transferQuiltId, row: 0, column: 0,
      ownerPrincipalId: ownerId, state: 'active',
    })
    await database.db.insert(patchMemberships).values({ patchId: transferPatchId, principalId: ownerId, role: 'owner' })

    const offer = await createOwnershipTransfer({
      operationId: randomUUID(), patchId: transferPatchId,
      senderPrincipalId: ownerId, recipientPrincipalId: recipientId,
    })
    expect(offer).toMatchObject({ succeeded: true, idempotent: false })
    expect((await database.db.select().from(patches).where(eq(patches.id, transferPatchId)))[0].ownerPrincipalId).toBe(ownerId)

    await expect(acceptOwnershipTransfer({
      operationId: randomUUID(), transferId: offer.transferId!, recipientPrincipalId: firstPrincipalId,
    })).resolves.toMatchObject({ succeeded: false, reason: 'TRANSFER_UNAVAILABLE' })
    await expect(acceptOwnershipTransfer({
      operationId: randomUUID(), transferId: offer.transferId!, recipientPrincipalId: recipientId,
    })).resolves.toMatchObject({ succeeded: true, revision: 1 })
    expect((await database.db.select().from(patches).where(eq(patches.id, transferPatchId)))[0].ownerPrincipalId).toBe(recipientId)
  })

  it('cancels and expires pending transfers without changing ownership', async () => {
    const ownerId = 'a3000000-0000-4000-8000-000000000005'
    const recipientId = 'a3000000-0000-4000-8000-000000000006'
    const lifecyclePatchId = 'a2000000-0000-4000-8000-000000000004'
    const lifecycleQuiltId = 'a1000000-0000-4000-8000-000000000003'
    await database.db.insert(principals).values([{ id: ownerId, kind: 'human' }, { id: recipientId, kind: 'human' }])
    await database.db.insert(quilts).values({
      id: lifecycleQuiltId, patchRows: 1, patchColumns: 1,
      patchWidth: 10, patchHeight: 10, topology: 'toroidal', protocolVersion: 2,
    })
    await database.db.insert(patches).values({
      id: lifecyclePatchId, quiltId: lifecycleQuiltId, row: 0, column: 0,
      ownerPrincipalId: ownerId, state: 'active',
    })
    await database.db.insert(patchMemberships).values({ patchId: lifecyclePatchId, principalId: ownerId, role: 'owner' })
    const cancelled = await createOwnershipTransfer({
      operationId: randomUUID(), patchId: lifecyclePatchId,
      senderPrincipalId: ownerId, recipientPrincipalId: recipientId,
    })
    await expect(cancelOwnershipTransfer({
      operationId: randomUUID(), transferId: cancelled.transferId!, actorPrincipalId: ownerId,
    })).resolves.toMatchObject({ succeeded: true })

    await createOwnershipTransfer({
      operationId: randomUUID(), patchId: lifecyclePatchId,
      senderPrincipalId: ownerId, recipientPrincipalId: recipientId,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    })
    await expect(expireOwnershipTransfers(new Date('2026-07-09T00:00:00Z'))).resolves.toBe(1)
    const rows = await database.db.select().from(pendingOwnershipTransfers)
      .where(eq(pendingOwnershipTransfers.patchId, lifecyclePatchId))
    expect(rows.map((row) => row.status).sort()).toEqual(['cancelled', 'expired'])
    expect((await database.db.select().from(patches).where(eq(patches.id, lifecyclePatchId)))[0].ownerPrincipalId).toBe(ownerId)
  })

  it('abandons ownership atomically when no transfer is pending', async () => {
    const ownerId = 'a3000000-0000-4000-8000-000000000007'
    const abandonPatchId = 'a2000000-0000-4000-8000-000000000005'
    const abandonQuiltId = 'a1000000-0000-4000-8000-000000000004'
    await database.db.insert(principals).values({ id: ownerId, kind: 'human' })
    await database.db.insert(quilts).values({
      id: abandonQuiltId, patchRows: 1, patchColumns: 1,
      patchWidth: 10, patchHeight: 10, topology: 'toroidal', protocolVersion: 2,
    })
    await database.db.insert(patches).values({
      id: abandonPatchId, quiltId: abandonQuiltId, row: 0, column: 0,
      ownerPrincipalId: ownerId, state: 'active',
    })
    await database.db.insert(patchMemberships).values({ patchId: abandonPatchId, principalId: ownerId, role: 'owner' })

    await expect(abandonPatch({ operationId: randomUUID(), patchId: abandonPatchId, principalId: ownerId }))
      .resolves.toMatchObject({ succeeded: true, revision: 1 })
    const [abandoned] = await database.db.select().from(patches).where(eq(patches.id, abandonPatchId))
    expect(abandoned).toMatchObject({ ownerPrincipalId: null, state: 'unclaimed', revision: 1 })
    expect(await database.db.select().from(patchMemberships).where(eq(patchMemberships.patchId, abandonPatchId))).toEqual([])
  })

  it('binds ownership and deletion operation replay to the actor and canonical payload', async () => {
    const ownerId = 'a3000000-0000-4000-8000-000000000010'
    const recipientId = 'a3000000-0000-4000-8000-000000000011'
    const otherId = 'a3000000-0000-4000-8000-000000000012'
    const deletionId = 'a3000000-0000-4000-8000-000000000013'
    const lifecycleQuiltId = 'a1000000-0000-4000-8000-000000000006'
    const claimPatchId = 'a2000000-0000-4000-8000-000000000006'
    const transferPatchId = 'a2000000-0000-4000-8000-000000000007'
    const abandonPatchId = 'a2000000-0000-4000-8000-000000000008'
    await database.db.insert(principals).values([
      { id: ownerId, kind: 'human' },
      { id: recipientId, kind: 'human' },
      { id: otherId, kind: 'human' },
      { id: deletionId, kind: 'human' },
    ])
    await database.db.insert(quilts).values({
      id: lifecycleQuiltId, patchRows: 1, patchColumns: 3,
      patchWidth: 10, patchHeight: 10, topology: 'toroidal', protocolVersion: 2,
    })
    await database.db.insert(patches).values([
      { id: claimPatchId, quiltId: lifecycleQuiltId, row: 0, column: 0 },
      { id: transferPatchId, quiltId: lifecycleQuiltId, row: 0, column: 1, ownerPrincipalId: ownerId, state: 'active' },
      { id: abandonPatchId, quiltId: lifecycleQuiltId, row: 0, column: 2, ownerPrincipalId: ownerId, state: 'active' },
    ])
    await database.db.insert(patchVisibilityPolicies).values({ patchId: claimPatchId, claimEnabled: true })
    await database.db.insert(patchMemberships).values([
      { patchId: transferPatchId, principalId: ownerId, role: 'owner' },
      { patchId: abandonPatchId, principalId: ownerId, role: 'owner' },
    ])

    const claimOperationId = randomUUID()
    await expect(claimPatch({ operationId: claimOperationId, principalId: otherId, patchId: claimPatchId }))
      .resolves.toMatchObject({ claimed: true })
    await expect(claimPatch({ operationId: claimOperationId, principalId: recipientId, patchId: claimPatchId }))
      .resolves.toMatchObject({ claimed: false, reason: 'PATCH_UNAVAILABLE' })

    const createOperationId = randomUUID()
    const offer = await createOwnershipTransfer({
      operationId: createOperationId,
      patchId: transferPatchId,
      senderPrincipalId: ownerId,
      recipientPrincipalId: recipientId,
    })
    await expect(createOwnershipTransfer({
      operationId: createOperationId,
      patchId: transferPatchId,
      senderPrincipalId: ownerId,
      recipientPrincipalId: otherId,
    })).resolves.toMatchObject({ succeeded: false, reason: 'TRANSFER_UNAVAILABLE' })

    const acceptOperationId = randomUUID()
    await expect(acceptOwnershipTransfer({
      operationId: acceptOperationId,
      transferId: offer.transferId!,
      recipientPrincipalId: recipientId,
    })).resolves.toMatchObject({ succeeded: true })
    await expect(acceptOwnershipTransfer({
      operationId: acceptOperationId,
      transferId: offer.transferId!,
      recipientPrincipalId: otherId,
    })).resolves.toMatchObject({ succeeded: false, reason: 'TRANSFER_UNAVAILABLE' })

    const cancellable = await createOwnershipTransfer({
      operationId: randomUUID(),
      patchId: transferPatchId,
      senderPrincipalId: recipientId,
      recipientPrincipalId: ownerId,
    })
    const cancelOperationId = randomUUID()
    await expect(cancelOwnershipTransfer({
      operationId: cancelOperationId,
      transferId: cancellable.transferId!,
      actorPrincipalId: recipientId,
    })).resolves.toMatchObject({ succeeded: true })
    await expect(cancelOwnershipTransfer({
      operationId: cancelOperationId,
      transferId: cancellable.transferId!,
      actorPrincipalId: ownerId,
    })).resolves.toMatchObject({ succeeded: false, reason: 'TRANSFER_UNAVAILABLE' })

    const abandonOperationId = randomUUID()
    await expect(abandonPatch({ operationId: abandonOperationId, patchId: abandonPatchId, principalId: ownerId }))
      .resolves.toMatchObject({ succeeded: true })
    await expect(abandonPatch({ operationId: abandonOperationId, patchId: abandonPatchId, principalId: otherId }))
      .resolves.toMatchObject({ succeeded: false, reason: 'NOT_OWNER' })

    const deletionOperationId = randomUUID()
    await expect(requestPrincipalDeletion({ operationId: deletionOperationId, principalId: deletionId }))
      .resolves.toMatchObject({ succeeded: true })
    await expect(requestPrincipalDeletion({ operationId: deletionOperationId, principalId: ownerId }))
      .resolves.toMatchObject({ succeeded: false, reason: 'PRINCIPAL_UNAVAILABLE' })

    const recoveryOperationId = randomUUID()
    await expect(recoverPrincipalDeletion({
      operationId: recoveryOperationId,
      principalId: deletionId,
      actorPrincipalId: deletionId,
    })).resolves.toMatchObject({ succeeded: true })
    await expect(recoverPrincipalDeletion({
      operationId: recoveryOperationId,
      principalId: deletionId,
      actorPrincipalId: ownerId,
    })).resolves.toMatchObject({ succeeded: false, reason: 'PRINCIPAL_UNAVAILABLE' })

    const completedAt = new Date('2026-09-01T00:00:00Z')
    await database.db.update(principals).set({
      status: 'deletion_pending',
      deletionRequestedAt: new Date('2026-07-01T00:00:00Z'),
      deletionRecoveryDeadline: new Date('2026-08-01T00:00:00Z'),
    }).where(eq(principals.id, deletionId))
    const completionOperationId = randomUUID()
    await expect(completePrincipalDeletion({
      operationId: completionOperationId,
      principalId: deletionId,
      retentionApproved: true,
      completedAt,
    })).resolves.toMatchObject({ succeeded: true })
    await expect(completePrincipalDeletion({
      operationId: completionOperationId,
      principalId: deletionId,
      retentionApproved: false,
      completedAt,
    })).resolves.toMatchObject({ succeeded: false, reason: 'PRINCIPAL_UNAVAILABLE' })
  })
})