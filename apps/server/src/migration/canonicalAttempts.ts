import crypto from 'node:crypto'
import { and, asc, eq, gt } from 'drizzle-orm'
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
  rotateLineage: (
    principalId: string,
    entryAttemptId: string,
    priorLineageId?: string,
    now?: number,
  ) => Promise<string | null>
  observeCycle: (
    principalId: string,
    lineageId: string,
    kind: Exclude<CanonicalAttemptKind, 'entry'>,
    now?: number,
  ) => Promise<string | null>
  consumeObservedCycle: (
    principalId: string,
    lineageId: string,
    kind: Exclude<CanonicalAttemptKind, 'entry'>,
    now?: number,
  ) => Promise<string | null>
}

const ATTEMPT_TTL_MS = 10 * 60 * 1_000
const LINEAGE_TTL_MS = 24 * 60 * 60 * 1_000

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
  rotateLineage: async (principalId, entryAttemptId, priorLineageId, now = Date.now()) => {
    const lineageId = crypto.randomUUID()
    return db.transaction(async (tx) => {
      if (priorLineageId) {
        const rotated = await tx
          .update(canonicalAttempts)
          .set({ expiresAt: new Date(now) })
          .where(and(
            eq(canonicalAttempts.id, priorLineageId),
            eq(canonicalAttempts.principalId, principalId),
            eq(canonicalAttempts.kind, 'reconnect'),
            eq(canonicalAttempts.parentAttemptId, entryAttemptId),
            eq(canonicalAttempts.consumed, true),
            gt(canonicalAttempts.expiresAt, new Date(now)),
          ))
          .returning({ id: canonicalAttempts.id })
        if (rotated.length !== 1) return null
      } else {
        const [entry] = await tx
          .select({ id: canonicalAttempts.id })
          .from(canonicalAttempts)
          .where(and(
            eq(canonicalAttempts.id, entryAttemptId),
            eq(canonicalAttempts.principalId, principalId),
            eq(canonicalAttempts.kind, 'entry'),
            gt(canonicalAttempts.expiresAt, new Date(now)),
          ))
          .limit(1)
        if (!entry) return null
      }

      await tx.insert(canonicalAttempts).values({
        id: lineageId,
        principalId,
        kind: 'reconnect',
        parentAttemptId: entryAttemptId,
        expiresAt: new Date(now + LINEAGE_TTL_MS),
        consumed: true,
      })
      return lineageId
    })
  },
  observeCycle: async (principalId, lineageId, kind, now = Date.now()) => {
    const attemptId = crypto.randomUUID()
    return db.transaction(async (tx) => {
      const [lineage] = await tx
        .select({ id: canonicalAttempts.id })
        .from(canonicalAttempts)
        .where(and(
          eq(canonicalAttempts.id, lineageId),
          eq(canonicalAttempts.principalId, principalId),
          eq(canonicalAttempts.kind, 'reconnect'),
          eq(canonicalAttempts.consumed, true),
          gt(canonicalAttempts.expiresAt, new Date(now)),
        ))
        .limit(1)
      if (!lineage) return null

      await tx.insert(canonicalAttempts).values({
        id: attemptId,
        principalId,
        kind,
        parentAttemptId: lineageId,
        expiresAt: new Date(now + ATTEMPT_TTL_MS),
      })
      return attemptId
    })
  },
  consumeObservedCycle: async (principalId, lineageId, kind, now = Date.now()) => db.transaction(async (tx) => {
    const [observed] = await tx
      .select({ id: canonicalAttempts.id })
      .from(canonicalAttempts)
      .where(and(
        eq(canonicalAttempts.principalId, principalId),
        eq(canonicalAttempts.kind, kind),
        eq(canonicalAttempts.parentAttemptId, lineageId),
        eq(canonicalAttempts.consumed, false),
        gt(canonicalAttempts.expiresAt, new Date(now)),
      ))
      .orderBy(asc(canonicalAttempts.createdAt), asc(canonicalAttempts.id))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!observed) return null

    const consumed = await tx
      .update(canonicalAttempts)
      .set({ consumed: true })
      .where(and(
        eq(canonicalAttempts.id, observed.id),
        eq(canonicalAttempts.consumed, false),
      ))
      .returning({ id: canonicalAttempts.id })
    return consumed[0]?.id ?? null
  }),
})

const getCanonicalAttemptStore = (): CanonicalAttemptStore =>
  createCanonicalAttemptStore(getDatabaseBundle().db)

export const issueCanonicalAttempt: CanonicalAttemptStore['issue'] = (...params) =>
  getCanonicalAttemptStore().issue(...params)

export const ownsCanonicalAttempt: CanonicalAttemptStore['owns'] = (...params) =>
  getCanonicalAttemptStore().owns(...params)

export const consumeCanonicalAttempt: CanonicalAttemptStore['consume'] = (...params) =>
  getCanonicalAttemptStore().consume(...params)

export const rotateCanonicalLineage: CanonicalAttemptStore['rotateLineage'] = (...params) =>
  getCanonicalAttemptStore().rotateLineage(...params)

export const observeCanonicalCycle: CanonicalAttemptStore['observeCycle'] = (...params) =>
  getCanonicalAttemptStore().observeCycle(...params)

export const consumeObservedCanonicalCycle: CanonicalAttemptStore['consumeObservedCycle'] = (...params) =>
  getCanonicalAttemptStore().consumeObservedCycle(...params)