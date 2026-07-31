export type QuiltTopology = {
  patchRows: number
  patchColumns: number
  patchWidth: number
  patchHeight: number
}

export type TopologyPoint = { x: number; y: number }

export type CanonicalPoint = {
  point: TopologyPoint
  patch: { row: number; column: number }
  local: TopologyPoint
}

export type TopologyRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type PeriodicImage = {
  offset: TopologyPoint
  rect: TopologyRect
}

export type GridAddress = {
  column: number
  row: number
}

const assertFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`)
  }
}

const assertPositive = (value: number, name: string): void => {
  assertFinite(value, name)
  if (value <= 0) {
    throw new RangeError(`${name} must be positive`)
  }
}

const assertPositiveInteger = (value: number, name: string): void => {
  assertPositive(value, name)
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer`)
  }
}

const validateTopology = (topology: QuiltTopology): { width: number; height: number } => {
  assertPositiveInteger(topology.patchRows, 'patchRows')
  assertPositiveInteger(topology.patchColumns, 'patchColumns')
  assertPositive(topology.patchWidth, 'patchWidth')
  assertPositive(topology.patchHeight, 'patchHeight')

  const width = topology.patchColumns * topology.patchWidth
  const height = topology.patchRows * topology.patchHeight
  assertPositive(width, 'quiltWidth')
  assertPositive(height, 'quiltHeight')
  return { width, height }
}

const validateRect = (rect: TopologyRect, name: string): void => {
  assertFinite(rect.minX, `${name}.minX`)
  assertFinite(rect.maxX, `${name}.maxX`)
  assertFinite(rect.minY, `${name}.minY`)
  assertFinite(rect.maxY, `${name}.maxY`)
  if (rect.maxX < rect.minX || rect.maxY < rect.minY) {
    throw new RangeError(`${name} must have non-negative spans`)
  }
}

export const positiveModulo = (value: number, period: number): number => {
  assertFinite(value, 'value')
  assertPositive(period, 'period')
  return ((value % period) + period) % period
}

export const resolveCanonicalPoint = (
  point: TopologyPoint,
  topology: QuiltTopology,
): CanonicalPoint => {
  assertFinite(point.x, 'point.x')
  assertFinite(point.y, 'point.y')
  const { width, height } = validateTopology(topology)
  const canonical = {
    x: positiveModulo(point.x, width),
    y: positiveModulo(point.y, height),
  }
  const column = Math.min(Math.floor(canonical.x / topology.patchWidth), topology.patchColumns - 1)
  const row = Math.min(Math.floor(canonical.y / topology.patchHeight), topology.patchRows - 1)

  return {
    point: canonical,
    patch: { row, column },
    local: {
      x: canonical.x - column * topology.patchWidth,
      y: canonical.y - row * topology.patchHeight,
    },
  }
}

export const nearestImageDelta = (delta: number, period: number): number => {
  assertFinite(delta, 'delta')
  assertPositive(period, 'period')
  return positiveModulo(delta + period / 2, period) - period / 2
}

const decomposeAxis = (min: number, max: number, period: number): Array<[number, number]> => {
  const span = max - min
  if (span >= period) {
    return [[0, period]]
  }

  const canonicalMin = positiveModulo(min, period)
  if (span === 0) {
    return [[canonicalMin, canonicalMin]]
  }

  const canonicalMax = canonicalMin + span
  if (canonicalMax <= period) {
    return [[canonicalMin, canonicalMax]]
  }

  return [
    [canonicalMin, period],
    [0, canonicalMax - period],
  ]
}

export const decomposeWrappedViewport = (
  viewport: TopologyRect,
  topology: QuiltTopology,
): TopologyRect[] => {
  validateRect(viewport, 'viewport')
  const { width, height } = validateTopology(topology)
  const xIntervals = decomposeAxis(viewport.minX, viewport.maxX, width)
  const yIntervals = decomposeAxis(viewport.minY, viewport.maxY, height)

  return xIntervals.flatMap(([minX, maxX]) =>
    yIntervals.map(([minY, maxY]) => ({ minX, maxX, minY, maxY })),
  )
}

export const enumeratePeriodicImages = (
  canonicalRect: TopologyRect,
  viewport: TopologyRect,
  topology: QuiltTopology,
): PeriodicImage[] => {
  validateRect(canonicalRect, 'canonicalRect')
  validateRect(viewport, 'viewport')
  const { width, height } = validateTopology(topology)
  if (
    canonicalRect.minX < 0 ||
    canonicalRect.maxX > width ||
    canonicalRect.minY < 0 ||
    canonicalRect.maxY > height
  ) {
    throw new RangeError('canonicalRect must be within the canonical quilt')
  }

  const minImageX = Math.floor((viewport.minX - canonicalRect.maxX) / width) + 1
  const maxImageX = Math.ceil((viewport.maxX - canonicalRect.minX) / width) - 1
  const minImageY = Math.floor((viewport.minY - canonicalRect.maxY) / height) + 1
  const maxImageY = Math.ceil((viewport.maxY - canonicalRect.minY) / height) - 1
  const images: PeriodicImage[] = []

  for (let imageX = minImageX; imageX <= maxImageX; imageX += 1) {
    for (let imageY = minImageY; imageY <= maxImageY; imageY += 1) {
      const offset = { x: imageX * width, y: imageY * height }
      images.push({
        offset,
        rect: {
          minX: canonicalRect.minX + offset.x,
          maxX: canonicalRect.maxX + offset.x,
          minY: canonicalRect.minY + offset.y,
          maxY: canonicalRect.maxY + offset.y,
        },
      })
    }
  }

  return images
}

export const canonicalizeGridAddress = (
  address: GridAddress,
  columnCount: number,
  rowCount: number,
): GridAddress => {
  assertFinite(address.column, 'address.column')
  assertFinite(address.row, 'address.row')
  if (!Number.isInteger(address.column) || !Number.isInteger(address.row)) {
    throw new RangeError('Grid address coordinates must be integers')
  }
  assertPositiveInteger(columnCount, 'columnCount')
  assertPositiveInteger(rowCount, 'rowCount')
  return {
    column: positiveModulo(address.column, columnCount),
    row: positiveModulo(address.row, rowCount),
  }
}

export const deduplicateCanonicalSubscriptions = (
  addresses: GridAddress[],
  columnCount: number,
  rowCount: number,
): GridAddress[] => {
  const canonical = new Map<string, GridAddress>()
  for (const address of addresses) {
    const resolved = canonicalizeGridAddress(address, columnCount, rowCount)
    canonical.set(`${resolved.column}:${resolved.row}`, resolved)
  }
  return Array.from(canonical.values())
}