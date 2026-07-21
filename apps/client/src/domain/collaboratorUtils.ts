import type { ClientPresence } from '../../../server/src/contracts'

export type RemoteCollaborator = {
  clientId: string
  present: boolean
  pointer?: { x: number; y: number }
  selectionTileId?: string
  lastSeenAt: number
}

export type RemoteCollaboratorMap = Record<string, RemoteCollaborator>

export const COLLABORATOR_SIGNAL_TTL_MS = 8_000
export const COLLABORATOR_CLEANUP_INTERVAL_MS = 1_000
export const COLLABORATION_EMIT_INTERVAL_MS = 40

export const updateCollaborator = (
  collaborators: RemoteCollaboratorMap,
  clientId: string,
  patch: Partial<RemoteCollaborator>,
): RemoteCollaboratorMap => {
  const previous = collaborators[clientId]
  const hasPresent = Object.prototype.hasOwnProperty.call(patch, 'present')
  const hasPointer = Object.prototype.hasOwnProperty.call(patch, 'pointer')
  const hasSelection = Object.prototype.hasOwnProperty.call(patch, 'selectionTileId')
  const next: RemoteCollaborator = {
    clientId,
    present: hasPresent ? (patch.present as boolean) : previous?.present ?? false,
    pointer: hasPointer ? patch.pointer : previous?.pointer,
    selectionTileId: hasSelection ? patch.selectionTileId : previous?.selectionTileId,
    lastSeenAt: patch.lastSeenAt ?? previous?.lastSeenAt ?? Date.now(),
  }

  return {
    ...collaborators,
    [clientId]: next,
  }
}

export const mergeCollaboratorsFromSnapshot = (
  previous: RemoteCollaboratorMap,
  snapshotClients: ClientPresence[],
): RemoteCollaboratorMap => {
  const next: RemoteCollaboratorMap = {}
  const now = Date.now()
  const snapshotClientIds = new Set<string>()

  for (const client of snapshotClients) {
    snapshotClientIds.add(client.clientId)
    const existing = previous[client.clientId]
    next[client.clientId] = {
      clientId: client.clientId,
      present: true,
      pointer: client.pointer ?? existing?.pointer,
      selectionTileId: existing?.selectionTileId,
      lastSeenAt: now,
    }
  }

  for (const [remoteClientId, collaborator] of Object.entries(previous)) {
    if (snapshotClientIds.has(remoteClientId)) {
      continue
    }

    if (now - collaborator.lastSeenAt > COLLABORATOR_SIGNAL_TTL_MS && !collaborator.present) {
      continue
    }

    next[remoteClientId] = {
      ...collaborator,
      present: false,
    }
  }

  return next
}

export const evictStaleCollaboratorSignals = (
  previous: RemoteCollaboratorMap,
  now: number,
): RemoteCollaboratorMap => {
  let hasChanges = false
  const next: RemoteCollaboratorMap = {}

  for (const [clientId, collaborator] of Object.entries(previous)) {
    const age = now - collaborator.lastSeenAt

    if (age <= COLLABORATOR_SIGNAL_TTL_MS) {
      next[clientId] = collaborator
      continue
    }

    if (collaborator.present) {
      next[clientId] = {
        ...collaborator,
        present: false,
        pointer: undefined,
        selectionTileId: undefined,
      }
      if (
        collaborator.pointer !== undefined
        || collaborator.selectionTileId !== undefined
        || collaborator.present
      ) {
        hasChanges = true
      }
      continue
    }

    hasChanges = true
  }

  return hasChanges ? next : previous
}

export const formatCollaboratorLabel = (remoteClientId: string, localClientId: string): string => {
  if (remoteClientId === localClientId) {
    return 'You'
  }

  return remoteClientId.slice(0, 8)
}
