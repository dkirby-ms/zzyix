import { randomUUID } from 'node:crypto'
import { and, asc, countDistinct, desc, eq, gt, inArray, isNull, lte, max, or, sql } from 'drizzle-orm'
import { DEFAULT_BOUNDED_WORLD_BOUNDS } from '../contracts.js'
import type {
  BoundsPolicy,
  CanonicalPatchNavigation,
  CanonicalWorldDescriptor,
  ClientPresence,
  EligibleCanonicalPatchesResponse,
  QuiltOccupancyResponse,
  TileInstance,
} from '../contracts.js'
import type { LegacySession as Session, LegacySessionCanvasConfig as SessionCanvasConfig } from '../domain/legacySession.js'
import type { PlaceTilePayload, RemoveTilePayload, TilePlacedPayload, TileRemovedPayload } from '../contracts.js'
import { RUNTIME_CHUNK_WORLD_SIZE } from '../contracts.js'
import {
  canvases,
  authorizationAuditEvents,
  agentAssignments,
  canonicalWorld,
  externalPrincipalMappings,
  idempotencyKeys,
  operationLog,
  participants,
  patchMemberships,
  patchClaimQuotaRecords,
  pendingOwnershipTransfers,
  patchOperations,
  patches,
  patchSnapshots,
  patchVisibilityPolicies,
  principals,
  quiltPresenceLeases,
  quilts,
  snapshots,
  tileSpatialRefs,
  tiles,
} from './schema.js'
import { getDatabaseBundle, type DatabaseClient } from './client.js'
import {
  derivePlacementBounds,
  MAX_GROUT_GAP,
  projectPeriodicNeighbors,
  validatePlacement,
} from '../domain/placementSolver.js'
import {
  decomposeWrappedViewport,
  resolveCanonicalPoint,
  type QuiltTopology,
  type TopologyRect,
} from '../domain/quiltTopology.js'
import { compareLegacyAndPatchTiles, type QuiltParityReport } from './quiltParity.js'
import { emitQuiltTelemetry } from '../migration/quiltTelemetry.js'
import {
  canAccessPatchSurface,
  isPersistedVisibilityPolicy,
  type PersistedVisibilityPolicy,
  type VisibilitySurface,
} from '../domain/authorizationPolicy.js'

export type AuthoritativeSessionRecord = {
  session: Session
  canvasConfig: SessionCanvasConfig
  clients: ClientPresence[]
  lastOpSeq: number
  revision: number
}

export type CreatedProtectedSession = AuthoritativeSessionRecord & {
  claimTarget: {
    patchId: string
    ownershipState: 'unclaimed'
    claimEligibility: 'eligible'
  }
}

export class ResourceNotFoundError extends Error {
  constructor() {
    super('Resource not found.')
    this.name = 'ResourceNotFoundError'
  }
}

export class CanonicalWorldGenerationConflictError extends Error {
  constructor() {
    super('Canonical world generation conflict.')
    this.name = 'CanonicalWorldGenerationConflictError'
  }
}

export class CanonicalWorldTargetInvalidError extends Error {
  constructor() {
    super('Canonical world target is invalid.')
    this.name = 'CanonicalWorldTargetInvalidError'
  }
}

export type PersistedMutationResult =
  | PersistedPlacementResult
  | PersistedRemovalResult

export type PersistedPlacementResult =
  | {
      opSeq: number
      revision: number
      session: Session
      ack:
        | { placed: TileInstance; rejected: false; opSeq: number; idempotent?: boolean }
        | {
            placed: null
            rejected: true
            reason:
              | 'OUT_OF_BOUNDS'
              | 'OVERLAP'
              | 'GAP_TOO_LARGE'
              | 'PLACEMENT_REJECTED'
              | 'REQUEST_HASH_MISMATCH'
              | 'STALE_REVISION'
              | 'OUT_OF_ORDER_REVISION'
          }
      event: TilePlacedPayload
    }
  | {
      revision: number
      session: Session
      ack:
        | {
            placed: null
            rejected: true
            reason:
              | 'OUT_OF_BOUNDS'
              | 'OVERLAP'
              | 'GAP_TOO_LARGE'
              | 'PLACEMENT_REJECTED'
              | 'REQUEST_HASH_MISMATCH'
              | 'STALE_REVISION'
              | 'OUT_OF_ORDER_REVISION'
          }
      event?: undefined
    }

export type PersistedRemovalResult =
  | {
      opSeq: number
      revision: number
      session: Session
      ack: { removed: true; opSeq: number; idempotent?: boolean }
      event: TileRemovedPayload
    }
  | {
      revision: number
      session: Session
      ack:
        | {
            removed: false
            reason?:
              | 'TILE_NOT_FOUND'
              | 'DUPLICATE_OPERATION'
              | 'REQUEST_HASH_MISMATCH'
              | 'STALE_REVISION'
              | 'OUT_OF_ORDER_REVISION'
          }
      event?: undefined
    }

export type PersistedOperationRecord = {
  opSeq: number
  opType: 'tile_placed' | 'tile_removed'
  payload: unknown
  clientId: string
  createdAt: number
}

const hasCurrentLegacyMutationAuthority = async (
  tx: DatabaseClient,
  sessionId: string,
  principalId: string,
): Promise<boolean> => {
  const [principal] = await tx
    .select({ status: principals.status })
    .from(principals)
    .where(eq(principals.id, principalId))
    .for('update')
    .limit(1)
  if (principal?.status !== 'active') return false

  const currentPatches = await tx
    .select({ ownerPrincipalId: patches.ownerPrincipalId, state: patches.state })
    .from(patches)
    .innerJoin(quilts, eq(quilts.id, patches.quiltId))
    .where(eq(quilts.legacyCanvasId, sessionId))
    .orderBy(asc(patches.id))
    .for('update')

  return currentPatches.length > 0
    && currentPatches.every((patch) => patch.state === 'active' && patch.ownerPrincipalId === principalId)
}

export type ReplaySessionRecord = AuthoritativeSessionRecord & {
  snapshotOpSeq: number
  replayedOperations: PersistedOperationRecord[]
}

export type SessionSummaryRecord = {
  id: string
  participantCount: number
  canvasConfig?: SessionCanvasConfig
}

export const loadPrincipalProfile = async (principalId: string): Promise<{
  displayName?: string
  email?: string
}> => {
  const { db } = getDatabaseBundle()
  const [principal] = await db
    .select({ displayName: principals.displayName, email: principals.email })
    .from(principals)
    .where(and(eq(principals.id, principalId), eq(principals.status, 'active')))
    .limit(1)
  if (!principal) throw new ResourceNotFoundError()
  return {
    ...(principal.displayName ? { displayName: principal.displayName } : {}),
    ...(principal.email ? { email: principal.email } : {}),
  }
}

export type ChunkCoordinate = {
  x: number
  y: number
}

export type ChunkTileReadResult = {
  tiles: TileInstance[]
  opSeq: number
  revision: number
  parityMatched: boolean
  parityReport: QuiltParityReport
}

export type PatchAddress = { row: number; column: number }

export type QuiltPlacementResult =
  | {
      committed: true
      idempotent: boolean
      operationId: string
      eventIds: Record<string, string>
      patchChunkIds: Record<string, string[]>
      tile: TileInstance
      patchRevisions: Record<string, number>
    }
  | {
      committed: false
      reason: 'UNAUTHORIZED' | 'STALE_REVISION' | 'OUT_OF_ORDER_REVISION' | 'PLACEMENT_REJECTED'
    }

export type QuiltRemovalResult =
  | {
      committed: true
      idempotent: boolean
      operationId: string
      eventIds: Record<string, string>
      patchChunkIds: Record<string, string[]>
      tileId: string
      patchRevisions: Record<string, number>
    }
  | {
      committed: false
      reason: 'UNAUTHORIZED' | 'STALE_REVISION' | 'OUT_OF_ORDER_REVISION' | 'RESOURCE_UNAVAILABLE'
    }

export type PatchClaimResult = {
  claimed: boolean
  idempotent: boolean
  reason?: 'PRINCIPAL_INELIGIBLE' | 'PATCH_UNAVAILABLE' | 'CLAIMS_DISABLED' | 'QUOTA_EXCEEDED'
  revision?: number
}

const toMillis = (value: Date): number => value.getTime()

const CLAIM_ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const CLAIM_SUCCESS_WINDOW_MS = 24 * 60 * 60 * 1000
const CLAIM_ATTEMPT_LIMIT = 3
const OPERATION_REPLAY_CLIENT_ID = 'authenticated-operation'
const OPERATION_REPLAY_EXPIRES_AT = new Date('9999-12-31T23:59:59.999Z')

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }

  return JSON.stringify(value)
}

const makeBoundOperation = (
  operationId: string,
  command: string,
  actorPrincipalId: string,
  payload: unknown,
): { key: string; requestHash: string } => ({
  key: `authenticated-operation:${operationId}`,
  requestHash: stableJson({ actorPrincipalId, command, payload }),
})

const loadBoundOperation = async <Result>(
  tx: DatabaseClient,
  binding: { key: string; requestHash: string },
): Promise<{ matched: true; response: Result } | { matched: false; exists: boolean }> => {
  const [stored] = await tx
    .select({ requestHash: idempotencyKeys.requestHash, response: idempotencyKeys.response })
    .from(idempotencyKeys)
    .where(and(
      eq(idempotencyKeys.key, binding.key),
      eq(idempotencyKeys.clientId, OPERATION_REPLAY_CLIENT_ID),
    ))
    .limit(1)

  if (!stored) return { matched: false, exists: false }
  if (stored.requestHash !== binding.requestHash) return { matched: false, exists: true }
  return { matched: true, response: stored.response as Result }
}

const storeBoundOperation = async (
  tx: DatabaseClient,
  binding: { key: string; requestHash: string },
  response: unknown,
  createdAt: Date,
): Promise<void> => {
  await tx.insert(idempotencyKeys).values({
    key: binding.key,
    clientId: OPERATION_REPLAY_CLIENT_ID,
    requestHash: binding.requestHash,
    statusCode: 200,
    response,
    createdAt,
    expiresAt: OPERATION_REPLAY_EXPIRES_AT,
  }).onConflictDoNothing()
}

