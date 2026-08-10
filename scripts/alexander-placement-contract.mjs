export const CANONICAL_TOPOLOGY = Object.freeze({
  patchRows: 32,
  patchColumns: 32,
  patchWidth: 31.2,
  patchHeight: 20.4,
  originX: 0,
  originY: 0,
})

export const TILE_SHAPES = Object.freeze([
  'square',
  'triangle',
  'rectangle',
  'l-shape',
  'large-square',
  'circle',
  'right-triangle',
  'large-right-triangle',
])

export const MATERIAL_VARIANTS = Object.freeze(['ceramic', 'glass', 'stone'])

export const ALEXANDER_V1_DEFAULTS = Object.freeze({
  actor: 'user-or-operator',
  candidateBudget: 'configured',
  maxInFlight: 4,
  staleRevisionRetries: 2,
  cancellation: 'pause-and-resume',
  conflictPolicy: 'skip-and-record',
  geometry: Object.freeze({
    shape: 'square',
    material: 'ceramic',
    rotation: 0,
    mirrored: false,
  }),
})

export const ALEXANDER_DEPLOYMENT_REQUIREMENTS = Object.freeze({
  activeCanonicalQuilt: 'resolved-from-canonical-world-entry',
  targetRect: 'explicit-world-rectangle-per-operation',
  sourceToWorld: 'explicit-source-local-transform-per-operation',
  affectedPatchCursors: 'derived-from-live-quilt-cache',
  ownership: 'validated-from-live-runtime-state',
  fidelityThreshold: 'release-gate-confirmation-required',
})

const unit = 0.88

export const TILE_OUTLINES = Object.freeze({
  square: Object.freeze([
    Object.freeze({ x: -unit / 2, y: -unit / 2 }),
    Object.freeze({ x: unit / 2, y: -unit / 2 }),
    Object.freeze({ x: unit / 2, y: unit / 2 }),
    Object.freeze({ x: -unit / 2, y: unit / 2 }),
  ]),
})

const assertFinite = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`)
}

const assertPositive = (value, name) => {
  assertFinite(value, name)
  if (value <= 0) throw new RangeError(`${name} must be positive`)
}

const positiveModulo = (value, period) => ((value % period) + period) % period

const roundCoordinate = (value) => Number(value.toFixed(6))

export const canonicalizeWorldPoint = (point, topology = CANONICAL_TOPOLOGY) => {
  assertFinite(point.x, 'point.x')
  assertFinite(point.y, 'point.y')
  assertPositive(topology.patchRows, 'patchRows')
  assertPositive(topology.patchColumns, 'patchColumns')
  assertPositive(topology.patchWidth, 'patchWidth')
  assertPositive(topology.patchHeight, 'patchHeight')
  const width = topology.patchColumns * topology.patchWidth
  const height = topology.patchRows * topology.patchHeight
  return {
    x: positiveModulo(point.x - topology.originX, width) + topology.originX,
    y: positiveModulo(point.y - topology.originY, height) + topology.originY,
  }
}

export const mapSourcePointToWorld = ({ point, sourceDimensions, targetRect, transform, topology = CANONICAL_TOPOLOGY }) => {
  assertPositive(sourceDimensions.width, 'sourceDimensions.width')
  assertPositive(sourceDimensions.height, 'sourceDimensions.height')
  assertFinite(targetRect.minX, 'targetRect.minX')
  assertFinite(targetRect.maxX, 'targetRect.maxX')
  assertFinite(targetRect.minY, 'targetRect.minY')
  assertFinite(targetRect.maxY, 'targetRect.maxY')
  if (targetRect.maxX <= targetRect.minX || targetRect.maxY <= targetRect.minY) {
    throw new RangeError('targetRect must have positive spans')
  }
  assertFinite(transform.origin.x, 'transform.origin.x')
  assertFinite(transform.origin.y, 'transform.origin.y')
  assertFinite(transform.scale.x, 'transform.scale.x')
  assertFinite(transform.scale.y, 'transform.scale.y')
  if (transform.scale.x <= 0 || transform.scale.y <= 0) {
    throw new RangeError('transform.scale must be positive')
  }
  if (point.x < 0 || point.x >= sourceDimensions.width || point.y < 0 || point.y >= sourceDimensions.height) {
    throw new RangeError('source point must be inside source dimensions')
  }

  const normalized = {
    x: point.x / sourceDimensions.width,
    y: point.y / sourceDimensions.height,
  }
  const world = {
    x: transform.origin.x + normalized.x * transform.scale.x,
    y: transform.origin.y + normalized.y * transform.scale.y,
  }
  const bounded = {
    x: targetRect.minX + world.x,
    y: targetRect.minY + world.y,
  }
  const canonical = canonicalizeWorldPoint(bounded, topology)
  return {
    x: roundCoordinate(canonical.x),
    y: roundCoordinate(canonical.y),
  }
}

export const deriveFootprint = ({ shape, position, rotation = 0, mirrored = false }) => {
  if (!TILE_SHAPES.includes(shape)) throw new RangeError(`Unsupported tile shape: ${shape}`)
  if (shape !== 'square') throw new RangeError(`Geometry parity is not established for tile shape: ${shape}`)
  assertFinite(position.x, 'position.x')
  assertFinite(position.y, 'position.y')
  assertFinite(rotation, 'rotation')
  const sin = Math.sin(rotation)
  const cos = Math.cos(rotation)
  const points = TILE_OUTLINES.square.map((point) => {
    const mirroredX = mirrored ? -point.x : point.x
    return {
      x: position.x + mirroredX * cos - point.y * sin,
      y: position.y + mirroredX * sin + point.y * cos,
    }
  })
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

export const assertSupportedPlacement = (placement) => {
  if (!TILE_SHAPES.includes(placement.shape)) throw new RangeError(`Unsupported tile shape: ${placement.shape}`)
  if (!MATERIAL_VARIANTS.includes(placement.material)) throw new RangeError(`Unsupported material: ${placement.material}`)
  for (const value of [placement.position.x, placement.position.y, placement.rotation]) {
    assertFinite(value, 'placement transform')
  }
  return placement
}