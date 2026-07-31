import { describe, expect, it, vi } from 'vitest'
import { clearCanonicalPatchLink, discoverCanonicalWorld } from './session'

const descriptor = {
  quiltId: '10000000-0000-4000-8000-000000000001',
  legacyCanvasId: '20000000-0000-4000-8000-000000000001',
  topology: 'toroidal' as const,
  protocolVersion: 2 as const,
  patchRows: 2,
  patchColumns: 3,
  patchWidth: 10,
  patchHeight: 8,
  originX: 0,
  originY: 0,
  generation: 1,
  entryAttemptId: '40000000-0000-4000-8000-000000000001',
  initialPatch: { id: '30000000-0000-4000-8000-000000000001', row: 0, column: 0 },
  assignedPatch: { id: '30000000-0000-4000-8000-000000000002', row: 1, column: 2 },
}

describe('canonical world discovery', () => {
  it('clears patch navigation without removing unrelated query parameters', () => {
    window.history.replaceState(null, '', '/?quilt=quilt-1&patch=patch-1&debug=true')

    clearCanonicalPatchLink()

    expect(window.location.search).toBe('?debug=true')
  })

  it('maps the authenticated descriptor without touching session storage', async () => {
    const authenticatedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(descriptor), { status: 200 }),
    )
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')

    await expect(discoverCanonicalWorld(authenticatedFetch, 'https://app.example.test')).resolves.toEqual(descriptor)
    expect(authenticatedFetch).toHaveBeenCalledWith('https://app.example.test/quilts/canonical', { method: 'GET' })
    expect(storageSpy).not.toHaveBeenCalled()
  })

  it('rejects unavailable, non-v2, and caller-manufactured descriptors', async () => {
    const unavailableFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    await expect(discoverCanonicalWorld(unavailableFetch, 'https://app.example.test'))
      .rejects.toThrow('Canonical world is unavailable (503)')

    const invalidFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...descriptor, protocolVersion: 1 }), { status: 200 }),
    )
    await expect(discoverCanonicalWorld(invalidFetch, 'https://app.example.test'))
      .rejects.toThrow('Canonical world descriptor is invalid')

    const missingAttemptFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...descriptor, entryAttemptId: undefined }), { status: 200 }),
    )
    await expect(discoverCanonicalWorld(missingAttemptFetch, 'https://app.example.test'))
      .rejects.toThrow('Canonical world descriptor is invalid')

    const missingAssignmentFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...descriptor, assignedPatch: undefined }), { status: 200 }),
    )
    await expect(discoverCanonicalWorld(missingAssignmentFetch, 'https://app.example.test'))
      .rejects.toThrow('Canonical world descriptor is invalid')
  })
})