export const claimPatch = async (params: {
  operationId: string
  principalId: string
  patchId: string
  requestId?: string
  attemptedAt?: Date
}): Promise<PatchClaimResult> => {
  const { db } = getDatabaseBundle()

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const binding = makeBoundOperation(params.operationId, 'claim_patch', params.principalId, {
      patchId: params.patchId,
    })
    const replay = await loadBoundOperation<PatchClaimResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { claimed: false, idempotent: false, reason: 'PATCH_UNAVAILABLE' }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.principalId}))`)
    const [patch] = await tx
      .select({
        id: patches.id,
        quiltId: patches.quiltId,
        state: patches.state,
        ownerPrincipalId: patches.ownerPrincipalId,
        revision: patches.revision,
      })
      .from(patches)
      .where(eq(patches.id, params.patchId))
      .for('update')
      .limit(1)
    const [claimPolicy] = patch
      ? await tx
          .select({
            claimEnabled: patchVisibilityPolicies.claimEnabled,
            policyVersion: patchVisibilityPolicies.policyVersion,
          })
          .from(patchVisibilityPolicies)
          .where(eq(patchVisibilityPolicies.patchId, patch.id))
          .limit(1)
      : []

    const attemptedAt = params.attemptedAt ?? new Date()
    let reason: PatchClaimResult['reason']
    const [principal] = await tx
      .select({ kind: principals.kind, status: principals.status })
      .from(principals)
      .where(eq(principals.id, params.principalId))
      .for('update')
      .limit(1)

    if (!principal || principal.kind !== 'human' || principal.status !== 'active') {
      reason = 'PRINCIPAL_INELIGIBLE'
    } else if (!patch || patch.state !== 'unclaimed' || patch.ownerPrincipalId !== null) {
      reason = 'PATCH_UNAVAILABLE'
    } else if (claimPolicy?.claimEnabled !== true) {
      reason = 'CLAIMS_DISABLED'
    } else {
      const [quota] = await tx
        .select({
          recentAttempts: sql<number>`count(*) filter (where ${patchClaimQuotaRecords.attemptedAt} >= ${new Date(attemptedAt.getTime() - CLAIM_ATTEMPT_WINDOW_MS)})`,
          recentSuccesses: sql<number>`count(*) filter (where ${patchClaimQuotaRecords.outcome} = 'claimed' and ${patchClaimQuotaRecords.attemptedAt} >= ${new Date(attemptedAt.getTime() - CLAIM_SUCCESS_WINDOW_MS)})`,
        })
        .from(patchClaimQuotaRecords)
        .where(eq(patchClaimQuotaRecords.principalId, params.principalId))
      const [activeOwnership] = await tx
        .select({ id: patches.id })
        .from(patches)
        .where(and(
          eq(patches.quiltId, patch.quiltId),
          eq(patches.ownerPrincipalId, params.principalId),
          eq(patches.state, 'active'),
        ))
        .limit(1)
      if (Number(quota?.recentAttempts ?? 0) >= CLAIM_ATTEMPT_LIMIT
        || Number(quota?.recentSuccesses ?? 0) >= 1
        || activeOwnership) {
        reason = 'QUOTA_EXCEEDED'
      }
    }

    const outcome = reason ? (reason === 'PATCH_UNAVAILABLE' ? 'conflict' : 'denied') : 'claimed'
    if (patch) {
      await tx.insert(patchClaimQuotaRecords).values({
        operationId: params.operationId,
        principalId: params.principalId,
        quiltId: patch.quiltId,
        patchId: params.patchId,
        outcome,
        reasonCode: reason ?? null,
        attemptedAt,
      })
    }

    let revision: number | undefined
    if (!reason && patch) {
      revision = patch.revision + 1
      await tx
        .update(patches)
        .set({
          ownerPrincipalId: params.principalId,
          state: 'active',
          revision,
          updatedAt: attemptedAt,
        })
        .where(eq(patches.id, patch.id))
      await tx.insert(patchMemberships).values({
        patchId: patch.id,
        principalId: params.principalId,
        role: 'owner',
        createdAt: attemptedAt,
      })
    }

    await tx.insert(authorizationAuditEvents).values({
      eventType: 'patch_claim',
      attemptedAction: 'claim_patch',
      outcome: reason ? 'denied' : 'succeeded',
      reasonCode: reason ?? null,
      actorPrincipalId: params.principalId,
      subjectPrincipalId: params.principalId,
      quiltId: patch?.quiltId ?? null,
      patchId: patch?.id ?? null,
      requestId: params.requestId,
      operationId: params.operationId,
      sourceChannel: 'http',
      policyVersion: claimPolicy?.policyVersion ?? null,
      beforeState: patch ? { state: patch.state, revision: patch.revision } : null,
      afterState: reason ? null : { state: 'active', revision },
      createdAt: attemptedAt,
    })

    const result: PatchClaimResult = {
      claimed: !reason,
      idempotent: false,
      ...(reason ? { reason } : { revision }),
    }
    await storeBoundOperation(tx, binding, result, attemptedAt)
    return result
  })
}

export type OwnershipCommandResult = {
  succeeded: boolean
  idempotent: boolean
  reason?: 'PRINCIPAL_INELIGIBLE' | 'NOT_OWNER' | 'TRANSFER_PENDING' | 'TRANSFER_UNAVAILABLE'
  transferId?: string
  revision?: number
}

const insertOwnershipAudit = async (
  tx: DatabaseClient,
  params: {
    eventType: string
    attemptedAction: string
    succeeded: boolean
    reason?: string
    actorPrincipalId?: string
    subjectPrincipalId?: string
    quiltId?: string
    patchId?: string
    operationId: string
    sourceChannel?: 'http' | 'job' | 'operation'
    beforeState?: Record<string, unknown>
    afterState?: Record<string, unknown>
    createdAt: Date
  },
): Promise<void> => {
  await tx.insert(authorizationAuditEvents).values({
    eventType: params.eventType,
    attemptedAction: params.attemptedAction,
    outcome: params.succeeded ? 'succeeded' : 'denied',
    reasonCode: params.reason ?? null,
    actorPrincipalId: params.actorPrincipalId ?? null,
    subjectPrincipalId: params.subjectPrincipalId ?? null,
    quiltId: params.quiltId ?? null,
    patchId: params.patchId ?? null,
    operationId: params.operationId,
    sourceChannel: params.sourceChannel ?? 'http',
    beforeState: params.beforeState ?? null,
    afterState: params.afterState ?? null,
    createdAt: params.createdAt,
  })
}

export const createOwnershipTransfer = async (params: {
  operationId: string
  patchId: string
  senderPrincipalId: string
  recipientPrincipalId: string
  createdAt?: Date
}): Promise<OwnershipCommandResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const binding = makeBoundOperation(params.operationId, 'create_ownership_transfer', params.senderPrincipalId, {
      patchId: params.patchId,
      recipientPrincipalId: params.recipientPrincipalId,
    })
    const replay = await loadBoundOperation<OwnershipCommandResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'TRANSFER_UNAVAILABLE' }

    const [patch] = await tx.select().from(patches).where(eq(patches.id, params.patchId)).for('update').limit(1)
    const principalIds = [params.senderPrincipalId, params.recipientPrincipalId].sort()
    const principalRows = await tx
      .select({ id: principals.id, kind: principals.kind, status: principals.status })
      .from(principals)
      .where(inArray(principals.id, principalIds))
      .orderBy(asc(principals.id))
      .for('update')
    const recipient = principalRows.find((principal) => principal.id === params.recipientPrincipalId)
    const [pending] = patch
      ? await tx
          .select({ id: pendingOwnershipTransfers.id })
          .from(pendingOwnershipTransfers)
          .where(and(
            eq(pendingOwnershipTransfers.patchId, patch.id),
            eq(pendingOwnershipTransfers.status, 'pending'),
          ))
          .for('update')
          .limit(1)
      : []
    let reason: OwnershipCommandResult['reason']
    if (!recipient || recipient.kind !== 'human' || recipient.status !== 'active') reason = 'PRINCIPAL_INELIGIBLE'
    else if (!patch || patch.state !== 'active' || patch.ownerPrincipalId !== params.senderPrincipalId) reason = 'NOT_OWNER'
    else if (pending) reason = 'TRANSFER_PENDING'

    const createdAt = params.createdAt ?? new Date()
    let transferId: string | undefined
    if (!reason && patch) {
      transferId = randomUUID()
      await tx.insert(pendingOwnershipTransfers).values({
        id: transferId,
        operationId: params.operationId,
        patchId: patch.id,
        senderPrincipalId: params.senderPrincipalId,
        recipientPrincipalId: params.recipientPrincipalId,
        expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt,
        updatedAt: createdAt,
      })
    }
    await insertOwnershipAudit(tx, {
      eventType: 'ownership_transfer_created', attemptedAction: 'create_ownership_transfer',
      succeeded: !reason, reason, actorPrincipalId: params.senderPrincipalId,
      subjectPrincipalId: params.recipientPrincipalId, quiltId: patch?.quiltId,
      patchId: patch?.id, operationId: params.operationId,
      beforeState: patch ? { ownerPrincipalId: patch.ownerPrincipalId, revision: patch.revision } : undefined,
      afterState: transferId ? { transferId, status: 'pending' } : undefined, createdAt,
    })
    const result: OwnershipCommandResult = {
      succeeded: !reason,
      idempotent: false,
      ...(reason ? { reason } : { transferId }),
    }
    await storeBoundOperation(tx, binding, result, createdAt)
    return result
  })
}

export const acceptOwnershipTransfer = async (params: {
  operationId: string
  transferId: string
  recipientPrincipalId: string
  acceptedAt?: Date
}): Promise<OwnershipCommandResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const binding = makeBoundOperation(params.operationId, 'accept_ownership_transfer', params.recipientPrincipalId, {
      transferId: params.transferId,
    })
    const replay = await loadBoundOperation<OwnershipCommandResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'TRANSFER_UNAVAILABLE' }
    const [transferReference] = await tx
      .select({ patchId: pendingOwnershipTransfers.patchId })
      .from(pendingOwnershipTransfers)
      .where(eq(pendingOwnershipTransfers.id, params.transferId))
      .limit(1)
    const [patch] = transferReference
      ? await tx.select().from(patches).where(eq(patches.id, transferReference.patchId)).for('update').limit(1)
      : []
    const [transfer] = await tx
      .select()
      .from(pendingOwnershipTransfers)
      .where(eq(pendingOwnershipTransfers.id, params.transferId))
      .for('update')
      .limit(1)
    const [recipient] = await tx
      .select({ kind: principals.kind, status: principals.status })
      .from(principals)
      .where(eq(principals.id, params.recipientPrincipalId))
      .for('update')
      .limit(1)
    const [recipientOwnership] = patch
      ? await tx
          .select({ id: patches.id })
          .from(patches)
          .where(and(
            eq(patches.quiltId, patch.quiltId),
            eq(patches.ownerPrincipalId, params.recipientPrincipalId),
            eq(patches.state, 'active'),
          ))
          .orderBy(asc(patches.id))
          .for('update')
          .limit(1)
      : []
    const acceptedAt = params.acceptedAt ?? new Date()
    let reason: OwnershipCommandResult['reason']
    if (!recipient || recipient.kind !== 'human' || recipient.status !== 'active') reason = 'PRINCIPAL_INELIGIBLE'
    else if (!transfer || transfer.status !== 'pending' || transfer.expiresAt <= acceptedAt
      || transfer.recipientPrincipalId !== params.recipientPrincipalId) reason = 'TRANSFER_UNAVAILABLE'
    else if (!patch || patch.state !== 'active' || patch.ownerPrincipalId !== transfer.senderPrincipalId) reason = 'NOT_OWNER'
    else if (recipientOwnership) reason = 'PRINCIPAL_INELIGIBLE'

    let revision: number | undefined
    if (!reason && patch && transfer) {
      revision = patch.revision + 1
      await tx.update(patches).set({
        ownerPrincipalId: transfer.recipientPrincipalId,
        revision,
        updatedAt: acceptedAt,
      }).where(eq(patches.id, patch.id))
      await tx.delete(patchMemberships).where(and(
        eq(patchMemberships.patchId, patch.id),
        eq(patchMemberships.principalId, transfer.senderPrincipalId),
        eq(patchMemberships.role, 'owner'),
      ))
      await tx.insert(patchMemberships).values({
        patchId: patch.id,
        principalId: transfer.recipientPrincipalId,
        role: 'owner',
        createdAt: acceptedAt,
      }).onConflictDoUpdate({
        target: [patchMemberships.patchId, patchMemberships.principalId],
        set: { role: 'owner' },
      })
      await tx.update(pendingOwnershipTransfers).set({
        status: 'accepted', resolvedAt: acceptedAt, updatedAt: acceptedAt,
      }).where(eq(pendingOwnershipTransfers.id, transfer.id))
    }
    await insertOwnershipAudit(tx, {
      eventType: 'ownership_transfer_accepted', attemptedAction: 'accept_ownership_transfer',
      succeeded: !reason, reason, actorPrincipalId: params.recipientPrincipalId,
      subjectPrincipalId: transfer?.senderPrincipalId, quiltId: patch?.quiltId,
      patchId: patch?.id, operationId: params.operationId,
      beforeState: patch ? { ownerPrincipalId: patch.ownerPrincipalId, revision: patch.revision } : undefined,
      afterState: revision ? { ownerPrincipalId: params.recipientPrincipalId, revision } : undefined, createdAt: acceptedAt,
    })
    const result: OwnershipCommandResult = {
      succeeded: !reason,
      idempotent: false,
      ...(reason ? { reason } : { revision }),
    }
    await storeBoundOperation(tx, binding, result, acceptedAt)
    return result
  })
}

export const cancelOwnershipTransfer = async (params: {
  operationId: string
  transferId: string
  actorPrincipalId?: string
  sourceChannel?: 'http' | 'operation'
  cancelledAt?: Date
  operationalContext?: { operatorId: string; supportTicket: string; reason: string }
}): Promise<OwnershipCommandResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const actorPrincipalId = params.actorPrincipalId ?? `operator:${params.operationalContext?.operatorId ?? 'system'}`
    const binding = makeBoundOperation(params.operationId, 'cancel_ownership_transfer', actorPrincipalId, {
      transferId: params.transferId,
      sourceChannel: params.sourceChannel ?? 'http',
      operationalContext: params.operationalContext,
    })
    const replay = await loadBoundOperation<OwnershipCommandResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'TRANSFER_UNAVAILABLE' }
    const [transfer] = await tx.select().from(pendingOwnershipTransfers)
      .where(eq(pendingOwnershipTransfers.id, params.transferId)).for('update').limit(1)
    const [patch] = transfer
      ? await tx.select().from(patches).where(eq(patches.id, transfer.patchId)).for('update').limit(1)
      : []
    const authorized = Boolean(transfer && patch && transfer.status === 'pending'
      && (!params.actorPrincipalId || patch.ownerPrincipalId === params.actorPrincipalId))
    const cancelledAt = params.cancelledAt ?? new Date()
    if (authorized && transfer) {
      await tx.update(pendingOwnershipTransfers).set({
        status: 'cancelled', resolvedAt: cancelledAt, updatedAt: cancelledAt,
      }).where(eq(pendingOwnershipTransfers.id, transfer.id))
    }
    await insertOwnershipAudit(tx, {
      eventType: 'ownership_transfer_cancelled', attemptedAction: 'cancel_ownership_transfer',
      succeeded: authorized, reason: authorized ? undefined : 'TRANSFER_UNAVAILABLE',
      actorPrincipalId: params.actorPrincipalId, subjectPrincipalId: transfer?.recipientPrincipalId,
      quiltId: patch?.quiltId, patchId: patch?.id, operationId: params.operationId,
      sourceChannel: params.sourceChannel, beforeState: transfer ? { status: transfer.status } : undefined,
      afterState: authorized ? {
        status: 'cancelled',
        ...(params.operationalContext ? { operationalContext: params.operationalContext } : {}),
      } : undefined,
      createdAt: cancelledAt,
    })
    const result: OwnershipCommandResult = {
      succeeded: authorized,
      idempotent: false,
      ...(!authorized ? { reason: 'TRANSFER_UNAVAILABLE' as const } : {}),
    }
    await storeBoundOperation(tx, binding, result, cancelledAt)
    return result
  })
}

export const expireOwnershipTransfers = async (expiredAt: Date = new Date()): Promise<number> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    const due = await tx.select().from(pendingOwnershipTransfers)
      .where(and(eq(pendingOwnershipTransfers.status, 'pending'), lte(pendingOwnershipTransfers.expiresAt, expiredAt)))
      .orderBy(asc(pendingOwnershipTransfers.id)).for('update')
    for (const transfer of due) {
      await tx.update(pendingOwnershipTransfers).set({
        status: 'expired', resolvedAt: expiredAt, updatedAt: expiredAt,
      }).where(eq(pendingOwnershipTransfers.id, transfer.id))
      await insertOwnershipAudit(tx, {
        eventType: 'ownership_transfer_expired', attemptedAction: 'expire_ownership_transfer',
        succeeded: true, subjectPrincipalId: transfer.recipientPrincipalId,
        patchId: transfer.patchId, operationId: transfer.operationId, sourceChannel: 'job',
        beforeState: { status: 'pending' }, afterState: { status: 'expired' }, createdAt: expiredAt,
      })
    }
    return due.length
  })
}

export const abandonPatch = async (params: {
  operationId: string
  patchId: string
  principalId: string
  abandonedAt?: Date
}): Promise<OwnershipCommandResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const binding = makeBoundOperation(params.operationId, 'abandon_patch', params.principalId, {
      patchId: params.patchId,
    })
    const replay = await loadBoundOperation<OwnershipCommandResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'NOT_OWNER' }
    const [patch] = await tx.select().from(patches).where(eq(patches.id, params.patchId)).for('update').limit(1)
    const [pending] = patch ? await tx.select({ id: pendingOwnershipTransfers.id }).from(pendingOwnershipTransfers)
      .where(and(eq(pendingOwnershipTransfers.patchId, patch.id), eq(pendingOwnershipTransfers.status, 'pending')))
      .for('update').limit(1) : []
    const succeeded = Boolean(patch && patch.state === 'active'
      && patch.ownerPrincipalId === params.principalId && !pending)
    const abandonedAt = params.abandonedAt ?? new Date()
    let revision: number | undefined
    if (succeeded && patch) {
      revision = patch.revision + 1
      await tx.update(patches).set({ ownerPrincipalId: null, state: 'unclaimed', revision, updatedAt: abandonedAt })
        .where(eq(patches.id, patch.id))
      await tx.delete(patchMemberships).where(and(
        eq(patchMemberships.patchId, patch.id),
        eq(patchMemberships.principalId, params.principalId),
        eq(patchMemberships.role, 'owner'),
      ))
    }
    const reason = !succeeded ? (pending ? 'TRANSFER_PENDING' : 'NOT_OWNER') : undefined
    await insertOwnershipAudit(tx, {
      eventType: 'patch_abandoned', attemptedAction: 'abandon_patch', succeeded, reason,
      actorPrincipalId: params.principalId, subjectPrincipalId: params.principalId,
      quiltId: patch?.quiltId, patchId: patch?.id, operationId: params.operationId,
      beforeState: patch ? { ownerPrincipalId: patch.ownerPrincipalId, state: patch.state, revision: patch.revision } : undefined,
      afterState: revision ? { ownerPrincipalId: null, state: 'unclaimed', revision } : undefined, createdAt: abandonedAt,
    })
    const result: OwnershipCommandResult = {
      succeeded,
      idempotent: false,
      ...(reason ? { reason } : { revision }),
    }
    await storeBoundOperation(tx, binding, result, abandonedAt)
    return result
  })
}

export type PrincipalDeletionResult = {
  succeeded: boolean
  idempotent: boolean
  reason?: 'PRINCIPAL_UNAVAILABLE' | 'RECOVERY_WINDOW_EXPIRED' | 'RECOVERY_WINDOW_OPEN' | 'OWNERSHIP_UNRESOLVED' | 'RETENTION_UNAPPROVED'
  recoveryDeadline?: Date
}

export const requestPrincipalDeletion = async (params: {
  operationId: string
  principalId: string
  requestedAt?: Date
}): Promise<PrincipalDeletionResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const binding = makeBoundOperation(params.operationId, 'request_principal_deletion', params.principalId, {
      principalId: params.principalId,
    })
    const replay = await loadBoundOperation<PrincipalDeletionResult>(tx, binding)
    if (replay.matched) {
      return {
        ...replay.response,
        idempotent: true,
        ...(replay.response.recoveryDeadline
          ? { recoveryDeadline: new Date(replay.response.recoveryDeadline) }
          : {}),
      }
    }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'PRINCIPAL_UNAVAILABLE' }
    const [principal] = await tx.select().from(principals).where(eq(principals.id, params.principalId)).for('update').limit(1)
    const requestedAt = params.requestedAt ?? new Date()
    const succeeded = principal?.status === 'active'
    const recoveryDeadline = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    if (succeeded) await tx.update(principals).set({
      status: 'deletion_pending', deletionRequestedAt: requestedAt,
      deletionRecoveryDeadline: recoveryDeadline, updatedAt: requestedAt,
    }).where(eq(principals.id, params.principalId))
    await insertOwnershipAudit(tx, {
      eventType: 'principal_deletion_requested', attemptedAction: 'request_principal_deletion',
      succeeded, reason: succeeded ? undefined : 'PRINCIPAL_UNAVAILABLE', actorPrincipalId: params.principalId,
      subjectPrincipalId: params.principalId, operationId: params.operationId,
      beforeState: principal ? { status: principal.status } : undefined,
      afterState: succeeded ? { status: 'deletion_pending', recoveryDeadline: recoveryDeadline.toISOString() } : undefined,
      createdAt: requestedAt,
    })
    const result: PrincipalDeletionResult = {
      succeeded,
      idempotent: false,
      ...(succeeded ? { recoveryDeadline } : { reason: 'PRINCIPAL_UNAVAILABLE' }),
    }
    await storeBoundOperation(tx, binding, result, requestedAt)
    return result
  })
}

export const recoverPrincipalDeletion = async (params: {
  operationId: string
  principalId: string
  actorPrincipalId?: string
  sourceChannel?: 'http' | 'operation'
  recoveredAt?: Date
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  operationalContext?: { operatorId: string; supportTicket: string; reason: string }
}): Promise<PrincipalDeletionResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const actorPrincipalId = params.actorPrincipalId ?? params.principalId
    const binding = makeBoundOperation(params.operationId, 'recover_principal_deletion', actorPrincipalId, {
      principalId: params.principalId,
      sourceChannel: params.sourceChannel ?? 'http',
      operationalContext: params.operationalContext,
    })
    const replay = await loadBoundOperation<PrincipalDeletionResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'PRINCIPAL_UNAVAILABLE' }
    const [principal] = await tx.select().from(principals).where(eq(principals.id, params.principalId)).for('update').limit(1)
    const recoveredAt = params.recoveredAt ?? new Date()
    const succeeded = Boolean(principal?.status === 'deletion_pending'
      && principal.deletionRecoveryDeadline && principal.deletionRecoveryDeadline >= recoveredAt)
    if (succeeded) await tx.update(principals).set({
      status: 'active', deletionRequestedAt: null, deletionRecoveryDeadline: null, updatedAt: recoveredAt,
    }).where(eq(principals.id, params.principalId))
    const reason = principal?.status === 'deletion_pending' ? 'RECOVERY_WINDOW_EXPIRED' : 'PRINCIPAL_UNAVAILABLE'
    await insertOwnershipAudit(tx, {
      eventType: 'principal_deletion_recovered', attemptedAction: 'recover_principal_deletion',
      succeeded, reason: succeeded ? undefined : reason,
      actorPrincipalId: params.actorPrincipalId ?? params.principalId, subjectPrincipalId: params.principalId,
      operationId: params.operationId, sourceChannel: params.sourceChannel,
      beforeState: params.beforeState ?? (principal ? { status: principal.status } : undefined),
      afterState: params.afterState ?? (succeeded ? {
        status: 'active',
        ...(params.operationalContext ? { operationalContext: params.operationalContext } : {}),
      } : undefined),
      createdAt: recoveredAt,
    })
    const result: PrincipalDeletionResult = {
      succeeded,
      idempotent: false,
      ...(!succeeded ? { reason } : {}),
    }
    await storeBoundOperation(tx, binding, result, recoveredAt)
    return result
  })
}

export const listDuePrincipalDeletionIds = async (params: {
  dueAt?: Date
  limit: number
}): Promise<string[]> => {
  const { db } = getDatabaseBundle()
  const dueAt = params.dueAt ?? new Date()
  return (await db.select({ id: principals.id }).from(principals)
    .where(and(
      eq(principals.status, 'deletion_pending'),
      lte(principals.deletionRecoveryDeadline, dueAt),
    ))
    .orderBy(asc(principals.deletionRecoveryDeadline), asc(principals.id))
    .limit(params.limit))
    .map(({ id }) => id)
}

export const completePrincipalDeletion = async (params: {
  operationId: string
  principalId: string
  retentionApproved: boolean
  completedAt?: Date
}): Promise<PrincipalDeletionResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
    const binding = makeBoundOperation(params.operationId, 'complete_principal_deletion', 'deletion-job', {
      principalId: params.principalId,
      retentionApproved: params.retentionApproved,
    })
    const replay = await loadBoundOperation<PrincipalDeletionResult>(tx, binding)
    if (replay.matched) return { ...replay.response, idempotent: true }
    if (replay.exists) return { succeeded: false, idempotent: false, reason: 'PRINCIPAL_UNAVAILABLE' }
    const [principal] = await tx.select().from(principals).where(eq(principals.id, params.principalId)).for('update').limit(1)
    const completedAt = params.completedAt ?? new Date()
    const [ownedPatch] = await tx.select({ id: patches.id }).from(patches)
      .where(eq(patches.ownerPrincipalId, params.principalId)).orderBy(asc(patches.id)).for('update').limit(1)
    let reason: PrincipalDeletionResult['reason']
    if (!principal || principal.status !== 'deletion_pending' || !principal.deletionRecoveryDeadline) reason = 'PRINCIPAL_UNAVAILABLE'
    else if (principal.deletionRecoveryDeadline > completedAt) reason = 'RECOVERY_WINDOW_OPEN'
    else if (ownedPatch) reason = 'OWNERSHIP_UNRESOLVED'
    else if (!params.retentionApproved) reason = 'RETENTION_UNAPPROVED'
    if (!reason) {
      await tx.delete(externalPrincipalMappings).where(eq(externalPrincipalMappings.principalId, params.principalId))
      await tx.update(principals).set({
        status: 'deleted', displayName: null, email: null,
        deletionCompletedAt: completedAt, updatedAt: completedAt,
      }).where(eq(principals.id, params.principalId))
    }
    await insertOwnershipAudit(tx, {
      eventType: 'principal_deletion_completed', attemptedAction: 'complete_principal_deletion',
      succeeded: !reason, reason, subjectPrincipalId: params.principalId,
      operationId: params.operationId, sourceChannel: 'job',
      beforeState: principal ? { status: principal.status, ownsPatch: Boolean(ownedPatch) } : undefined,
      afterState: reason ? undefined : { status: 'deleted', profileRemoved: true, mappingRemoved: true },
      createdAt: completedAt,
    })
    const result: PrincipalDeletionResult = {
      succeeded: !reason,
      idempotent: false,
      ...(reason ? { reason } : {}),
    }
    await storeBoundOperation(tx, binding, result, completedAt)
    return result
  })
}

const CHUNK_WORLD_SIZE = RUNTIME_CHUNK_WORLD_SIZE
const DEFAULT_CANVAS_CONFIG: SessionCanvasConfig = {
  canvasSize: {
    width: DEFAULT_BOUNDED_WORLD_BOUNDS.maxX - DEFAULT_BOUNDED_WORLD_BOUNDS.minX,
    height: DEFAULT_BOUNDED_WORLD_BOUNDS.maxY - DEFAULT_BOUNDED_WORLD_BOUNDS.minY,
  },
  boundsPolicy: {
    mode: 'bounded',
    bounds: DEFAULT_BOUNDED_WORLD_BOUNDS,
  },
}

const worldToChunk = (x: number, y: number, chunkWorldSize: number = CHUNK_WORLD_SIZE): ChunkCoordinate => ({
  x: Math.floor(x / chunkWorldSize),
  y: Math.floor(y / chunkWorldSize),
})

const rectPatchAddresses = (rect: TopologyRect, topology: QuiltTopology): PatchAddress[] => {
  const maxX = rect.maxX === rect.minX ? rect.maxX : Math.max(rect.minX, rect.maxX - Number.EPSILON)
  const maxY = rect.maxY === rect.minY ? rect.maxY : Math.max(rect.minY, rect.maxY - Number.EPSILON)
  const minColumn = Math.min(Math.floor(rect.minX / topology.patchWidth), topology.patchColumns - 1)
  const maxColumn = Math.min(Math.floor(maxX / topology.patchWidth), topology.patchColumns - 1)
  const minRow = Math.min(Math.floor(rect.minY / topology.patchHeight), topology.patchRows - 1)
  const maxRow = Math.min(Math.floor(maxY / topology.patchHeight), topology.patchRows - 1)
  const addresses: PatchAddress[] = []

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      addresses.push({ row, column })
    }
  }

  return addresses
}

export const deriveAffectedPatchAddresses = (
  topology: QuiltTopology,
  bounds: TopologyRect,
): PatchAddress[] => {
  const unique = new Map<string, PatchAddress>()
  for (const rect of decomposeWrappedViewport(bounds, topology)) {
    for (const address of rectPatchAddresses(rect, topology)) {
      unique.set(`${address.row}:${address.column}`, address)
    }
  }
  return Array.from(unique.values()).sort((left, right) => left.row - right.row || left.column - right.column)
}

const deriveCanonicalSpatialRefs = (
  tileId: string,
  patchRowsByAddress: Map<string, { id: string }>,
  topology: QuiltTopology,
  bounds: TopologyRect,
): Array<{ tileId: string; patchId: string; chunkX: number; chunkY: number }> => {
  const refs = new Map<string, { tileId: string; patchId: string; chunkX: number; chunkY: number }>()
  for (const rect of decomposeWrappedViewport(bounds, topology)) {
    for (const address of rectPatchAddresses(rect, topology)) {
      const patch = patchRowsByAddress.get(`${address.row}:${address.column}`)
      if (!patch) continue
      const maxX = rect.maxX === rect.minX ? rect.maxX : Math.max(rect.minX, rect.maxX - Number.EPSILON)
      const maxY = rect.maxY === rect.minY ? rect.maxY : Math.max(rect.minY, rect.maxY - Number.EPSILON)
      for (let chunkX = Math.floor(rect.minX / CHUNK_WORLD_SIZE); chunkX <= Math.floor(maxX / CHUNK_WORLD_SIZE); chunkX += 1) {
        for (let chunkY = Math.floor(rect.minY / CHUNK_WORLD_SIZE); chunkY <= Math.floor(maxY / CHUNK_WORLD_SIZE); chunkY += 1) {
          const ref = { tileId, patchId: patch.id, chunkX, chunkY }
          refs.set(`${patch.id}:${chunkX}:${chunkY}`, ref)
        }
      }
    }
  }
  return Array.from(refs.values())
}

const toChunkIdentity = (tile: TileInstance): string => {
  const chunk = worldToChunk(tile.transform.position.x, tile.transform.position.y)
  return `${tile.id}:${chunk.x}:${chunk.y}`
}

const normalizeTileIdentitySet = (tilesList: TileInstance[]): string[] =>
  tilesList.map(toChunkIdentity).sort((left, right) => left.localeCompare(right))

export const areChunkTileSetsEquivalent = (left: TileInstance[], right: TileInstance[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  const leftIds = normalizeTileIdentitySet(left)
  const rightIds = normalizeTileIdentitySet(right)
  return leftIds.every((value, index) => value === rightIds[index])
}

export const areTileSpatialRefsEquivalent = (
  expected: Array<{ tileId: string; patchId: string; chunkX: number; chunkY: number }>,
  actual: Array<{ tileId: string; patchId: string; chunkX: number; chunkY: number }>,
): boolean => {
  const toIdentity = (ref: { tileId: string; patchId: string; chunkX: number; chunkY: number }): string =>
    `${ref.patchId}:${ref.chunkX}:${ref.chunkY}:${ref.tileId}`
  const expectedIdentities = expected.map(toIdentity).sort((left, right) => left.localeCompare(right))
  const actualIdentities = actual.map(toIdentity).sort((left, right) => left.localeCompare(right))

  return expectedIdentities.length === actualIdentities.length &&
    expectedIdentities.every((value, index) => value === actualIdentities[index])
}

const mapTile = (row: typeof tiles.$inferSelect): TileInstance => ({
  id: row.id,
  shape: row.shape as TileInstance['shape'],
  color: row.color,
  material: row.material as TileInstance['material'],
  transform: {
    position: { x: row.posX, y: row.posY },
    rotation: row.rotation,
    mirrored: row.mirrored,
  },
  placedBy: row.placedBy ?? undefined,
  createdAt: toMillis(row.createdAt),
})

const mapSession = (
  canvas: typeof canvases.$inferSelect,
  tileRows: Array<typeof tiles.$inferSelect>,
): Session => ({
  id: canvas.id,
  tiles: tileRows.map(mapTile),
  createdAt: toMillis(canvas.createdAt),
  updatedAt: toMillis(canvas.updatedAt),
})

const mapClient = (row: typeof participants.$inferSelect): ClientPresence => ({
  clientId: row.clientId,
  joinedAt: toMillis(row.joinedAt),
})

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isBoundsPolicy = (value: unknown): value is BoundsPolicy => {
  if (!isObjectRecord(value) || typeof value.mode !== 'string') {
    return false
  }

  if (value.mode === 'unbounded') {
    return true
  }

  if (value.mode !== 'bounded' || !isObjectRecord(value.bounds)) {
    return false
  }

  return (
    typeof value.bounds.minX === 'number' &&
    typeof value.bounds.maxX === 'number' &&
    typeof value.bounds.minY === 'number' &&
    typeof value.bounds.maxY === 'number'
  )
}

const normalizeCanvasConfig = (value: unknown): SessionCanvasConfig => {
  if (!isObjectRecord(value)) {
    return DEFAULT_CANVAS_CONFIG
  }

  if (!isObjectRecord(value.canvasSize)) {
    return DEFAULT_CANVAS_CONFIG
  }

  if (typeof value.canvasSize.width !== 'number' || typeof value.canvasSize.height !== 'number') {
    return DEFAULT_CANVAS_CONFIG
  }

  if (!isBoundsPolicy(value.boundsPolicy)) {
    return DEFAULT_CANVAS_CONFIG
  }

  return {
    canvasSize: {
      width: value.canvasSize.width,
      height: value.canvasSize.height,
    },
    boundsPolicy: value.boundsPolicy.mode === 'bounded'
      ? {
          mode: 'bounded',
          bounds: {
            minX: value.boundsPolicy.bounds.minX,
            maxX: value.boundsPolicy.bounds.maxX,
            minY: value.boundsPolicy.bounds.minY,
            maxY: value.boundsPolicy.bounds.maxY,
          },
        }
      : {
          mode: 'unbounded',
        },
  }
}

const isTileInstance = (value: unknown): value is TileInstance => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (typeof value.id !== 'string' || typeof value.shape !== 'string' || typeof value.color !== 'string') {
    return false
  }

  if (typeof value.material !== 'string' || typeof value.createdAt !== 'number') {
    return false
  }

  const transform = value.transform
  if (!isObjectRecord(transform)) {
    return false
  }

  const position = transform.position
  if (!isObjectRecord(position)) {
    return false
  }

  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    typeof transform.rotation === 'number' &&
    (transform.mirrored === undefined || typeof transform.mirrored === 'boolean') &&
    (value.placedBy === undefined || typeof value.placedBy === 'string')
  )
}

const isPlaceOperationPayload = (value: unknown): value is PlaceTilePayload & { tileId: string } => {
  if (!isObjectRecord(value) || typeof value.tileId !== 'string' || typeof value.shape !== 'string') {
    return false
  }

  if (typeof value.color !== 'string' || typeof value.material !== 'string') {
    return false
  }

  const transform = value.transform
  if (!isObjectRecord(transform)) {
    return false
  }

  const position = transform.position
  if (!isObjectRecord(position)) {
    return false
  }

  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    typeof transform.rotation === 'number' &&
    (transform.mirrored === undefined || typeof transform.mirrored === 'boolean')
  )
}

const isRemoveOperationPayload = (value: unknown): value is RemoveTilePayload =>
  isObjectRecord(value) && typeof value.tileId === 'string'

const applyOperationToTiles = (tilesState: TileInstance[], operation: PersistedOperationRecord): TileInstance[] => {
  if (operation.opType === 'tile_placed' && isPlaceOperationPayload(operation.payload)) {
    const tile: TileInstance = {
      id: operation.payload.tileId,
      shape: operation.payload.shape,
      color: operation.payload.color,
      material: operation.payload.material,
      transform: operation.payload.transform,
      placedBy: operation.clientId,
      createdAt: operation.createdAt,
    }

    const withoutPrevious = tilesState.filter((entry) => entry.id !== tile.id)
    return [...withoutPrevious, tile]
  }

  if (operation.opType === 'tile_removed' && isRemoveOperationPayload(operation.payload)) {
    const removePayload = operation.payload
    return tilesState.filter((entry) => entry.id !== removePayload.tileId)
  }

  return tilesState
}

const getNextOpSeq = async (db: DatabaseClient, canvasId: string): Promise<number> => {
  const [result] = await db
    .select({ value: sql<number>`coalesce(max(${operationLog.opSeq}), 0)` })
    .from(operationLog)
    .where(eq(operationLog.canvasId, canvasId))

  return (result?.value ?? 0) + 1
}

const getCanvasRevision = async (db: DatabaseClient, canvasId: string): Promise<number> => {
  const [canvas] = await db.select({ version: canvases.version }).from(canvases).where(eq(canvases.id, canvasId)).limit(1)
  return canvas?.version ?? 0
}

const REPLAY_TTL_MS = 24 * 60 * 60 * 1000

const makeIdempotencyKey = (
  operation: 'place_tile' | 'remove_tile',
  sessionId: string,
  tileId: string,
  requestIdentity: unknown,
): { key: string; requestHash: string } => {
  const requestHash = stableJson({ operation, sessionId, requestIdentity })
  return {
    key: `${operation}:${sessionId}:${tileId}`,
    requestHash,
  }
}

const isMatchingRequestHash = (storedRequestHash: string, requestHash: string): boolean =>
  storedRequestHash === requestHash

const upsertIdempotencyOutcome = async (
  db: DatabaseClient,
  params: {
    key: string
    clientId: string
    requestHash: string
    statusCode: number
    response: unknown
    now: Date
  },
): Promise<void> => {
  const expiresAt = new Date(params.now.getTime() + REPLAY_TTL_MS)

  await db
    .insert(idempotencyKeys)
    .values({
      key: params.key,
      clientId: params.clientId,
      requestHash: params.requestHash,
      statusCode: params.statusCode,
      response: params.response,
      createdAt: params.now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [idempotencyKeys.key, idempotencyKeys.clientId],
      set: {
        requestHash: params.requestHash,
        statusCode: params.statusCode,
        response: params.response,
        createdAt: params.now,
        expiresAt,
      },
    })
}

const isPlaceAckResponse = (value: unknown): value is { placed: TileInstance; rejected: false; opSeq: number } => {
  if (!isObjectRecord(value) || value.rejected !== false || typeof value.opSeq !== 'number') {
    return false
  }

  return isTileInstance(value.placed)
}

const isRemoveAckResponse = (value: unknown): value is { removed: true; opSeq: number } =>
  isObjectRecord(value) && value.removed === true && typeof value.opSeq === 'number'

export const loadSessionRecord = async (
  sessionId: string,
  canvasConfig?: SessionCanvasConfig,
): Promise<AuthoritativeSessionRecord> => {
  const { db } = getDatabaseBundle()

  const now = new Date()
  if (canvasConfig) {
    await db
      .insert(canvases)
      .values({ id: sessionId, canvasConfig, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: canvases.id,
        set: { canvasConfig },
      })
  } else {
    await db.insert(canvases).values({ id: sessionId, createdAt: now, updatedAt: now }).onConflictDoNothing()
  }

  const [canvas] = await db.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
  if (!canvas) {
    throw new Error(`Failed to load canvas ${sessionId}`)
  }

  const [tileRows, participantRows, latestOpSeq] = await Promise.all([
    db.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt)),
    db
      .select()
      .from(participants)
      .where(and(eq(participants.canvasId, sessionId), isNull(participants.leftAt)))
      .orderBy(asc(participants.joinedAt)),
    db
      .select({ value: max(operationLog.opSeq) })
      .from(operationLog)
      .where(eq(operationLog.canvasId, sessionId)),
  ])

  return {
    session: mapSession(canvas, tileRows),
    canvasConfig: normalizeCanvasConfig(canvas.canvasConfig),
    clients: participantRows.map(mapClient),
    lastOpSeq: latestOpSeq[0]?.value ?? 0,
    revision: canvas.version,
  }
}

export const createProtectedSession = async (
  sessionId: string,
  canvasConfig: SessionCanvasConfig,
): Promise<CreatedProtectedSession> => {
  const { db } = getDatabaseBundle()
  const now = new Date()

  const claimTarget = await db.transaction(async (tx) => {
    await tx.insert(canvases).values({
      id: sessionId,
      canvasConfig,
      createdAt: now,
      updatedAt: now,
    })

    const bounds = canvasConfig.boundsPolicy.mode === 'bounded'
      ? canvasConfig.boundsPolicy.bounds
      : { minX: 0, minY: 0 }
    const [quilt] = await tx
      .insert(quilts)
      .values({
        legacyCanvasId: sessionId,
        patchRows: 1,
        patchColumns: 1,
        patchWidth: canvasConfig.canvasSize.width,
        patchHeight: canvasConfig.canvasSize.height,
        originX: bounds.minX,
        originY: bounds.minY,
        topology: 'bounded',
        protocolVersion: 1,
      })
      .returning({ id: quilts.id })
    if (!quilt) throw new Error('Session quilt creation did not return a row')

    const [patch] = await tx
      .insert(patches)
      .values({
        quiltId: quilt.id,
        row: 0,
        column: 0,
        state: 'unclaimed',
        revision: 0,
      })
      .returning({ id: patches.id })
    if (!patch) throw new Error('Session patch creation did not return a row')

    await tx.insert(patchVisibilityPolicies).values({
      patchId: patch.id,
      existence: 'authenticated',
      fineData: 'authenticated',
      aggregateData: 'authenticated',
      presence: 'authenticated',
      search: 'authenticated',
      durableEvents: 'authenticated',
      claimEnabled: true,
      policyVersion: 1,
    })

    return {
      patchId: patch.id,
      ownershipState: 'unclaimed' as const,
      claimEligibility: 'eligible' as const,
    }
  })

  return {
    ...await loadSessionRecord(sessionId),
    claimTarget,
  }
}

export const listTilesByChunks = async (sessionId: string, chunks: ChunkCoordinate[]): Promise<TileInstance[]> => {
  if (chunks.length === 0) {
    return []
  }

  const { db } = getDatabaseBundle()
  const uniqueChunks = Array.from(new Map(chunks.map((chunk) => [`${chunk.x}:${chunk.y}`, chunk])).values())

  const chunkClauses = uniqueChunks.map((chunk) =>
    and(eq(tiles.chunkX, chunk.x), eq(tiles.chunkY, chunk.y)),
  )

  const rows = await db
    .select()
    .from(tiles)
    .where(and(eq(tiles.canvasId, sessionId), or(...chunkClauses)))
    .orderBy(asc(tiles.createdAt))

  return rows.map(mapTile)
}

export const listTilesByChunksWithParity = async (
  sessionId: string,
  chunks: ChunkCoordinate[],
): Promise<ChunkTileReadResult> => {
  const readStartedAt = performance.now()
  const record = await loadSessionRecord(sessionId)
  const chunkedTiles = await listTilesByChunks(sessionId, chunks)

  const requestedChunkIds = new Set(chunks.map((chunk) => `${chunk.x}:${chunk.y}`))
  const legacyTiles = record.session.tiles.filter((tile) => {
    const tileChunk = worldToChunk(tile.transform.position.x, tile.transform.position.y)
    return requestedChunkIds.has(`${tileChunk.x}:${tileChunk.y}`)
  })

  const parityReport = compareLegacyAndPatchTiles(legacyTiles, chunkedTiles)
  emitQuiltTelemetry({
    name: 'dual_read_parity',
    canary: false,
    measurements: {
      durationMs: performance.now() - readStartedAt,
      legacyTileCount: parityReport.legacyTileCount,
      patchTileCount: parityReport.patchTileCount,
      mismatchCount: parityReport.mismatches.length
        + parityReport.missingFromLegacy.length
        + parityReport.missingFromPatch.length,
    },
    dimensions: { matched: parityReport.matches, readPath: 'legacy-chunk' },
    details: parityReport.matches ? undefined : parityReport,
  })

  return {
    tiles: parityReport.matches ? chunkedTiles : legacyTiles,
    opSeq: record.lastOpSeq,
    revision: record.revision,
    parityMatched: parityReport.matches,
    parityReport,
  }
}

export const markParticipantJoined = async (
  sessionId: string,
  clientId: string,
  joinedAt: number,
): Promise<ClientPresence> => {
  const { db } = getDatabaseBundle()
  const joinedAtDate = new Date(joinedAt)

  await db
    .insert(participants)
    .values({ canvasId: sessionId, clientId, joinedAt: joinedAtDate, leftAt: null })
    .onConflictDoUpdate({
      target: [participants.canvasId, participants.clientId],
      set: { joinedAt: joinedAtDate, leftAt: null },
    })

  return { clientId, joinedAt }
}

export const markParticipantLeft = async (sessionId: string, clientId: string, leftAt: number): Promise<void> => {
  const { db } = getDatabaseBundle()
  await db
    .update(participants)
    .set({ leftAt: new Date(leftAt) })
    .where(and(eq(participants.canvasId, sessionId), eq(participants.clientId, clientId)))
}

export const listActiveParticipants = async (sessionId: string): Promise<ClientPresence[]> => {
  const { db } = getDatabaseBundle()
  const rows = await db
    .select()
    .from(participants)
    .where(and(eq(participants.canvasId, sessionId), isNull(participants.leftAt)))
    .orderBy(asc(participants.joinedAt))

  return rows.map(mapClient)
}

const lockQuiltPresence = async (tx: DatabaseClient, quiltId: string, principalId: string): Promise<void> => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${quiltId}), hashtext(${principalId}))`)
}

