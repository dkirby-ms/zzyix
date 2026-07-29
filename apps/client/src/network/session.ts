import type {
  CanonicalPatchNavigation,
  CanonicalWorldDescriptor,
  EligibleCanonicalPatchesResponse,
  OwnershipCommandResponse,
} from '../../../server/src/contracts'

const CLIENT_STORAGE_KEY = 'zzyix_client_id'

export type ChunkId = `${number}:${number}`

export const toChunkId = (chunkX: number, chunkY: number): ChunkId => `${chunkX}:${chunkY}`

export const parseChunkId = (chunkId: ChunkId): { x: number; y: number } => {
  const [rawX, rawY] = chunkId.split(':')
  return {
    x: Number(rawX),
    y: Number(rawY),
  }
}

export const claimPatch = async (
  authenticatedFetch: typeof fetch,
  apiOrigin: string,
  patchId: string,
): Promise<void> => {
  const response = await authenticatedFetch(`${apiOrigin}/ownership/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: crypto.randomUUID(), patchId }),
  })
  const result = await response.json() as OwnershipCommandResponse
  if (!response.ok || result.status !== 'succeeded') {
    throw new Error('Failed to claim the new canvas patch')
  }
}

export const discoverCanonicalWorld = async (
  authenticatedFetch: typeof fetch,
  apiOrigin: string,
): Promise<CanonicalWorldDescriptor> => {
  const response = await authenticatedFetch(`${apiOrigin}/quilts/canonical`, { method: 'GET' })
  if (!response.ok) throw new Error(`Canonical world is unavailable (${response.status})`)

  const descriptor = await response.json() as Partial<CanonicalWorldDescriptor>
  if (descriptor.protocolVersion !== 2 || typeof descriptor.quiltId !== 'string' || descriptor.quiltId === '') {
    throw new Error('Canonical world descriptor is invalid')
  }

  return descriptor as CanonicalWorldDescriptor
}

export const discoverEligibleCanonicalPatches = async (
  authenticatedFetch: typeof fetch,
  apiOrigin: string,
): Promise<EligibleCanonicalPatchesResponse> => {
  const response = await authenticatedFetch(`${apiOrigin}/quilts/canonical/patches/eligible`, { method: 'GET' })
  if (!response.ok) throw new Error(`Eligible patches are unavailable (${response.status})`)
  return response.json() as Promise<EligibleCanonicalPatchesResponse>
}

export const resolveCanonicalPatchNavigation = async (
  authenticatedFetch: typeof fetch,
  apiOrigin: string,
  quiltId: string,
  patchId: string,
): Promise<CanonicalPatchNavigation> => {
  const response = await authenticatedFetch(
    `${apiOrigin}/quilts/${encodeURIComponent(quiltId)}/patches/${encodeURIComponent(patchId)}/navigation`,
    { method: 'GET' },
  )
  if (!response.ok) throw new Error(`Patch navigation is unavailable (${response.status})`)
  return response.json() as Promise<CanonicalPatchNavigation>
}

export const getCanonicalPatchLink = (): { quiltId: string; patchId: string } | null => {
  const params = new URLSearchParams(window.location.search)
  const quiltId = params.get('quilt')
  const patchId = params.get('patch')
  return quiltId && patchId ? { quiltId, patchId } : null
}

export const setCanonicalPatchLink = (navigation: CanonicalPatchNavigation): void => {
  const url = new URL(window.location.href)
  url.searchParams.set('quilt', navigation.quiltId)
  url.searchParams.set('patch', navigation.patchId)
  window.history.replaceState(window.history.state, '', url)
}

export const ensureClientId = (): string => {
  const stored = localStorage.getItem(CLIENT_STORAGE_KEY)
  if (stored) return stored

  const id = crypto.randomUUID()
  localStorage.setItem(CLIENT_STORAGE_KEY, id)
  return id
}