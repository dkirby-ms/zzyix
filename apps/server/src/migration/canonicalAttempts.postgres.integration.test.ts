import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabaseBundle } from '../db/client.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import { createCanonicalAttemptStore, type CanonicalAttemptStore } from './canonicalAttempts.js'

const PRINCIPAL_A = '41000000-0000-4000-8000-000000000001'
const PRINCIPAL_B = '41000000-0000-4000-8000-000000000002'

describe('canonical attempt shared persistence', () => {
  let database: PostgresTestDatabase
  let firstBundle: ReturnType<typeof createDatabaseBundle>
  let secondBundle: ReturnType<typeof createDatabaseBundle>
  let firstStore: CanonicalAttemptStore
  let secondStore: CanonicalAttemptStore

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_canonical_attempts')
    firstBundle = createDatabaseBundle({ connectionString: database.connectionString, max: 2 })
    secondBundle = createDatabaseBundle({ connectionString: database.connectionString, max: 2 })
    firstStore = createCanonicalAttemptStore(firstBundle.db)
    secondStore = createCanonicalAttemptStore(secondBundle.db)
  }, 30_000)

  beforeEach(async () => {
    await database.db.execute(sql`truncate table canonical_attempts, principals cascade`)
    await database.db.execute(sql`
      insert into principals (id, kind) values (${PRINCIPAL_A}, 'human'), (${PRINCIPAL_B}, 'human')
    `)
  })

  afterAll(async () => {
    await Promise.all([firstBundle?.pool.end(), secondBundle?.pool.end()])
    await database?.dispose()
  }, 30_000)

  it('issues on one bundle and authorizes and consumes on another', async () => {
    const attemptId = await firstStore.issue(PRINCIPAL_A, 'entry')

    await expect(secondStore.owns(attemptId!, PRINCIPAL_A, 'entry')).resolves.toBe(true)
    await expect(secondStore.consume(attemptId!, PRINCIPAL_A, 'entry')).resolves.toBe(true)
  })

  it('allows exactly one concurrent consumer across independent bundles', async () => {
    const attemptId = await firstStore.issue(PRINCIPAL_A, 'entry')

    const outcomes = await Promise.all([
      firstStore.consume(attemptId!, PRINCIPAL_A, 'entry'),
      secondStore.consume(attemptId!, PRINCIPAL_A, 'entry'),
    ])

    expect(outcomes.sort()).toEqual([false, true])
  })

  it('rejects foreign principals, fabricated identities, and expired attempts', async () => {
    const issuedAt = Date.parse('2026-07-30T00:00:00Z')
    const attemptId = await firstStore.issue(PRINCIPAL_A, 'entry', undefined, issuedAt)

    await expect(secondStore.owns(attemptId!, PRINCIPAL_B, 'entry', issuedAt)).resolves.toBe(false)
    await expect(secondStore.consume(attemptId!, PRINCIPAL_B, 'entry', issuedAt)).resolves.toBe(false)
    await expect(secondStore.consume('41000000-0000-4000-8000-000000000099', PRINCIPAL_A, 'entry', issuedAt))
      .resolves.toBe(false)
    await expect(secondStore.owns(attemptId!, PRINCIPAL_A, 'entry', issuedAt + 10 * 60 * 1_000)).resolves.toBe(false)
    await expect(secondStore.consume(attemptId!, PRINCIPAL_A, 'entry', issuedAt + 10 * 60 * 1_000)).resolves.toBe(false)
  })

  it('rotates durable lineage and consumes only server-observed child cycles', async () => {
    const issuedAt = Date.parse('2026-07-30T00:00:00Z')
    const entryAttemptId = await firstStore.issue(PRINCIPAL_A, 'entry', undefined, issuedAt)
    const firstLineageId = await secondStore.rotateLineage(PRINCIPAL_A, entryAttemptId!, undefined, issuedAt + 1)
    const reconnectAttemptId = await firstStore.observeCycle(
      PRINCIPAL_A,
      firstLineageId!,
      'reconnect',
      issuedAt + 2,
    )

    expect(reconnectAttemptId).toEqual(expect.any(String))
    await expect(secondStore.consumeObservedCycle(
      PRINCIPAL_A,
      firstLineageId!,
      'reconnect',
      issuedAt + 3,
    )).resolves.toBe(reconnectAttemptId)
    await expect(firstStore.consumeObservedCycle(
      PRINCIPAL_A,
      firstLineageId!,
      'reconnect',
      issuedAt + 3,
    )).resolves.toBeNull()
    await expect(firstStore.consumeObservedCycle(
      PRINCIPAL_B,
      firstLineageId!,
      'reconnect',
      issuedAt + 3,
    )).resolves.toBeNull()
    await expect(firstStore.consumeObservedCycle(
      PRINCIPAL_A,
      '41000000-0000-4000-8000-000000000099',
      'reconnect',
      issuedAt + 3,
    )).resolves.toBeNull()

    const afterEntryExpiry = issuedAt + 10 * 60 * 1_000 + 1
    const secondLineageId = await firstStore.rotateLineage(
      PRINCIPAL_A,
      entryAttemptId!,
      firstLineageId!,
      afterEntryExpiry,
    )
    expect(secondLineageId).toEqual(expect.any(String))
    await expect(secondStore.rotateLineage(
      PRINCIPAL_A,
      entryAttemptId!,
      firstLineageId!,
      afterEntryExpiry,
    )).resolves.toBeNull()

    const resubscribeAttemptId = await secondStore.observeCycle(
      PRINCIPAL_A,
      secondLineageId!,
      'resubscribe',
      afterEntryExpiry + 1,
    )
    await expect(firstStore.consumeObservedCycle(
      PRINCIPAL_A,
      secondLineageId!,
      'resubscribe',
      afterEntryExpiry + 2,
    )).resolves.toBe(resubscribeAttemptId)
  })
})