export type QuiltPresenceLeaseDecision = {
  quiltId: string
  principalId: string
  clientId: string
  joinedAt: number
  isFirstLease?: boolean
  isLastLease?: boolean
}

export const acquireQuiltPresenceLease = async (params: {
  socketId: string
  quiltId: string
  principalId: string
  clientId: string
  now: number
  ttlMs: number
}): Promise<QuiltPresenceLeaseDecision> => {
  const { db } = getDatabaseBundle()
  const now = new Date(params.now)
  const expiresAt = new Date(params.now + params.ttlMs)

  return db.transaction(async (tx) => {
    await lockQuiltPresence(tx, params.quiltId, params.principalId)
    await tx.delete(quiltPresenceLeases).where(and(
      eq(quiltPresenceLeases.quiltId, params.quiltId),
      eq(quiltPresenceLeases.principalId, params.principalId),
      lte(quiltPresenceLeases.expiresAt, now),
    ))
    const active = await tx
      .select({ joinedAt: quiltPresenceLeases.joinedAt })
      .from(quiltPresenceLeases)
      .where(and(
        eq(quiltPresenceLeases.quiltId, params.quiltId),
        eq(quiltPresenceLeases.principalId, params.principalId),
        gt(quiltPresenceLeases.expiresAt, now),
      ))

    await tx.insert(quiltPresenceLeases).values({
      socketId: params.socketId,
      quiltId: params.quiltId,
      principalId: params.principalId,
      clientId: params.clientId,
      joinedAt: now,
      heartbeatAt: now,
      expiresAt,
    }).onConflictDoUpdate({
      target: quiltPresenceLeases.socketId,
      set: { heartbeatAt: now, expiresAt },
    })

    return {
      quiltId: params.quiltId,
      principalId: params.principalId,
      clientId: params.principalId,
      joinedAt: active.reduce((earliest, lease) => Math.min(earliest, lease.joinedAt.getTime()), params.now),
      isFirstLease: active.length === 0,
    }
  })
}

