import type { CanonicalWorldEntryDescriptor } from '../../../server/src/contracts'
import { derivePlacementBounds } from './placementSolver'
import type { MosaicDeploymentContext, MosaicManifest } from './mosaicImport'

export const ALEXANDER_PATCH_MANIFEST_PATH = '/alexander-patch-manifest.json'

type WorldPoint = { x: number; y: number }

const wrap = (value: number, size: number): number => ((value % size) + size) % size

const normalizeToAtlasPoint = (
  descriptor: CanonicalWorldEntryDescriptor,
  point: WorldPoint,
): WorldPoint => {
  if (descriptor.topology !== 'toroidal') {
    return point
  }

  const width = descriptor.patchColumns * descriptor.patchWidth
  const height = descriptor.patchRows * descriptor.patchHeight
  return {
    x: descriptor.originX + wrap(point.x - descriptor.originX, width),
    y: descriptor.originY + wrap(point.y - descriptor.originY, height),
  }
}

const getOwnedPatchDeployment = (descriptor: CanonicalWorldEntryDescriptor): MosaicDeploymentContext => {
  const { assignedPatch, originX, originY, patchHeight, patchWidth } = descriptor
  const minX = originX + assignedPatch.column * patchWidth
  const minY = originY + assignedPatch.row * patchHeight

  return {
    targetRect: {
      minX,
      maxX: minX + patchWidth,
      minY,
      maxY: minY + patchHeight,
    },
    sourceToWorld: {
      origin: { x: minX, y: minY },
      scale: { x: patchWidth, y: patchHeight },
    },
  }
}

export const selectAlexanderOwnedPatch = (
  descriptor: CanonicalWorldEntryDescriptor,
  point: WorldPoint,
): MosaicDeploymentContext | undefined => {
  const atlasPoint = normalizeToAtlasPoint(descriptor, point)
  const column = Math.floor((atlasPoint.x - descriptor.originX) / descriptor.patchWidth)
  const row = Math.floor((atlasPoint.y - descriptor.originY) / descriptor.patchHeight)
  if (row !== descriptor.assignedPatch.row || column !== descriptor.assignedPatch.column) {
    return undefined
  }

  const deployment = getOwnedPatchDeployment(descriptor)
  const { minX, maxX, minY, maxY } = deployment.targetRect
  return atlasPoint.x >= minX && atlasPoint.x < maxX && atlasPoint.y >= minY && atlasPoint.y < maxY
    ? deployment
    : undefined
}

export const filterAlexanderManifestForDeployment = (
  manifest: MosaicManifest,
  deployment: MosaicDeploymentContext,
): MosaicManifest => {
  const placements = manifest.placements
    .filter((placement) => {
      const transform = {
        position: {
          x: deployment.sourceToWorld.origin.x + placement.source.normalizedAnchor.x * deployment.sourceToWorld.scale.x,
          y: deployment.sourceToWorld.origin.y + placement.source.normalizedAnchor.y * deployment.sourceToWorld.scale.y,
        },
        rotation: placement.tile.rotation,
        mirrored: placement.tile.mirrored ?? false,
      }
      const footprint = derivePlacementBounds(placement.tile.shape, transform)
      return footprint.minX >= deployment.targetRect.minX
        && footprint.maxX <= deployment.targetRect.maxX
        && footprint.minY >= deployment.targetRect.minY
        && footprint.maxY <= deployment.targetRect.maxY
    })

  return {
    ...manifest,
    budget: {
      placementBudget: placements.length,
      accepted: placements.length,
    },
    placements,
    provenance: {
      ...manifest.provenance,
      manifestSha256: '',
    },
  }
}