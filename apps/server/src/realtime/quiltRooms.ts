import type {
  ChunkId,
  QuiltProtocolLimits,
  QuiltRoomOutcome,
  QuiltRoomRequest,
  QuiltTopologyHandshake,
} from '../contracts.js'
import type { PatchStateValue } from '../db/types.js'
import type { PersistedVisibilityPolicy } from '../domain/authorizationPolicy.js'
import { evaluatePatchVisibility } from '../domain/authorizationPolicy.js'

export type PatchRoomAccess = {
  patchId: string
  state: PatchStateValue
  publishesExistence: boolean
  publicFine: boolean
  publicAggregate: boolean
  principalFine: boolean
  principalAggregate: boolean
  principalPresence: boolean
  principalEvents: boolean
}

export const buildPatchRoomAccess = (patch: {
  id: string
  state: PatchStateValue
  isMember: boolean
  policy: PersistedVisibilityPolicy | null
}): PatchRoomAccess => {
  const publicAccess = evaluatePatchVisibility({
    state: patch.state,
    policy: patch.policy,
    subject: { authenticated: false, isMember: false },
  })
  const principalAccess = evaluatePatchVisibility({
    state: patch.state,
    policy: patch.policy,
    subject: { authenticated: true, isMember: patch.isMember },
  })

  return {
    patchId: patch.id,
    state: patch.state,
    publishesExistence: principalAccess.existence,
    publicFine: publicAccess.fineData,
    publicAggregate: publicAccess.aggregateData,
    principalFine: principalAccess.fineData,
    principalAggregate: principalAccess.aggregateData,
    principalPresence: principalAccess.presence,
    principalEvents: principalAccess.durableEvents,
  }
}

export type QuiltRoomResolutionContext = {
  topology: QuiltTopologyHandshake
  principalId?: string
  currentRoomIds: ReadonlySet<string>
  churnInWindow: number
  accessByAddress: ReadonlyMap<string, PatchRoomAccess>
  limits: QuiltProtocolLimits
}

export type ResolvedQuiltRoom = {
  requestId: string
  canonicalRoomId: string
  patchId: string
  kind: QuiltRoomRequest['kind']
  row: number
  column: number
  chunkIds: ChunkId[]
}

export type QuiltRoomResolution = {
  outcomes: QuiltRoomOutcome[]
  accepted: ResolvedQuiltRoom[]
}

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus

const roomId = (quiltId: string, row: number, column: number, kind: QuiltRoomRequest['kind']): string =>
  `quilt:${quiltId}:patch:${row}:${column}:${kind}`

const hasAccess = (
  kind: QuiltRoomRequest['kind'],
  access: PatchRoomAccess,
  hasPrincipal: boolean,
): boolean => {
  if (access.state === 'deleted' || access.state === 'deletion_requested') {
    return false
  }

  if (kind === 'fine') return hasPrincipal ? access.principalFine : access.publicFine
  if (kind === 'aggregate') return hasPrincipal ? access.principalAggregate : access.publicAggregate
  if (kind === 'presence') return hasPrincipal && access.principalPresence
  return hasPrincipal ? access.principalEvents : access.publicFine
}

const invalidOutcome = (requestId: string, reason: string): QuiltRoomOutcome => ({
  requestId,
  status: 'invalid',
  reason,
})

const budgetOutcome = (requestId: string, reason: string): QuiltRoomOutcome => ({
  requestId,
  status: 'budget-exceeded',
  reason,
})

export const resolveQuiltRooms = (
  requests: QuiltRoomRequest[],
  context: QuiltRoomResolutionContext,
): QuiltRoomResolution => {
  const outcomes: QuiltRoomOutcome[] = []
  const accepted: ResolvedQuiltRoom[] = []
  const acceptedByRoomId = new Map<string, ResolvedQuiltRoom>()
  let requestedChurn = 0

  for (const request of requests) {
    if (outcomes.length >= context.limits.maxRoomsPerRequest) {
      outcomes.push(budgetOutcome(request.requestId, 'ROOMS_PER_REQUEST'))
      continue
    }

    if (
      request.requestId.length === 0
      || !Number.isInteger(request.row)
      || !Number.isInteger(request.column)
      || (request.chunkIds?.some((chunkId) => !/^-?\d+:-?\d+$/.test(chunkId)) ?? false)
    ) {
      outcomes.push(invalidOutcome(request.requestId, 'INVALID_ROOM'))
      continue
    }

    const chunkIds = Array.from(new Set(request.chunkIds ?? []))
    if (chunkIds.length > context.limits.maxChunksPerRequest) {
      outcomes.push(budgetOutcome(request.requestId, 'CHUNKS_PER_REQUEST'))
      continue
    }
    if (request.kind !== 'presence' && chunkIds.length === 0) {
      outcomes.push(invalidOutcome(request.requestId, 'CHUNK_SCOPE_REQUIRED'))
      continue
    }

    const row = context.topology.topology === 'toroidal'
      ? positiveModulo(request.row, context.topology.patchRows)
      : request.row
    const column = context.topology.topology === 'toroidal'
      ? positiveModulo(request.column, context.topology.patchColumns)
      : request.column

    if (row < 0 || row >= context.topology.patchRows || column < 0 || column >= context.topology.patchColumns) {
      outcomes.push(invalidOutcome(request.requestId, 'PATCH_OUT_OF_RANGE'))
      continue
    }

    const canonicalRoomId = roomId(context.topology.quiltId, row, column, request.kind)
    const existingAccepted = acceptedByRoomId.get(canonicalRoomId)
    if (existingAccepted) {
      const mergedChunkIds = Array.from(new Set([...existingAccepted.chunkIds, ...chunkIds]))
      if (mergedChunkIds.length > context.limits.maxChunksPerRequest) {
        outcomes.push(budgetOutcome(request.requestId, 'CHUNKS_PER_REQUEST'))
        continue
      }
      existingAccepted.chunkIds = mergedChunkIds
      outcomes.push({ requestId: request.requestId, status: 'accepted', canonicalRoomId })
      continue
    }

    const access = context.accessByAddress.get(`${row}:${column}`)
    if (!access || !access.publishesExistence || !hasAccess(request.kind, access, Boolean(context.principalId))) {
      outcomes.push({ requestId: request.requestId, status: 'forbidden', reason: 'NOT_VISIBLE' })
      continue
    }

    const isNewRoom = !context.currentRoomIds.has(canonicalRoomId)
    if (isNewRoom && context.currentRoomIds.size + acceptedByRoomId.size >= context.limits.maxRoomsPerConnection) {
      outcomes.push(budgetOutcome(request.requestId, 'ROOMS_PER_CONNECTION'))
      continue
    }

    if (isNewRoom) requestedChurn += 1
    if (context.churnInWindow + requestedChurn > context.limits.maxRoomChurnPerMinute) {
      outcomes.push(budgetOutcome(request.requestId, 'ROOM_CHURN'))
      continue
    }

    const resolvedRoom = {
      requestId: request.requestId,
      canonicalRoomId,
      patchId: access.patchId,
      kind: request.kind,
      row,
      column,
      chunkIds,
    }
    acceptedByRoomId.set(canonicalRoomId, resolvedRoom)
    accepted.push(resolvedRoom)
    outcomes.push({ requestId: request.requestId, status: 'accepted', canonicalRoomId })
  }

  return { outcomes, accepted }
}