export const renewQuiltPresenceLease = async (socketId: string, now: number, ttlMs: number): Promise<boolean> => {
  const { db } = getDatabaseBundle()
  const renewed = await db
    .update(quiltPresenceLeases)
    .set({ heartbeatAt: new Date(now), expiresAt: new Date(now + ttlMs) })
    .where(eq(quiltPresenceLeases.socketId, socketId))
    .returning({ socketId: quiltPresenceLeases.socketId })
  return renewed.length === 1
}

export const releaseQuiltPresenceLease = async (params: {
  socketId: string
  quiltId: string
  principalId: string
  now: number
}): Promise<QuiltPresenceLeaseDecision> => {
  const { db } = getDatabaseBundle()
  const now = new Date(params.now)

  return db.transaction(async (tx) => {
    await lockQuiltPresence(tx, params.quiltId, params.principalId)
    const removed = await tx
      .delete(quiltPresenceLeases)
      .where(eq(quiltPresenceLeases.socketId, params.socketId))
      .returning({ joinedAt: quiltPresenceLeases.joinedAt })
    await tx.delete(quiltPresenceLeases).where(and(
      eq(quiltPresenceLeases.quiltId, params.quiltId),
      eq(quiltPresenceLeases.principalId, params.principalId),
      lte(quiltPresenceLeases.expiresAt, now),
    ))
    const active = await tx
      .select({ socketId: quiltPresenceLeases.socketId })
      .from(quiltPresenceLeases)
      .where(and(
        eq(quiltPresenceLeases.quiltId, params.quiltId),
        eq(quiltPresenceLeases.principalId, params.principalId),
        gt(quiltPresenceLeases.expiresAt, now),
      ))

    return {
      quiltId: params.quiltId,
      principalId: params.principalId,
      clientId: params.principalId,
      joinedAt: removed[0]?.joinedAt.getTime() ?? params.now,
      isLastLease: removed.length > 0 && active.length === 0,
    }
  })
}

export const reapExpiredQuiltPresenceLeases = async (now: number): Promise<QuiltPresenceLeaseDecision[]> => {
  const { db } = getDatabaseBundle()
  const expiresAt = new Date(now)

  return db.transaction(async (tx) => {
    const expired = await tx
      .select({
        quiltId: quiltPresenceLeases.quiltId,
        principalId: quiltPresenceLeases.principalId,
      })
      .from(quiltPresenceLeases)
      .where(lte(quiltPresenceLeases.expiresAt, expiresAt))
    const scopes = new Map(expired.map((lease) => [`${lease.quiltId}:${lease.principalId}`, lease]))
    const departures: QuiltPresenceLeaseDecision[] = []

    for (const scope of scopes.values()) {
      await lockQuiltPresence(tx, scope.quiltId, scope.principalId)
      const removed = await tx
        .delete(quiltPresenceLeases)
        .where(and(
          eq(quiltPresenceLeases.quiltId, scope.quiltId),
          eq(quiltPresenceLeases.principalId, scope.principalId),
          lte(quiltPresenceLeases.expiresAt, expiresAt),
        ))
        .returning({ socketId: quiltPresenceLeases.socketId })
      if (removed.length === 0) continue

      const active = await tx
        .select({ socketId: quiltPresenceLeases.socketId })
        .from(quiltPresenceLeases)
        .where(and(
          eq(quiltPresenceLeases.quiltId, scope.quiltId),
          eq(quiltPresenceLeases.principalId, scope.principalId),
          gt(quiltPresenceLeases.expiresAt, expiresAt),
        ))
      if (active.length === 0) {
        departures.push({
          quiltId: scope.quiltId,
          principalId: scope.principalId,
          clientId: scope.principalId,
          joinedAt: now,
          isLastLease: true,
        })
      }
    }

    return departures
  })
}

export const listSessionSummaries = async (principalId: string): Promise<SessionSummaryRecord[]> => {
  const { db } = getDatabaseBundle()

  const rows = await db
    .select({
      id: canvases.id,
      participantCount: countDistinct(participants.clientId),
      canvasConfig: canvases.canvasConfig,
      updatedAt: canvases.updatedAt,
    })
    .from(canvases)
    .innerJoin(quilts, eq(quilts.legacyCanvasId, canvases.id))
    .innerJoin(patches, eq(patches.quiltId, quilts.id))
    .innerJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
    .leftJoin(
      patchMemberships,
      and(eq(patchMemberships.patchId, patches.id), eq(patchMemberships.principalId, principalId)),
    )
    .leftJoin(participants, and(eq(participants.canvasId, canvases.id), isNull(participants.leftAt)))
    .where(and(
      sql`${patches.state} not in ('deletion_requested', 'deleted')`,
      or(
        eq(patchVisibilityPolicies.existence, 'authenticated'),
        eq(patchVisibilityPolicies.existence, 'public'),
        and(
          eq(patchVisibilityPolicies.existence, 'hidden'),
          or(eq(patches.ownerPrincipalId, principalId), eq(patchMemberships.principalId, principalId)),
        ),
      ),
    ))
    .groupBy(canvases.id, canvases.updatedAt)
    .orderBy(desc(canvases.updatedAt), asc(canvases.id))

  return rows.map((row) => ({
    id: row.id,
    participantCount: Number(row.participantCount),
    canvasConfig: normalizeCanvasConfig(row.canvasConfig),
  }))
}

