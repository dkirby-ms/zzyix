import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, lte, max, sql } from 'drizzle-orm'
import type { ClientPresence, Session, TileInstance } from '../contracts'
import type { PlaceTilePayload, RemoveTilePayload, TilePlacedPayload, TileRemovedPayload } from '../contracts'
import { canvases, idempotencyKeys, operationLog, participants, snapshots, tiles } from './schema'
import { getDatabaseBundle, type DatabaseClient } from './client'

export type AuthoritativeSessionRecord = {
  session: Session
  clients: ClientPresence[]
  lastOpSeq: number
  revision: number
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

export type ReplaySessionRecord = AuthoritativeSessionRecord & {
  snapshotOpSeq: number
  replayedOperations: PersistedOperationRecord[]
}

export type SessionSummaryRecord = {
  id: string
  participantCount: number
}

const toMillis = (value: Date): number => value.getTime()

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

export const loadSessionRecord = async (sessionId: string): Promise<AuthoritativeSessionRecord> => {
  const { db } = getDatabaseBundle()

  const now = new Date()
  await db.insert(canvases).values({ id: sessionId, createdAt: now, updatedAt: now }).onConflictDoNothing()

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
    clients: participantRows.map(mapClient),
    lastOpSeq: latestOpSeq[0]?.value ?? 0,
    revision: canvas.version,
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

export const listSessionSummaries = async (): Promise<SessionSummaryRecord[]> => {
  const { db } = getDatabaseBundle()

  const rows = await db
    .select({
      id: canvases.id,
      participantCount: sql<number>`count(${participants.clientId})`,
      updatedAt: canvases.updatedAt,
    })
    .from(canvases)
    .leftJoin(participants, and(eq(participants.canvasId, canvases.id), isNull(participants.leftAt)))
    .groupBy(canvases.id, canvases.updatedAt)
    .orderBy(desc(canvases.updatedAt), asc(canvases.id))

  return rows.map((row) => ({
    id: row.id,
    participantCount: Number(row.participantCount),
  }))
}

export const persistTilePlacement = async (params: {
  sessionId: string
  payload: PlaceTilePayload
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

    await tx.insert(tiles).values({
      id: tileId,
      canvasId: sessionId,
      shape: payload.shape,
      color: payload.color,
      material: payload.material,
      posX: payload.transform.position.x,
      posY: payload.transform.position.y,
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

  if (staleIdempotencyKeys.length > 0) {
    await db.delete(idempotencyKeys).where(lte(idempotencyKeys.expiresAt, now))
  }

  return {
    deletedOperations: staleOperations.length,
    deletedSnapshots: staleSnapshots.length,
    deletedIdempotencyKeys: staleIdempotencyKeys.length,
  }
}