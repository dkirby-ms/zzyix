import crypto from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { getDatabaseBundle, type DatabaseClient } from '../db/client.js'
import { canonicalAttempts } from '../db/schema.js'

export type CanonicalAttemptKind = 'entry' | 'reconnect' | 'resubscribe'

export type CanonicalAttemptStore = {
  issue: (
    principalId: string,
    kind: CanonicalAttemptKind,
    parentAttemptId?: string,
    now?: number,
  ) => Promise<string | null>
  owns: (
    attemptId: string,
    principalId: string,
    kind: CanonicalAttemptKind,
    now?: number,
  ) => Promise<boolean>
  consume: (
    attemptId: string,
    principalId: string,
    kind: CanonicalAttemptKind,
    now?: number,
  ) => Promise<boolean>
}

const ATTEMPT_TTL_MS = 10 * 60 * 1_000

export const createCanonicalAttemptStore = (db: DatabaseClient): CanonicalAttemptStore => ({
  issue: async (principalId, kind, parentAttemptId, now = Date.now()) => {
    const attemptId = crypto.randomUUID()
    const expiresAt = new Date(now + ATTEMPT_TTL_MS)

    if (kind === 'entry') {
      await db.insert(canonicalAttempts).values({ id: attemptId, principalId, kind, expiresAt })
      return attemptId
    }
    if (!parentAttemptId) return null

    return db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ id: canonicalAttempts.id })
        .from(canonicalAttempts)
        .where(and(
          eq(canonicalAttempts.id, parentAttemptId),
          eq(canonicalAttempts.principalId, principalId),
          eq(canonicalAttempts.kind, 'entry'),
          gt(canonicalAttempts.expiresAt, new Date(now)),
        ))
        .limit(1)
      if (!parent) return null

      await tx.insert(canonicalAttempts).values({
        id: attemptId,
        principalId,
        kind,
        parentAttemptId,
        expiresAt,
      })
      return attemptId
    })
  },
  owns: async (attemptId, principalId, kind, now = Date.now()) => {
    const [attempt] = await db
      .select({ id: canonicalAttempts.id })
      .from(canonicalAttempts)
      .where(and(
        eq(canonicalAttempts.id, attemptId),
        eq(canonicalAttempts.principalId, principalId),
        eq(canonicalAttempts.kind, kind),
        gt(canonicalAttempts.expiresAt, new Date(now)),
      ))
      .limit(1)
    return attempt !== undefined
  },
  consume: async (attemptId, principalId, kind, now = Date.now()) => {
    const consumed = await db
      .update(canonicalAttempts)
      .set({ consumed: true })
      .where(and(
        eq(canonicalAttempts.id, attemptId),
        eq(canonicalAttempts.principalId, principalId),
        eq(canonicalAttempts.kind, kind),
        eq(canonicalAttempts.consumed, false),
        gt(canonicalAttempts.expiresAt, new Date(now)),
      ))
      .returning({ id: canonicalAttempts.id })
    return consumed.length === 1
  },
})

const getCanonicalAttemptStore = (): CanonicalAttemptStore =>
  createCanonicalAttemptStore(getDatabaseBundle().db)

export const issueCanonicalAttempt: CanonicalAttemptStore['issue'] = (...params) =>
  getCanonicalAttemptStore().issue(...params)

export const ownsCanonicalAttempt: CanonicalAttemptStore['owns'] = (...params) =>
  getCanonicalAttemptStore().owns(...params)

export const consumeCanonicalAttempt: CanonicalAttemptStore['consume'] = (...params) =>
  getCanonicalAttemptStore().consume(...params)