export const persistQuiltTilePlacement = async (params: {
  quiltId: string
  operationId: string
  principalId: string
  placedBy: string
  expectedPatchRevisions: Record<string, number>
  payload: PlaceTilePayload
  createdAt?: number
}): Promise<QuiltPlacementResult> => {
  const { db } = getDatabaseBundle()
  const mutationStartedAt = performance.now()

  try {
    return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)

    const [quilt] = await tx.select().from(quilts).where(eq(quilts.id, params.quiltId)).limit(1)
    if (!quilt || quilt.topology !== 'toroidal' || !quilt.legacyCanvasId) {
      return { committed: false, reason: 'PLACEMENT_REJECTED' }
    }

    const topology: QuiltTopology = {
      patchRows: quilt.patchRows,
      patchColumns: quilt.patchColumns,
      patchWidth: quilt.patchWidth,
      patchHeight: quilt.patchHeight,
    }
    const canonical = resolveCanonicalPoint({
      x: params.payload.transform.position.x - quilt.originX,
      y: params.payload.transform.position.y - quilt.originY,
    }, topology)
    const canonicalTransform = { ...params.payload.transform, position: canonical.point }
    const geometryBounds = derivePlacementBounds(params.payload.shape, canonicalTransform)
    const collisionBounds = derivePlacementBounds(params.payload.shape, canonicalTransform, MAX_GROUT_GAP)
    const intersectedAddresses = deriveAffectedPatchAddresses(topology, geometryBounds)
    const lockAddresses = deriveAffectedPatchAddresses(topology, collisionBounds)
    const allPatchRows = await tx.select().from(patches).where(eq(patches.quiltId, params.quiltId))
    const patchRowsByAddress = new Map(allPatchRows.map((patch) => [`${patch.row}:${patch.column}`, patch]))
    const intersectedPatchIds = intersectedAddresses.map((address) =>
      patchRowsByAddress.get(`${address.row}:${address.column}`)?.id,
    )
    const lockPatchIds = lockAddresses.map((address) =>
      patchRowsByAddress.get(`${address.row}:${address.column}`)?.id,
    )
    if (intersectedPatchIds.some((id) => !id) || lockPatchIds.some((id) => !id)) {
      throw new Error(`Quilt ${params.quiltId} is missing an affected patch`)
    }
    const sortedPatchIds = (lockPatchIds as string[]).sort((left, right) => left.localeCompare(right))
    const intersectedPatchIdSet = new Set(intersectedPatchIds as string[])

    const lockStartedAt = performance.now()
    const lockedPatches = await tx
      .select()
      .from(patches)
      .where(inArray(patches.id, sortedPatchIds))
      .orderBy(asc(patches.id))
      .for('update')
    emitQuiltTelemetry({
      name: 'patch_lock_wait',
      quiltId: params.quiltId,
      principalId: params.principalId,
      canary: false,
      measurements: {
        waitMs: performance.now() - lockStartedAt,
        patchCount: sortedPatchIds.length,
      },
    })
    const [principal] = await tx
      .select({ kind: principals.kind, status: principals.status })
      .from(principals)
      .where(eq(principals.id, params.principalId))
      .limit(1)
    const policyRows = await tx.select().from(patchVisibilityPolicies)
      .where(inArray(patchVisibilityPolicies.patchId, sortedPatchIds))
    const policiesByPatchId = new Map(policyRows.map((policy) => [policy.patchId, policy]))

    for (const patch of lockedPatches) {
      if (!intersectedPatchIdSet.has(patch.id)) {
        continue
      }
      if (
        principal?.kind !== 'human'
        || principal.status !== 'active'
        || patch.state !== 'active'
        || patch.ownerPrincipalId !== params.principalId
        || !isPersistedVisibilityPolicy(policiesByPatchId.get(patch.id))
      ) {
        return { committed: false, reason: 'UNAUTHORIZED' }
      }
    }

    const binding = makeBoundOperation(params.operationId, 'place_quilt_tile', params.principalId, {
      quiltId: params.quiltId,
      expectedPatchRevisions: params.expectedPatchRevisions,
      payload: { ...params.payload, transform: canonicalTransform },
    })
    const replay = await loadBoundOperation<QuiltPlacementResult>(tx, binding)
    if (replay.matched) {
      if (!replay.response.committed) return replay.response
      return { ...replay.response, idempotent: true }
    }
    if (replay.exists) return { committed: false, reason: 'PLACEMENT_REJECTED' }

    for (const patch of lockedPatches) {
      if (!intersectedPatchIdSet.has(patch.id)) {
        continue
      }
      const expectedRevision = params.expectedPatchRevisions[patch.id]
      if (expectedRevision === undefined || expectedRevision < patch.revision) {
        return { committed: false, reason: 'STALE_REVISION' }
      }
      if (expectedRevision > patch.revision) {
        return { committed: false, reason: 'OUT_OF_ORDER_REVISION' }
      }
    }

    const nearbyRows = await tx
      .selectDistinct({ tile: tiles })
      .from(tileSpatialRefs)
      .innerJoin(tiles, eq(tileSpatialRefs.tileId, tiles.id))
      .where(inArray(tileSpatialRefs.patchId, sortedPatchIds))
    const nearbyTiles = projectPeriodicNeighbors(nearbyRows.map((row) => mapTile(row.tile)), canonical.point, topology)
    const validation = validatePlacement(params.payload.shape, canonicalTransform, nearbyTiles, { mode: 'unbounded' })
    if (!validation.valid) {
      return { committed: false, reason: 'PLACEMENT_REJECTED' }
    }

    const anchorPatch = patchRowsByAddress.get(`${canonical.patch.row}:${canonical.patch.column}`)
    if (!anchorPatch) {
      throw new Error(`Quilt ${params.quiltId} is missing anchor patch`)
    }
    const createdAt = new Date(params.createdAt ?? Date.now())
    const tileChunk = worldToChunk(canonical.point.x, canonical.point.y)
    await tx.insert(tiles).values({
      id: params.payload.tileId,
      canvasId: quilt.legacyCanvasId,
      quiltId: params.quiltId,
      anchorPatchId: anchorPatch.id,
      shape: params.payload.shape,
      color: params.payload.color,
      material: params.payload.material,
      posX: canonical.point.x,
      posY: canonical.point.y,
      chunkX: tileChunk.x,
      chunkY: tileChunk.y,
      rotation: canonicalTransform.rotation,
      mirrored: canonicalTransform.mirrored ?? false,
      placedBy: params.placedBy,
      createdAt,
    })

    const spatialRefs = deriveCanonicalSpatialRefs(params.payload.tileId, patchRowsByAddress, topology, geometryBounds)
    if (spatialRefs.length > 0) {
      await tx.insert(tileSpatialRefs).values(spatialRefs)
    }

    const patchChunkIds = Object.fromEntries((intersectedPatchIds as string[]).map((patchId) => [
      patchId,
      [...new Set(spatialRefs
        .filter((ref) => ref.patchId === patchId)
        .map((ref) => `${ref.chunkX}:${ref.chunkY}`))],
    ]))
    const eventIds: Record<string, string> = {}
    for (const patch of lockedPatches) {
      if (!intersectedPatchIdSet.has(patch.id)) {
        continue
      }
      const nextRevision = patch.revision + 1
      const eventPayload = { ...params.payload, transform: canonicalTransform, chunkIds: patchChunkIds[patch.id] }
      const [operation] = await tx.insert(patchOperations).values({
        patchId: patch.id,
        opSeq: nextRevision,
        operationId: params.operationId,
        actorPrincipalId: params.principalId,
        opType: 'tile_placed',
        payload: eventPayload,
        createdAt,
      }).returning({ eventId: patchOperations.eventId })
      eventIds[patch.id] = operation.eventId
      await tx.insert(authorizationAuditEvents).values({
        eventType: 'quilt_tile_placed',
        attemptedAction: 'place_tile',
        outcome: 'succeeded',
        actorPrincipalId: params.principalId,
        quiltId: params.quiltId,
        patchId: patch.id,
        operationId: params.operationId,
        sourceChannel: 'socket',
        policyVersion: policiesByPatchId.get(patch.id)?.policyVersion,
        afterState: { tileId: params.payload.tileId, revision: nextRevision },
        createdAt,
      })
      await tx
        .update(patches)
        .set({ revision: nextRevision, updatedAt: createdAt })
        .where(eq(patches.id, patch.id))
    }

    const result: QuiltPlacementResult = {
      committed: true,
      idempotent: false,
      operationId: params.operationId,
      eventIds,
      patchChunkIds,
      tile: {
        id: params.payload.tileId,
        shape: params.payload.shape,
        color: params.payload.color,
        material: params.payload.material,
        transform: canonicalTransform,
        placedBy: params.placedBy,
        createdAt: createdAt.getTime(),
      },
      patchRevisions: Object.fromEntries(
        lockedPatches
          .filter((patch) => intersectedPatchIdSet.has(patch.id))
          .map((patch) => [patch.id, patch.revision + 1]),
      ),
    }
    await storeBoundOperation(tx, binding, result, createdAt)
    return result
    })
  } finally {
    emitQuiltTelemetry({
      name: 'mutation_latency',
      quiltId: params.quiltId,
      principalId: params.principalId,
      canary: false,
      measurements: { durationMs: performance.now() - mutationStartedAt },
      dimensions: { mutation: 'place' },
    })
  }
}

export const persistQuiltTileRemoval = async (params: {
  quiltId: string
  operationId: string
  principalId: string
  expectedPatchRevisions: Record<string, number>
  tileId: string
  removedAt?: number
}): Promise<QuiltRemovalResult> => {
  const { db } = getDatabaseBundle()
  const mutationStartedAt = performance.now()

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${params.operationId}))`)
      const binding = makeBoundOperation(params.operationId, 'remove_quilt_tile', params.principalId, {
        quiltId: params.quiltId,
        expectedPatchRevisions: params.expectedPatchRevisions,
        tileId: params.tileId,
      })
      const replay = await loadBoundOperation<QuiltRemovalResult>(tx, binding)
      if (!replay.matched && replay.exists) return { committed: false, reason: 'RESOURCE_UNAVAILABLE' }

      const [tile] = await tx.select().from(tiles)
        .where(and(eq(tiles.id, params.tileId), eq(tiles.quiltId, params.quiltId)))
        .limit(1)
      if (!tile && !replay.matched) return { committed: false, reason: 'RESOURCE_UNAVAILABLE' }

      const scopedRefs = tile
        ? await tx.select({
            patchId: tileSpatialRefs.patchId,
            chunkX: tileSpatialRefs.chunkX,
            chunkY: tileSpatialRefs.chunkY,
          })
            .from(tileSpatialRefs)
            .where(eq(tileSpatialRefs.tileId, params.tileId))
        : []
      const sortedPatchIds = replay.matched && replay.response.committed
        ? Object.keys(replay.response.patchRevisions).sort((left, right) => left.localeCompare(right))
        : [...new Set(scopedRefs.map((ref) => ref.patchId))].sort((left, right) => left.localeCompare(right))
      if (sortedPatchIds.length === 0) return { committed: false, reason: 'RESOURCE_UNAVAILABLE' }

      const lockedPatches = await tx.select().from(patches)
        .where(inArray(patches.id, sortedPatchIds))
        .orderBy(asc(patches.id))
        .for('update')
      const [principal] = await tx.select({ kind: principals.kind, status: principals.status })
        .from(principals)
        .where(eq(principals.id, params.principalId))
        .limit(1)
      const policyRows = await tx.select().from(patchVisibilityPolicies)
        .where(inArray(patchVisibilityPolicies.patchId, sortedPatchIds))
      const policiesByPatchId = new Map(policyRows.map((policy) => [policy.patchId, policy]))

      for (const patch of lockedPatches) {
        if (
          principal?.kind !== 'human'
          || principal.status !== 'active'
          || patch.state !== 'active'
          || patch.ownerPrincipalId !== params.principalId
          || !isPersistedVisibilityPolicy(policiesByPatchId.get(patch.id))
        ) return { committed: false, reason: 'UNAUTHORIZED' }
      }

      if (replay.matched) {
        if (!replay.response.committed) return replay.response
        return { ...replay.response, idempotent: true }
      }

      for (const patch of lockedPatches) {
        const expectedRevision = params.expectedPatchRevisions[patch.id]
        if (expectedRevision === undefined || expectedRevision < patch.revision) {
          return { committed: false, reason: 'STALE_REVISION' }
        }
        if (expectedRevision > patch.revision) return { committed: false, reason: 'OUT_OF_ORDER_REVISION' }
      }

      const removedAt = new Date(params.removedAt ?? Date.now())
      await tx.delete(tiles).where(eq(tiles.id, params.tileId))
      const patchChunkIds = Object.fromEntries(sortedPatchIds.map((patchId) => [
        patchId,
        [...new Set(scopedRefs
          .filter((ref) => ref.patchId === patchId)
          .map((ref) => `${ref.chunkX}:${ref.chunkY}`))],
      ]))
      const eventIds: Record<string, string> = {}
      const patchRevisions: Record<string, number> = {}
      for (const patch of lockedPatches) {
        const nextRevision = patch.revision + 1
        const [operation] = await tx.insert(patchOperations).values({
          patchId: patch.id,
          opSeq: nextRevision,
          operationId: params.operationId,
          actorPrincipalId: params.principalId,
          opType: 'tile_removed',
          payload: { tileId: params.tileId, chunkIds: patchChunkIds[patch.id] },
          createdAt: removedAt,
        }).returning({ eventId: patchOperations.eventId })
        eventIds[patch.id] = operation.eventId
        await tx.insert(authorizationAuditEvents).values({
          eventType: 'quilt_tile_removed',
          attemptedAction: 'remove_tile',
          outcome: 'succeeded',
          actorPrincipalId: params.principalId,
          quiltId: params.quiltId,
          patchId: patch.id,
          operationId: params.operationId,
          sourceChannel: 'socket',
          policyVersion: policiesByPatchId.get(patch.id)?.policyVersion,
          beforeState: { tileId: params.tileId, revision: patch.revision },
          afterState: { revision: nextRevision },
          createdAt: removedAt,
        })
        await tx.update(patches).set({ revision: nextRevision, updatedAt: removedAt }).where(eq(patches.id, patch.id))
        patchRevisions[patch.id] = nextRevision
      }
      const result: QuiltRemovalResult = {
        committed: true,
        idempotent: false,
        operationId: params.operationId,
        eventIds,
        patchChunkIds,
        tileId: params.tileId,
        patchRevisions,
      }
      await storeBoundOperation(tx, binding, result, removedAt)
      return result
    })
  } finally {
    emitQuiltTelemetry({
      name: 'mutation_latency',
      quiltId: params.quiltId,
      principalId: params.principalId,
      canary: false,
      measurements: { durationMs: performance.now() - mutationStartedAt },
      dimensions: { mutation: 'remove' },
    })
  }
}

export const persistTilePlacement = async (params: {
  sessionId: string
  payload: PlaceTilePayload
  principalId: string
  placedBy: string
  createdAt?: number
}): Promise<PersistedPlacementResult> => {
  const { db } = getDatabaseBundle()
  const { sessionId, payload, placedBy } = params

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`)
    const currentRevision = await getCanvasRevision(tx, sessionId)
    const tileId = params.payload.tileId
    const createdAt = new Date(params.createdAt ?? Date.now())
    const { key: idempotencyKey, requestHash } = makeIdempotencyKey('place_tile', sessionId, tileId, {
      tileId: payload.tileId,
      shape: payload.shape,
      color: payload.color,
      material: payload.material,
      transform: payload.transform,
    })

    if (!await hasCurrentLegacyMutationAuthority(tx, sessionId, params.principalId)) {
      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) throw new Error(`Failed to load canvas ${sessionId}`)
      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
      return {
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { placed: null, rejected: true, reason: 'PLACEMENT_REJECTED' },
      }
    }

    if (params.payload.expectedRevision !== undefined) {
      if (params.payload.expectedRevision < currentRevision) {
        const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
        if (!canvas) {
          throw new Error(`Failed to load canvas ${sessionId}`)
        }

        const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
        return {
          revision: currentRevision,
          session: mapSession(canvas, tileRows),
          ack: { placed: null, rejected: true, reason: 'STALE_REVISION' },
        }
      }

      if (params.payload.expectedRevision > currentRevision) {
        const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
        if (!canvas) {
          throw new Error(`Failed to load canvas ${sessionId}`)
        }

        const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
        return {
          revision: currentRevision,
          session: mapSession(canvas, tileRows),
          ack: { placed: null, rejected: true, reason: 'OUT_OF_ORDER_REVISION' },
        }
      }
    }

    const [existingIdempotency] = await tx
      .select({ response: idempotencyKeys.response, requestHash: idempotencyKeys.requestHash })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, idempotencyKey),
          eq(idempotencyKeys.clientId, placedBy),
          lte(sql`now()`, idempotencyKeys.expiresAt),
        ),
      )
      .limit(1)

    if (existingIdempotency && !isMatchingRequestHash(existingIdempotency.requestHash, requestHash)) {
      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) {
        throw new Error(`Failed to load canvas ${sessionId}`)
      }

      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
      return {
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { placed: null, rejected: true, reason: 'REQUEST_HASH_MISMATCH' },
      }
    }

    if (existingIdempotency && isPlaceAckResponse(existingIdempotency.response)) {
      const replayResponse = existingIdempotency.response
      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) {
        throw new Error(`Failed to load canvas ${sessionId}`)
      }

      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
      const replayedTile = tileRows.find((entry) => entry.id === replayResponse.placed.id)

      if (!replayedTile) {
        throw new Error(`Failed to replay tile placement for ${replayResponse.placed.id}`)
      }

      return {
        opSeq: replayResponse.opSeq,
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: {
          placed: mapTile(replayedTile),
          rejected: false,
          opSeq: replayResponse.opSeq,
          idempotent: true,
        },
        event: {
          tile: mapTile(replayedTile),
          placedBy,
          opSeq: replayResponse.opSeq,
          revision: currentRevision,
        },
      }
    }

    const [duplicateTile] = await tx
      .select()
      .from(tiles)
      .where(and(eq(tiles.id, tileId), eq(tiles.canvasId, sessionId)))
      .limit(1)

    if (duplicateTile) {
      const [priorPlacement] = await tx
        .select({ opSeq: operationLog.opSeq })
        .from(operationLog)
        .where(
          and(
            eq(operationLog.canvasId, sessionId),
            eq(operationLog.opType, 'tile_placed'),
            sql`${operationLog.payload}->>'tileId' = ${tileId}`,
          ),
        )
        .orderBy(asc(operationLog.opSeq))
        .limit(1)

      if (!priorPlacement) {
        throw new Error(`Found duplicate tile ${tileId} without placement log`)
      }

      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) {
        throw new Error(`Failed to load canvas ${sessionId}`)
      }

      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
      const replayedTile = mapTile(duplicateTile)

      const replayAck = {
        placed: replayedTile,
        rejected: false as const,
        opSeq: priorPlacement.opSeq,
      }

      await upsertIdempotencyOutcome(tx, {
        key: idempotencyKey,
        clientId: placedBy,
        requestHash,
        statusCode: 200,
        response: replayAck,
        now: createdAt,
      })

      return {
        opSeq: priorPlacement.opSeq,
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { ...replayAck, idempotent: true },
        event: { tile: replayedTile, placedBy, opSeq: priorPlacement.opSeq, revision: currentRevision },
      }
    }

    const opSeq = await getNextOpSeq(tx, sessionId)

    const tileChunk = worldToChunk(payload.transform.position.x, payload.transform.position.y)

    await tx.insert(tiles).values({
      id: tileId,
      canvasId: sessionId,
      shape: payload.shape,
      color: payload.color,
      material: payload.material,
      posX: payload.transform.position.x,
      posY: payload.transform.position.y,
      chunkX: tileChunk.x,
      chunkY: tileChunk.y,
      rotation: payload.transform.rotation,
      mirrored: payload.transform.mirrored ?? false,
      placedBy,
      createdAt,
    })

    await tx.insert(operationLog).values({
      canvasId: sessionId,
      opSeq,
      opType: 'tile_placed',
      payload,
      clientId: placedBy,
      createdAt,
    })

    const now = new Date()
    const [canvas] = await tx
      .update(canvases)
      .set({ updatedAt: now, version: sql`${canvases.version} + 1` })
      .where(eq(canvases.id, sessionId))
      .returning()

    const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
    const tile = tileRows.find((entry) => entry.id === tileId)
    if (!tile || !canvas) {
      throw new Error('Failed to persist tile placement')
    }

    const session = mapSession(canvas, tileRows)
    const placedTile = mapTile(tile)

    await upsertIdempotencyOutcome(tx, {
      key: idempotencyKey,
      clientId: placedBy,
      requestHash,
      statusCode: 200,
      response: { placed: placedTile, rejected: false, opSeq },
      now: createdAt,
    })

    return {
      opSeq,
      revision: canvas.version,
      session,
      ack: { placed: placedTile, rejected: false, opSeq },
      event: { tile: placedTile, placedBy, opSeq, revision: canvas.version },
    }
  })
}

