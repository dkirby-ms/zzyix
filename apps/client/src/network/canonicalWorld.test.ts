import { describe, expect, it, vi } from 'vitest'
import { discoverCanonicalWorld } from './session'

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
  initialPatch: { id: '30000000-0000-4000-8000-000000000001', row: 0, column: 0 },
}

describe('canonical world discovery', () => {
  it('maps the authenticated descriptor without touching session storage', async () => {
    const authenticatedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(descriptor), { status: 200 }),
    )
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')

    await expect(discoverCanonicalWorld(authenticatedFetch, 'https://app.example.test')).resolves.toEqual(descriptor)
    expect(authenticatedFetch).toHaveBeenCalledWith('https://app.example.test/quilts/canonical', { method: 'GET' })
    expect(storageSpy).not.toHaveBeenCalled()
  })

  it('rejects unavailable and non-v2 descriptors', async () => {
    const unavailableFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    await expect(discoverCanonicalWorld(unavailableFetch, 'https://app.example.test'))
      .rejects.toThrow('Canonical world is unavailable (503)')

    const invalidFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...descriptor, protocolVersion: 1 }), { status: 200 }),
    )
    await expect(discoverCanonicalWorld(invalidFetch, 'https://app.example.test'))
      .rejects.toThrow('Canonical world descriptor is invalid')
  })
})