export const persistTileRemoval = async (params: {
  sessionId: string
  payload: RemoveTilePayload
  principalId: string
  removedBy: string
}): Promise<PersistedRemovalResult> => {
  const { db } = getDatabaseBundle()
  const { sessionId, payload, removedBy } = params

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`)
    const currentRevision = await getCanvasRevision(tx, sessionId)
    const now = new Date()
    const { key: idempotencyKey, requestHash } = makeIdempotencyKey('remove_tile', sessionId, payload.tileId, {
      tileId: payload.tileId,
    })

    if (!await hasCurrentLegacyMutationAuthority(tx, sessionId, params.principalId)) {
      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) throw new Error(`Failed to load canvas ${sessionId}`)
      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
      return {
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { removed: false },
      }
    }

    if (params.payload.expectedRevision !== undefined) {
      if (params.payload.expectedRevision < currentRevision) {
        const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
        if (!canvas) {
          throw new Error(`Failed to load canvas ${sessionId}`)
        }

        const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
        return {
          revision: currentRevision,
          session: mapSession(canvas, tileRows),
          ack: { removed: false, reason: 'STALE_REVISION' },
        }
      }

      if (params.payload.expectedRevision > currentRevision) {
        const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
        if (!canvas) {
          throw new Error(`Failed to load canvas ${sessionId}`)
        }

        const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
        return {
          revision: currentRevision,
          session: mapSession(canvas, tileRows),
          ack: { removed: false, reason: 'OUT_OF_ORDER_REVISION' },
        }
      }
    }

    const [existingIdempotency] = await tx
      .select({ response: idempotencyKeys.response, requestHash: idempotencyKeys.requestHash })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, idempotencyKey),
          eq(idempotencyKeys.clientId, removedBy),
          lte(sql`now()`, idempotencyKeys.expiresAt),
        ),
      )
      .limit(1)

    if (existingIdempotency && !isMatchingRequestHash(existingIdempotency.requestHash, requestHash)) {
      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) {
        throw new Error(`Failed to load canvas ${sessionId}`)
      }

      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
      return {
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { removed: false, reason: 'REQUEST_HASH_MISMATCH' },
      }
    }

    if (existingIdempotency && isRemoveAckResponse(existingIdempotency.response)) {
      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) {
        throw new Error(`Failed to load canvas ${sessionId}`)
      }

      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))

      return {
        opSeq: existingIdempotency.response.opSeq,
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { removed: true, opSeq: existingIdempotency.response.opSeq, idempotent: true },
        event: { tileId: payload.tileId, removedBy, opSeq: existingIdempotency.response.opSeq, revision: currentRevision },
      }
    }

    const [existing] = await tx.select().from(tiles).where(eq(tiles.id, payload.tileId)).limit(1)
    if (!existing || existing.canvasId !== sessionId) {
      const [priorRemoval] = await tx
        .select({ opSeq: operationLog.opSeq })
        .from(operationLog)
        .where(
          and(
            eq(operationLog.canvasId, sessionId),
            eq(operationLog.opType, 'tile_removed'),
            sql`${operationLog.payload}->>'tileId' = ${payload.tileId}`,
          ),
        )
        .orderBy(asc(operationLog.opSeq))
        .limit(1)

      const [canvas] = await tx.select().from(canvases).where(eq(canvases.id, sessionId)).limit(1)
      if (!canvas) {
        throw new Error(`Failed to load canvas ${sessionId}`)
      }

      const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))

      if (priorRemoval) {
        const replayAck = { removed: true as const, opSeq: priorRemoval.opSeq }

        await upsertIdempotencyOutcome(tx, {
          key: idempotencyKey,
          clientId: removedBy,
          requestHash,
          statusCode: 200,
          response: replayAck,
          now,
        })

        return {
          opSeq: priorRemoval.opSeq,
          revision: currentRevision,
          session: mapSession(canvas, tileRows),
          ack: { ...replayAck, idempotent: true },
          event: { tileId: payload.tileId, removedBy, opSeq: priorRemoval.opSeq, revision: currentRevision },
        }
      }

      await upsertIdempotencyOutcome(tx, {
        key: idempotencyKey,
        clientId: removedBy,
        requestHash,
        statusCode: 404,
        response: { removed: false, reason: 'TILE_NOT_FOUND' },
        now,
      })

      return {
        revision: currentRevision,
        session: mapSession(canvas, tileRows),
        ack: { removed: false, reason: 'TILE_NOT_FOUND' },
      }
    }

    const opSeq = await getNextOpSeq(tx, sessionId)

    await tx.delete(tiles).where(eq(tiles.id, payload.tileId))
    await tx.insert(operationLog).values({
      canvasId: sessionId,
      opSeq,
      opType: 'tile_removed',
      payload: { tileId: payload.tileId },
      clientId: removedBy,
      createdAt: now,
    })

    const [canvas] = await tx
      .update(canvases)
      .set({ updatedAt: now, version: sql`${canvases.version} + 1` })
      .where(eq(canvases.id, sessionId))
      .returning()
    const tileRows = await tx.select().from(tiles).where(eq(tiles.canvasId, sessionId)).orderBy(asc(tiles.createdAt))
    if (!canvas) {
      throw new Error('Failed to persist tile removal')
    }

    await upsertIdempotencyOutcome(tx, {
      key: idempotencyKey,
      clientId: removedBy,
      requestHash,
      statusCode: 200,
      response: { removed: true, opSeq },
      now,
    })

    return {
      opSeq,
      revision: canvas.version,
      session: mapSession(canvas, tileRows),
      ack: { removed: true, opSeq },
      event: { tileId: payload.tileId, removedBy, opSeq, revision: canvas.version },
    }
  })
}

export const saveSnapshot = async (sessionId: string, opSeq: number, session: Session): Promise<void> => {
  const { db } = getDatabaseBundle()
  await db.insert(snapshots).values({
    id: randomUUID(),
    canvasId: sessionId,
    opSeq,
    state: session.tiles,
  })
}

export const getLatestSnapshot = async (sessionId: string): Promise<{ opSeq: number; tiles: TileInstance[] } | null> => {
  const { db } = getDatabaseBundle()
  const [snapshot] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.canvasId, sessionId))
    .orderBy(desc(snapshots.opSeq))
    .limit(1)

  if (!snapshot) {
    return null
  }

  return {
    opSeq: snapshot.opSeq,
    tiles: snapshot.state as TileInstance[],
  }
}

export const listOperationsAfter = async (sessionId: string, opSeq: number): Promise<PersistedOperationRecord[]> => {
  const { db } = getDatabaseBundle()
  const rows = await db
    .select()
    .from(operationLog)
    .where(and(eq(operationLog.canvasId, sessionId), sql`${operationLog.opSeq} > ${opSeq}`))
    .orderBy(asc(operationLog.opSeq))

  return rows.map((row) => ({
    opSeq: row.opSeq,
    opType: row.opType as PersistedOperationRecord['opType'],
    payload: row.payload,
    clientId: row.clientId,
    createdAt: toMillis(row.createdAt),
  }))
}

export const loadSessionReplayRecord = async (sessionId: string): Promise<ReplaySessionRecord> => {
  const snapshot = await getLatestSnapshot(sessionId)
  const snapshotOpSeq = snapshot?.opSeq ?? 0

  const [record, operations] = await Promise.all([
    loadSessionRecord(sessionId),
    listOperationsAfter(sessionId, snapshotOpSeq),
  ])

  const baseTiles = Array.isArray(snapshot?.tiles) ? snapshot.tiles.filter(isTileInstance) : []
  const replayedTiles = operations.reduce(applyOperationToTiles, baseTiles)

  return {
    ...record,
    session: {
      ...record.session,
      tiles: replayedTiles,
    },
    snapshotOpSeq,
    replayedOperations: operations,
  }
}

const reconstructPatchStateWithDatabase = async (
  db: DatabaseClient,
  patchId: string,
): Promise<{ opSeq: number; tiles: TileInstance[] }> => {
  const [patch] = await db.select({ revision: patches.revision }).from(patches).where(eq(patches.id, patchId)).limit(1)
  if (!patch) {
    throw new Error(`Patch ${patchId} does not exist`)
  }
  const rows = await db
    .selectDistinct({ tile: tiles })
    .from(tileSpatialRefs)
    .innerJoin(tiles, eq(tileSpatialRefs.tileId, tiles.id))
    .where(eq(tileSpatialRefs.patchId, patchId))
    .orderBy(asc(tiles.createdAt), asc(tiles.id))
  return { opSeq: patch.revision, tiles: rows.map((row) => mapTile(row.tile)) }
}

export const reconstructPatchState = async (patchId: string): Promise<{ opSeq: number; tiles: TileInstance[] }> => {
  const { db } = getDatabaseBundle()
  return db.transaction(
    (tx) => reconstructPatchStateWithDatabase(tx, patchId),
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

export type QuiltDeliveryContext = {
  topology: {
    quiltId: string
    protocolVersion: number
    topology: 'bounded' | 'toroidal'
    patchRows: number
    patchColumns: number
    patchWidth: number
    patchHeight: number
  }
  principalId: string
  patches: Array<{
    id: string
    row: number
    column: number
    state: 'unclaimed' | 'active' | 'suspended' | 'deletion_requested' | 'deleted'
    revision: number
    isMember: boolean
    isOwner: boolean
    policy: PersistedVisibilityPolicy | null
  }>
}

const CANONICAL_PRODUCT_KEY = 'canonical'
const CANONICAL_POLICY_VERSION = 1

type CanonicalPointerStatus = 'missing' | 'inactive' | 'active'

type ValidatedCanonicalTarget = {
  quilt: {
    id: string
    legacyCanvasId: string
    topology: 'toroidal'
    protocolVersion: 2
    patchRows: number
    patchColumns: number
    patchWidth: number
    patchHeight: number
    originX: number
    originY: number
  }
  patchCount: number
  initialPatch: { id: string; row: number; column: number }
  policyVersion: number
  exactProvisioningState: boolean
}

export type CanonicalWorldOperatorResult = {
  schemaVersion: 1
  action: 'status' | 'provision' | 'activate' | 'deactivate'
  result: 'succeeded' | 'idempotent'
  idempotent: boolean
  productKey: 'canonical'
  pointerStatus: CanonicalPointerStatus
  generation: number
  quilt?: ValidatedCanonicalTarget['quilt']
  patchCount?: number
  initialPatch?: ValidatedCanonicalTarget['initialPatch']
  policyVersion?: number
}

export type CanonicalProvisionInput = {
  action: 'provision'
  expectedGeneration: 0
  patchRows: number
  patchColumns: number
  patchWidth: number
  patchHeight: number
  originX: number
  originY: number
  operatorId: string
  reason: string
}

export type CanonicalActivateInput = {
  action: 'activate'
  quiltId: string
  expectedGeneration: number
  operatorId: string
  reason: string
}

export type CanonicalDeactivateInput = {
  action: 'deactivate'
  expectedGeneration: number
  operatorId: string
  reason: string
}

const baselinePolicy = {
  existence: 'authenticated',
  fineData: 'authenticated',
  aggregateData: 'authenticated',
  presence: 'authenticated',
  search: 'authenticated',
  durableEvents: 'authenticated',
  claimEnabled: true,
  policyVersion: CANONICAL_POLICY_VERSION,
} as const

const isCanonicalBaselinePolicy = (policy: PersistedVisibilityPolicy): boolean =>
  policy.existence === 'authenticated'
  && policy.fineData === 'authenticated'
  && policy.aggregateData === 'authenticated'
  && policy.presence === 'authenticated'
  && policy.search === 'authenticated'
  && policy.durableEvents === 'authenticated'
  && policy.claimEnabled
  && policy.policyVersion >= CANONICAL_POLICY_VERSION

const validateCanonicalTargetWithDatabase = async (
  tx: DatabaseClient,
  quiltId: string,
): Promise<ValidatedCanonicalTarget | null> => {
  const [target] = await tx
    .select({
      id: quilts.id,
      legacyCanvasId: quilts.legacyCanvasId,
      compatibilityCanvasId: canvases.id,
      patchRows: quilts.patchRows,
      patchColumns: quilts.patchColumns,
      patchWidth: quilts.patchWidth,
      patchHeight: quilts.patchHeight,
      originX: quilts.originX,
      originY: quilts.originY,
      topology: quilts.topology,
      protocolVersion: quilts.protocolVersion,
    })
    .from(quilts)
    .leftJoin(canvases, eq(canvases.id, quilts.legacyCanvasId))
    .where(eq(quilts.id, quiltId))
    .limit(1)

  if (
    !target
    || !target.legacyCanvasId
    || target.compatibilityCanvasId !== target.legacyCanvasId
    || target.protocolVersion !== 2
    || target.topology !== 'toroidal'
    || !Number.isSafeInteger(target.patchRows)
    || !Number.isSafeInteger(target.patchColumns)
    || target.patchRows <= 0
    || target.patchColumns <= 0
    || !Number.isFinite(target.patchWidth)
    || !Number.isFinite(target.patchHeight)
    || !Number.isFinite(target.originX)
    || !Number.isFinite(target.originY)
    || target.patchWidth <= 0
    || target.patchHeight <= 0
  ) return null

  const patchRecords = await tx
    .select({
      id: patches.id,
      row: patches.row,
      column: patches.column,
      state: patches.state,
      ownerPrincipalId: patches.ownerPrincipalId,
      revision: patches.revision,
      existence: patchVisibilityPolicies.existence,
      fineData: patchVisibilityPolicies.fineData,
      aggregateData: patchVisibilityPolicies.aggregateData,
      presence: patchVisibilityPolicies.presence,
      search: patchVisibilityPolicies.search,
      durableEvents: patchVisibilityPolicies.durableEvents,
      claimEnabled: patchVisibilityPolicies.claimEnabled,
      policyVersion: patchVisibilityPolicies.policyVersion,
    })
    .from(patches)
    .leftJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
    .where(eq(patches.quiltId, quiltId))
    .orderBy(asc(patches.row), asc(patches.column))

  const expectedPatchCount = target.patchRows * target.patchColumns
  if (!Number.isSafeInteger(expectedPatchCount) || patchRecords.length !== expectedPatchCount) return null

  const addresses = new Set<string>()
  let exactProvisioningState = true
  let minimumPolicyVersion = Number.MAX_SAFE_INTEGER
  for (const patch of patchRecords) {
    if (
      !Number.isSafeInteger(patch.row)
      || !Number.isSafeInteger(patch.column)
      || patch.row < 0
      || patch.row >= target.patchRows
      || patch.column < 0
      || patch.column >= target.patchColumns
      || (patch.state !== 'unclaimed' && patch.state !== 'active')
    ) return null

    const address = `${patch.row}:${patch.column}`
    if (addresses.has(address)) return null
    addresses.add(address)

    const policyCandidate = {
      existence: patch.existence,
      fineData: patch.fineData,
      aggregateData: patch.aggregateData,
      presence: patch.presence,
      search: patch.search,
      durableEvents: patch.durableEvents,
      claimEnabled: patch.claimEnabled,
      policyVersion: patch.policyVersion,
    }
    if (!isPersistedVisibilityPolicy(policyCandidate) || !isCanonicalBaselinePolicy(policyCandidate)) return null
    minimumPolicyVersion = Math.min(minimumPolicyVersion, policyCandidate.policyVersion)
    exactProvisioningState &&= patch.state === 'unclaimed'
      && patch.ownerPrincipalId === null
      && patch.revision === 0
      && policyCandidate.policyVersion === CANONICAL_POLICY_VERSION
  }

  for (let row = 0; row < target.patchRows; row += 1) {
    for (let column = 0; column < target.patchColumns; column += 1) {
      if (!addresses.has(`${row}:${column}`)) return null
    }
  }

  const initialPatch = patchRecords[0]
  if (!initialPatch || initialPatch.row !== 0 || initialPatch.column !== 0) return null
  return {
    quilt: {
      id: target.id,
      legacyCanvasId: target.legacyCanvasId,
      topology: 'toroidal',
      protocolVersion: 2,
      patchRows: target.patchRows,
      patchColumns: target.patchColumns,
      patchWidth: target.patchWidth,
      patchHeight: target.patchHeight,
      originX: target.originX,
      originY: target.originY,
    },
    patchCount: patchRecords.length,
    initialPatch: { id: initialPatch.id, row: initialPatch.row, column: initialPatch.column },
    policyVersion: minimumPolicyVersion,
    exactProvisioningState,
  }
}

const operatorResult = (
  action: CanonicalWorldOperatorResult['action'],
  pointerStatus: CanonicalPointerStatus,
  generation: number,
  target?: ValidatedCanonicalTarget,
  idempotent = false,
): CanonicalWorldOperatorResult => ({
  schemaVersion: 1,
  action,
  result: idempotent ? 'idempotent' : 'succeeded',
  idempotent,
  productKey: CANONICAL_PRODUCT_KEY,
  pointerStatus,
  generation,
  ...(target ? {
    quilt: target.quilt,
    patchCount: target.patchCount,
    initialPatch: target.initialPatch,
    policyVersion: target.policyVersion,
  } : {}),
})

const lockCanonicalWorld = async (tx: DatabaseClient): Promise<void> => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('canonical-world'), hashtext('canonical'))`)
}

const readCanonicalPointer = async (tx: DatabaseClient) => {
  const [pointer] = await tx
    .select()
    .from(canonicalWorld)
    .where(eq(canonicalWorld.productKey, CANONICAL_PRODUCT_KEY))
    .limit(1)
  return pointer
}

export const discoverCanonicalWorld = async (): Promise<CanonicalWorldDescriptor | null> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    const pointer = await readCanonicalPointer(tx)
    if (!pointer || pointer.status !== 'active') return null
    const target = await validateCanonicalTargetWithDatabase(tx, pointer.quiltId)
    if (!target) return null
    return {
      quiltId: target.quilt.id,
      legacyCanvasId: target.quilt.legacyCanvasId,
      topology: target.quilt.topology,
      protocolVersion: target.quilt.protocolVersion,
      patchRows: target.quilt.patchRows,
      patchColumns: target.quilt.patchColumns,
      patchWidth: target.quilt.patchWidth,
      patchHeight: target.quilt.patchHeight,
      originX: target.quilt.originX,
      originY: target.quilt.originY,
      generation: pointer.generation,
      initialPatch: target.initialPatch,
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

const toCanonicalPatchNavigation = (
  descriptor: Pick<CanonicalWorldDescriptor, 'quiltId' | 'patchWidth' | 'patchHeight' | 'originX' | 'originY'>,
  patch: { id: string; row: number; column: number },
): CanonicalPatchNavigation => ({
  quiltId: descriptor.quiltId,
  patchId: patch.id,
  row: patch.row,
  column: patch.column,
  centerX: descriptor.originX + (patch.column + 0.5) * descriptor.patchWidth,
  centerY: descriptor.originY + (patch.row + 0.5) * descriptor.patchHeight,
})

export const listEligibleCanonicalPatches = async (
  principalId: string,
): Promise<EligibleCanonicalPatchesResponse | null> => {
  const descriptor = await discoverCanonicalWorld()
  if (!descriptor) return null
  const { db } = getDatabaseBundle()

  const [principal, ownedPatch] = await Promise.all([
    db.select({ status: principals.status, kind: principals.kind })
      .from(principals)
      .where(eq(principals.id, principalId))
      .limit(1),
    db.select({ id: patches.id })
      .from(patches)
      .where(and(
        eq(patches.quiltId, descriptor.quiltId),
        eq(patches.ownerPrincipalId, principalId),
        eq(patches.state, 'active'),
      ))
      .limit(1),
  ])
  const claimAllowed = principal[0]?.status === 'active' && principal[0]?.kind === 'human' && ownedPatch.length === 0
  if (!claimAllowed) return { quiltId: descriptor.quiltId, generation: descriptor.generation, claimAllowed, patches: [] }

  const eligible = await db
    .select({ id: patches.id, row: patches.row, column: patches.column })
    .from(patches)
    .innerJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
    .where(and(
      eq(patches.quiltId, descriptor.quiltId),
      eq(patches.state, 'unclaimed'),
      isNull(patches.ownerPrincipalId),
      eq(patchVisibilityPolicies.claimEnabled, true),
    ))
    .orderBy(asc(patches.row), asc(patches.column))

  return {
    quiltId: descriptor.quiltId,
    generation: descriptor.generation,
    claimAllowed,
    patches: eligible.map((patch) => toCanonicalPatchNavigation(descriptor, patch)),
  }
}

export const ensureCanonicalPatchAssignment = async (
  principalId: string,
): Promise<CanonicalPatchNavigation | null> => {
  const descriptor = await discoverCanonicalWorld()
  if (!descriptor) return null
  const { db } = getDatabaseBundle()

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${principalId}))`)

    const [existing] = await tx
      .select({ id: patches.id, row: patches.row, column: patches.column })
      .from(patches)
      .where(and(
        eq(patches.quiltId, descriptor.quiltId),
        eq(patches.ownerPrincipalId, principalId),
        eq(patches.state, 'active'),
      ))
      .limit(1)
    if (existing) return toCanonicalPatchNavigation(descriptor, existing)

    const [assigned] = await tx
      .select({ id: patches.id, row: patches.row, column: patches.column, revision: patches.revision })
      .from(patches)
      .innerJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
      .where(and(
        eq(patches.quiltId, descriptor.quiltId),
        eq(patches.state, 'unclaimed'),
        isNull(patches.ownerPrincipalId),
        eq(patchVisibilityPolicies.claimEnabled, true),
      ))
      .orderBy(sql`random()`)
      .for('update', { skipLocked: true })
      .limit(1)
    if (!assigned) return null

    const assignedAt = new Date()
    await tx
      .update(patches)
      .set({
        ownerPrincipalId: principalId,
        state: 'active',
        revision: assigned.revision + 1,
        updatedAt: assignedAt,
      })
      .where(eq(patches.id, assigned.id))
    await tx.insert(patchMemberships).values({
      patchId: assigned.id,
      principalId,
      role: 'owner',
      createdAt: assignedAt,
    })
    await tx.insert(authorizationAuditEvents).values({
      eventType: 'patch_claim',
      attemptedAction: 'automatic_patch_assignment',
      outcome: 'succeeded',
      actorPrincipalId: principalId,
      subjectPrincipalId: principalId,
      quiltId: descriptor.quiltId,
      patchId: assigned.id,
      sourceChannel: 'http',
      beforeState: { state: 'unclaimed', revision: assigned.revision },
      afterState: { state: 'active', revision: assigned.revision + 1 },
      createdAt: assignedAt,
    })

    return toCanonicalPatchNavigation(descriptor, assigned)
  })
}

export const resolveCanonicalPatchNavigation = async (
  quiltId: string,
  patchId: string,
): Promise<CanonicalPatchNavigation | null> => {
  const descriptor = await discoverCanonicalWorld()
  if (!descriptor || descriptor.quiltId !== quiltId) return null
  const { db } = getDatabaseBundle()
  const [patch] = await db
    .select({ id: patches.id, row: patches.row, column: patches.column })
    .from(patches)
    .where(and(eq(patches.id, patchId), eq(patches.quiltId, quiltId)))
    .limit(1)
  return patch ? toCanonicalPatchNavigation(descriptor, patch) : null
}

export const listQuiltOccupancy = async (
  quiltId: string,
  principalId: string,
): Promise<QuiltOccupancyResponse | null> => {
  const { db } = getDatabaseBundle()
  const patchRows = await db
    .select({
      id: patches.id,
      state: patches.state,
      ownerPrincipalId: patches.ownerPrincipalId,
      memberPrincipalId: patchMemberships.principalId,
      existence: patchVisibilityPolicies.existence,
      fineData: patchVisibilityPolicies.fineData,
      aggregateData: patchVisibilityPolicies.aggregateData,
      presence: patchVisibilityPolicies.presence,
      search: patchVisibilityPolicies.search,
      durableEvents: patchVisibilityPolicies.durableEvents,
      claimEnabled: patchVisibilityPolicies.claimEnabled,
      policyVersion: patchVisibilityPolicies.policyVersion,
    })
    .from(patches)
    .leftJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
    .leftJoin(
      patchMemberships,
      and(eq(patchMemberships.patchId, patches.id), eq(patchMemberships.principalId, principalId)),
    )
    .where(eq(patches.quiltId, quiltId))

  if (patchRows.length === 0) return null

  const authorizedPatchIds = patchRows.flatMap((row) => {
    const policy = {
      existence: row.existence,
      fineData: row.fineData,
      aggregateData: row.aggregateData,
      presence: row.presence,
      search: row.search,
      durableEvents: row.durableEvents,
      claimEnabled: row.claimEnabled,
      policyVersion: row.policyVersion,
    }
    const authorized = canAccessPatchSurface('aggregateData', {
      state: row.state as QuiltDeliveryContext['patches'][number]['state'],
      policy: isPersistedVisibilityPolicy(policy) ? policy : null,
      subject: {
        authenticated: true,
        isMember: row.ownerPrincipalId === principalId || row.memberPrincipalId === principalId,
      },
    })
    return authorized ? [row.id] : []
  })

  if (authorizedPatchIds.length === 0) return { quiltId, chunks: [] }

  const occupiedChunks = await db
    .select({
      chunkX: tileSpatialRefs.chunkX,
      chunkY: tileSpatialRefs.chunkY,
      tileCount: countDistinct(tileSpatialRefs.tileId),
    })
    .from(tileSpatialRefs)
    .where(inArray(tileSpatialRefs.patchId, authorizedPatchIds))
    .groupBy(tileSpatialRefs.chunkX, tileSpatialRefs.chunkY)
    .orderBy(asc(tileSpatialRefs.chunkY), asc(tileSpatialRefs.chunkX))

  return {
    quiltId,
    chunks: occupiedChunks.map((chunk) => ({
      chunkId: `${chunk.chunkX}:${chunk.chunkY}`,
      tileCount: chunk.tileCount,
    })),
  }
}

export const getCanonicalWorldStatus = async (): Promise<CanonicalWorldOperatorResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await lockCanonicalWorld(tx)
    const pointer = await readCanonicalPointer(tx)
    if (!pointer) return operatorResult('status', 'missing', 0)
    const target = await validateCanonicalTargetWithDatabase(tx, pointer.quiltId)
    if (!target) throw new CanonicalWorldTargetInvalidError()
    return operatorResult('status', pointer.status as 'inactive' | 'active', pointer.generation, target)
  }, { isolationLevel: 'read committed' })
}

const geometryMatches = (target: ValidatedCanonicalTarget, input: CanonicalProvisionInput): boolean =>
  target.quilt.patchRows === input.patchRows
  && target.quilt.patchColumns === input.patchColumns
  && target.quilt.patchWidth === input.patchWidth
  && target.quilt.patchHeight === input.patchHeight
  && target.quilt.originX === input.originX
  && target.quilt.originY === input.originY

export const provisionCanonicalWorld = async (
  input: CanonicalProvisionInput,
): Promise<CanonicalWorldOperatorResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await lockCanonicalWorld(tx)
    if (input.expectedGeneration !== 0) throw new CanonicalWorldGenerationConflictError()
    const pointer = await readCanonicalPointer(tx)
    if (pointer) {
      const target = await validateCanonicalTargetWithDatabase(tx, pointer.quiltId)
      if (!target) throw new CanonicalWorldTargetInvalidError()
      if (
        pointer.status !== 'inactive'
        || pointer.generation !== 1
        || !target.exactProvisioningState
        || !geometryMatches(target, input)
      ) throw new CanonicalWorldGenerationConflictError()
      return operatorResult('provision', 'inactive', 1, target, true)
    }
    const compatibilityCanvasId = randomUUID()
    const quiltId = randomUUID()
    const patchRecords = Array.from({ length: input.patchRows * input.patchColumns }, (_, index) => ({
      id: randomUUID(),
      quiltId,
      row: Math.floor(index / input.patchColumns),
      column: index % input.patchColumns,
      state: 'unclaimed',
      revision: 0,
    }))
    await tx.insert(canvases).values({
      id: compatibilityCanvasId,
      canvasConfig: {
        canvasSize: {
          width: input.patchColumns * input.patchWidth,
          height: input.patchRows * input.patchHeight,
        },
        boundsPolicy: { mode: 'unbounded' },
      },
    })
    await tx.insert(quilts).values({
      id: quiltId,
      legacyCanvasId: compatibilityCanvasId,
      patchRows: input.patchRows,
      patchColumns: input.patchColumns,
      patchWidth: input.patchWidth,
      patchHeight: input.patchHeight,
      originX: input.originX,
      originY: input.originY,
      topology: 'toroidal',
      protocolVersion: 2,
    })
    await tx.insert(patches).values(patchRecords)
    await tx.insert(patchVisibilityPolicies).values(patchRecords.map((patch) => ({
      patchId: patch.id,
      ...baselinePolicy,
    })))
    await tx.insert(canonicalWorld).values({
      productKey: CANONICAL_PRODUCT_KEY,
      quiltId,
      status: 'inactive',
      generation: 1,
    })

    const target = await validateCanonicalTargetWithDatabase(tx, quiltId)
    if (!target) throw new CanonicalWorldTargetInvalidError()
    return operatorResult('provision', 'inactive', 1, target)
  }, { isolationLevel: 'read committed' })
}

export const activateCanonicalWorld = async (
  input: CanonicalActivateInput,
): Promise<CanonicalWorldOperatorResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await lockCanonicalWorld(tx)
    const pointer = await readCanonicalPointer(tx)
    if (pointer?.status === 'active' && pointer.generation === 2 && pointer.quiltId === input.quiltId && input.expectedGeneration === 1) {
      const target = await validateCanonicalTargetWithDatabase(tx, pointer.quiltId)
      if (!target) throw new CanonicalWorldTargetInvalidError()
      return operatorResult('activate', 'active', pointer.generation, target, true)
    }
    if (!pointer
      || pointer.status !== 'inactive'
      || pointer.generation !== 1
      || input.expectedGeneration !== 1
      || pointer.quiltId !== input.quiltId) throw new CanonicalWorldGenerationConflictError()
    const target = await validateCanonicalTargetWithDatabase(tx, pointer.quiltId)
    if (!target) throw new CanonicalWorldTargetInvalidError()
    const updated = await tx.update(canonicalWorld).set({
      status: 'active',
      generation: 2,
      updatedAt: new Date(),
    }).where(and(
      eq(canonicalWorld.productKey, CANONICAL_PRODUCT_KEY),
      eq(canonicalWorld.quiltId, pointer.quiltId),
      eq(canonicalWorld.status, 'inactive'),
      eq(canonicalWorld.generation, 1),
    )).returning({ generation: canonicalWorld.generation })
    if (updated.length !== 1) throw new CanonicalWorldGenerationConflictError()
    return operatorResult('activate', 'active', 2, target)
  }, { isolationLevel: 'read committed' })
}

export const deactivateCanonicalWorld = async (
  input: CanonicalDeactivateInput,
): Promise<CanonicalWorldOperatorResult> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    await lockCanonicalWorld(tx)
    const pointer = await readCanonicalPointer(tx)
    if (!pointer) throw new CanonicalWorldGenerationConflictError()
    const target = await validateCanonicalTargetWithDatabase(tx, pointer.quiltId)
    if (!target) throw new CanonicalWorldTargetInvalidError()
    if (pointer.status === 'inactive') {
      return operatorResult('deactivate', 'inactive', pointer.generation, target, true)
    }
    if (pointer.generation !== input.expectedGeneration) throw new CanonicalWorldGenerationConflictError()
    const generation = pointer.generation + 1
    const updated = await tx.update(canonicalWorld).set({
      status: 'inactive',
      generation,
      updatedAt: new Date(),
    }).where(and(
      eq(canonicalWorld.productKey, CANONICAL_PRODUCT_KEY),
      eq(canonicalWorld.generation, input.expectedGeneration),
    )).returning({ generation: canonicalWorld.generation })
    if (updated.length !== 1) throw new CanonicalWorldGenerationConflictError()
    return operatorResult('deactivate', 'inactive', generation, target)
  }, { isolationLevel: 'read committed' })
}

export const loadQuiltDeliveryContext = async (params: {
  quiltId: string
  principalId: string
}): Promise<QuiltDeliveryContext | null> => {
  const { db } = getDatabaseBundle()
  const [quilt] = await db.select().from(quilts).where(eq(quilts.id, params.quiltId)).limit(1)
  if (!quilt) return null

  const principalId = params.principalId

  const patchRows = await db
    .select({
      id: patches.id,
      row: patches.row,
      column: patches.column,
      state: patches.state,
      revision: patches.revision,
      memberPrincipalId: patchMemberships.principalId,
      ownerPrincipalId: patches.ownerPrincipalId,
      existence: patchVisibilityPolicies.existence,
      fineData: patchVisibilityPolicies.fineData,
      aggregateData: patchVisibilityPolicies.aggregateData,
      presence: patchVisibilityPolicies.presence,
      search: patchVisibilityPolicies.search,
      durableEvents: patchVisibilityPolicies.durableEvents,
      claimEnabled: patchVisibilityPolicies.claimEnabled,
      policyVersion: patchVisibilityPolicies.policyVersion,
    })
    .from(patches)
    .leftJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
    .leftJoin(
      patchMemberships,
      and(eq(patchMemberships.patchId, patches.id), eq(patchMemberships.principalId, principalId)),
    )
    .where(eq(patches.quiltId, quilt.id))
    .orderBy(asc(patches.row), asc(patches.column))

  return {
    topology: {
      quiltId: quilt.id,
      protocolVersion: quilt.protocolVersion,
      topology: quilt.topology as 'bounded' | 'toroidal',
      patchRows: quilt.patchRows,
      patchColumns: quilt.patchColumns,
      patchWidth: quilt.patchWidth,
      patchHeight: quilt.patchHeight,
    },
    principalId,
    patches: patchRows.map((patch) => {
      const candidatePolicy = {
        existence: patch.existence,
        fineData: patch.fineData,
        aggregateData: patch.aggregateData,
        presence: patch.presence,
        search: patch.search,
        durableEvents: patch.durableEvents,
        claimEnabled: patch.claimEnabled,
        policyVersion: patch.policyVersion,
      }
      return {
        id: patch.id,
        row: patch.row,
        column: patch.column,
        state: patch.state as QuiltDeliveryContext['patches'][number]['state'],
        revision: patch.revision,
        isMember: patch.ownerPrincipalId === principalId || patch.memberPrincipalId === principalId,
        isOwner: patch.ownerPrincipalId === principalId,
        policy: isPersistedVisibilityPolicy(candidatePolicy) ? candidatePolicy : null,
      }
    }),
  }
}

const authorizePatchDelivery = async (
  db: DatabaseClient,
  patchId: string,
  principalId: string,
  surface: VisibilitySurface,
): Promise<boolean> => {
  const [row] = await db
    .select({
      state: patches.state,
      ownerPrincipalId: patches.ownerPrincipalId,
      memberPrincipalId: patchMemberships.principalId,
      existence: patchVisibilityPolicies.existence,
      fineData: patchVisibilityPolicies.fineData,
      aggregateData: patchVisibilityPolicies.aggregateData,
      presence: patchVisibilityPolicies.presence,
      search: patchVisibilityPolicies.search,
      durableEvents: patchVisibilityPolicies.durableEvents,
      claimEnabled: patchVisibilityPolicies.claimEnabled,
      policyVersion: patchVisibilityPolicies.policyVersion,
    })
    .from(patches)
    .leftJoin(patchVisibilityPolicies, eq(patchVisibilityPolicies.patchId, patches.id))
    .leftJoin(
      patchMemberships,
      and(eq(patchMemberships.patchId, patches.id), eq(patchMemberships.principalId, principalId)),
    )
    .where(eq(patches.id, patchId))
    .limit(1)
  if (!row) return false

  const policy = {
    existence: row.existence,
    fineData: row.fineData,
    aggregateData: row.aggregateData,
    presence: row.presence,
    search: row.search,
    durableEvents: row.durableEvents,
    claimEnabled: row.claimEnabled,
    policyVersion: row.policyVersion,
  }
  return canAccessPatchSurface(surface, {
    state: row.state as QuiltDeliveryContext['patches'][number]['state'],
    policy: isPersistedVisibilityPolicy(policy) ? policy : null,
    subject: {
      authenticated: true,
      isMember: row.ownerPrincipalId === principalId || row.memberPrincipalId === principalId,
    },
  })
}

export const loadPatchDeliverySnapshot = async (patchId: string, options: {
  principalId: string
  surface?: 'fineData' | 'aggregateData'
  dualReadEnabled?: boolean
  canary?: boolean
  chunkIds?: string[]
}): Promise<{
  opSeq: number
  revision: number
  eventId?: string
  tiles: TileInstance[]
  tilesByChunk: Record<string, TileInstance[]>
}> => {
  const { db } = getDatabaseBundle()
  return db.transaction(async (tx) => {
    if (!await authorizePatchDelivery(tx, patchId, options.principalId, options.surface ?? 'fineData')) {
      throw new ResourceNotFoundError()
    }
    const state = await reconstructPatchStateWithDatabase(tx, patchId)
    const acceptedChunkIds = new Set(options.chunkIds ?? [])
    const scopedRows = acceptedChunkIds.size === 0
      ? []
      : await tx
          .select({
            tileId: tileSpatialRefs.tileId,
            chunkX: tileSpatialRefs.chunkX,
            chunkY: tileSpatialRefs.chunkY,
          })
          .from(tileSpatialRefs)
          .where(and(
            eq(tileSpatialRefs.patchId, patchId),
            inArray(sql<string>`concat(${tileSpatialRefs.chunkX}, ':', ${tileSpatialRefs.chunkY})`, Array.from(acceptedChunkIds)),
          ))
    const scopedTileIds = new Set(scopedRows.map((row) => row.tileId))
    const [compatibilityContext] = await tx
      .select({
        quiltId: quilts.id,
        legacyCanvasId: quilts.legacyCanvasId,
        topology: quilts.topology,
        patchRows: quilts.patchRows,
        patchColumns: quilts.patchColumns,
      })
      .from(patches)
      .innerJoin(quilts, eq(patches.quiltId, quilts.id))
      .where(eq(patches.id, patchId))
      .limit(1)
    let tilesForDelivery = acceptedChunkIds.size === 0
      ? state.tiles
      : state.tiles.filter((tile) => scopedTileIds.has(tile.id))

    if (
      options.dualReadEnabled === true
      &&
      compatibilityContext?.legacyCanvasId
      && compatibilityContext.topology === 'bounded'
      && compatibilityContext.patchRows === 1
      && compatibilityContext.patchColumns === 1
    ) {
      const legacyRows = await tx
        .select()
        .from(tiles)
        .where(eq(tiles.canvasId, compatibilityContext.legacyCanvasId))
        .orderBy(asc(tiles.createdAt), asc(tiles.id))
      const legacyTiles = legacyRows.map(mapTile)
      const parityReport = compareLegacyAndPatchTiles(legacyTiles, state.tiles)
      emitQuiltTelemetry({
        name: 'dual_read_parity',
        quiltId: compatibilityContext.quiltId,
        principalId: options.principalId,
        canary: options.canary ?? false,
        measurements: {
          legacyTileCount: parityReport.legacyTileCount,
          patchTileCount: parityReport.patchTileCount,
          mismatchCount: parityReport.mismatches.length
            + parityReport.missingFromLegacy.length
            + parityReport.missingFromPatch.length,
        },
        dimensions: { matched: parityReport.matches, readPath: 'legacy-patch' },
        details: parityReport.matches ? undefined : parityReport,
      })
      const parityTiles = parityReport.matches ? state.tiles : legacyTiles
      tilesForDelivery = acceptedChunkIds.size === 0
        ? parityTiles
        : parityTiles.filter((tile) => {
            const chunk = worldToChunk(tile.transform.position.x, tile.transform.position.y)
            return acceptedChunkIds.has(`${chunk.x}:${chunk.y}`)
          })
    }
    const [latestEvent] = await tx
      .select({ eventId: patchOperations.eventId })
      .from(patchOperations)
      .where(eq(patchOperations.patchId, patchId))
      .orderBy(desc(patchOperations.opSeq))
      .limit(1)

    return {
      opSeq: state.opSeq,
      revision: state.opSeq,
      eventId: latestEvent?.eventId,
      tiles: tilesForDelivery,
      tilesByChunk: Object.fromEntries(Array.from(acceptedChunkIds, (chunkId) => [
        chunkId,
        tilesForDelivery.filter((tile) => {
          if (scopedRows.length > 0) {
            return scopedRows.some((row) => row.tileId === tile.id && `${row.chunkX}:${row.chunkY}` === chunkId)
          }
          const chunk = worldToChunk(tile.transform.position.x, tile.transform.position.y)
          return `${chunk.x}:${chunk.y}` === chunkId
        }),
      ])),
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export type PatchDeliveryOperation = {
  eventId: string
  opSeq: number
  opType: 'tile_placed' | 'tile_removed'
  payload: unknown
  actorPrincipalId?: string
  createdAt: number
  chunkIds: string[]
}

export const loadPatchDeliveryOperationsAfter = async (
  patchId: string,
  opSeq: number,
  principalId: string,
  limit = 500,
): Promise<PatchDeliveryOperation[]> => {
  const { db } = getDatabaseBundle()
  if (!await authorizePatchDelivery(db, patchId, principalId, 'durableEvents')) {
    throw new ResourceNotFoundError()
  }
  const rows = await db
    .select({
      eventId: patchOperations.eventId,
      opSeq: patchOperations.opSeq,
      opType: patchOperations.opType,
      payload: patchOperations.payload,
      actorPrincipalId: patchOperations.actorPrincipalId,
      createdAt: patchOperations.createdAt,
    })
    .from(patchOperations)
    .where(and(eq(patchOperations.patchId, patchId), sql`${patchOperations.opSeq} > ${opSeq}`))
    .orderBy(asc(patchOperations.opSeq))
    .limit(limit)

  const placedTileIds = rows
    .filter((row) => row.opType === 'tile_placed' && isPlaceOperationPayload(row.payload))
    .map((row) => (row.payload as PlaceTilePayload).tileId)
  const spatialRows = placedTileIds.length === 0
    ? []
    : await db
        .select({
          tileId: tileSpatialRefs.tileId,
          chunkX: tileSpatialRefs.chunkX,
          chunkY: tileSpatialRefs.chunkY,
        })
        .from(tileSpatialRefs)
        .where(and(eq(tileSpatialRefs.patchId, patchId), inArray(tileSpatialRefs.tileId, placedTileIds)))

  return rows.map((row) => ({
    eventId: row.eventId,
    opSeq: row.opSeq,
    opType: row.opType as PatchDeliveryOperation['opType'],
    payload: row.payload,
    actorPrincipalId: row.actorPrincipalId ?? undefined,
    createdAt: toMillis(row.createdAt),
    chunkIds: isObjectRecord(row.payload) && Array.isArray(row.payload.chunkIds)
      ? row.payload.chunkIds.filter((chunkId): chunkId is string => typeof chunkId === 'string')
      : spatialRows
          .filter((spatialRow) => isPlaceOperationPayload(row.payload) && spatialRow.tileId === row.payload.tileId)
          .map((spatialRow) => `${spatialRow.chunkX}:${spatialRow.chunkY}`),
  }))
}

export const isAgentAssignedPatch = async (principalId: string, patchId: string): Promise<boolean> => {
  const { db } = getDatabaseBundle()
  const [assignment] = await db
    .select({ id: agentAssignments.id })
    .from(agentAssignments)
    .innerJoin(patches, eq(patches.quiltId, agentAssignments.quiltId))
    .where(and(
      eq(agentAssignments.agentPrincipalId, principalId),
      eq(agentAssignments.status, 'active'),
      eq(patches.id, patchId),
    ))
    .limit(1)
  return Boolean(assignment)
}

export const isAgentAssignedQuilt = async (principalId: string, quiltId: string): Promise<boolean> => {
  const { db } = getDatabaseBundle()
  const [assignment] = await db
    .select({ id: agentAssignments.id })
    .from(agentAssignments)
    .where(and(
      eq(agentAssignments.agentPrincipalId, principalId),
      eq(agentAssignments.quiltId, quiltId),
      eq(agentAssignments.status, 'active'),
    ))
    .limit(1)
  return Boolean(assignment)
}

export const savePatchSnapshot = async (patchId: string): Promise<{ opSeq: number; tiles: TileInstance[] }> => {
  const { db } = getDatabaseBundle()
  const state = await reconstructPatchState(patchId)
  await db
    .insert(patchSnapshots)
    .values({ id: randomUUID(), patchId, opSeq: state.opSeq, state: state.tiles })
    .onConflictDoNothing()
  return state
}

export const listPatchIds = async (): Promise<string[]> => {
  const { db } = getDatabaseBundle()
  const rows = await db.select({ id: patches.id }).from(patches).orderBy(asc(patches.id))
  return rows.map((patch) => patch.id)
}

export const pruneRetention = async (params: {
  operationCutoffMs: number
  snapshotCutoffMs: number
}): Promise<{ deletedOperations: number; deletedSnapshots: number; deletedIdempotencyKeys: number }> => {
  const { db } = getDatabaseBundle()
  const operationCutoff = new Date(Date.now() - params.operationCutoffMs)
  const snapshotCutoff = new Date(Date.now() - params.snapshotCutoffMs)
  const now = new Date()

  const staleSnapshots = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(lte(snapshots.createdAt, snapshotCutoff))

  const staleOperations = await db
    .select({ id: operationLog.id })
    .from(operationLog)
    .where(lte(operationLog.createdAt, operationCutoff))

  const stalePatchSnapshots = await db
    .select({ id: patchSnapshots.id })
    .from(patchSnapshots)
    .where(lte(patchSnapshots.createdAt, snapshotCutoff))

  const stalePatchOperations = await db
    .select({ id: patchOperations.id })
    .from(patchOperations)
    .where(lte(patchOperations.createdAt, operationCutoff))

  const staleIdempotencyKeys = await db
    .select({ key: idempotencyKeys.key, clientId: idempotencyKeys.clientId })
    .from(idempotencyKeys)
    .where(lte(idempotencyKeys.expiresAt, now))

  if (staleSnapshots.length > 0) {
    await db.delete(snapshots).where(inArray(snapshots.id, staleSnapshots.map((entry) => entry.id)))
  }

  if (staleOperations.length > 0) {
    await db.delete(operationLog).where(inArray(operationLog.id, staleOperations.map((entry) => entry.id)))
  }

  if (stalePatchSnapshots.length > 0) {
    await db.delete(patchSnapshots).where(inArray(patchSnapshots.id, stalePatchSnapshots.map((entry) => entry.id)))
  }

  if (stalePatchOperations.length > 0) {
    await db.delete(patchOperations).where(inArray(patchOperations.id, stalePatchOperations.map((entry) => entry.id)))
  }

  if (staleIdempotencyKeys.length > 0) {
    await db.delete(idempotencyKeys).where(lte(idempotencyKeys.expiresAt, now))
  }

  return {
    deletedOperations: staleOperations.length + stalePatchOperations.length,
    deletedSnapshots: staleSnapshots.length + stalePatchSnapshots.length,
    deletedIdempotencyKeys: staleIdempotencyKeys.length,
  }
}