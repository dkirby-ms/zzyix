import { getTileDefinition, type TileShape } from '../domain/tileGeometry'
import type { Vec2 } from '../domain/math2d'

type NormalizeOptions = {
  size?: number
  padding?: number
}

type NormalizedPoint = {
  x: number
  y: number
}

export const DEFAULT_PREVIEW_SIZE = 64
export const DEFAULT_PREVIEW_PADDING = 6

const toPathData = (points: NormalizedPoint[]): string => {
  if (points.length === 0) {
    return ''
  }

  const [first, ...rest] = points
  const commands = [`M ${first.x} ${first.y}`]

  for (const point of rest) {
    commands.push(`L ${point.x} ${point.y}`)
  }

  commands.push('Z')
  return commands.join(' ')
}

const normalizeOutline = (outline: Vec2[], options?: NormalizeOptions): NormalizedPoint[] => {
  if (outline.length === 0) {
    return []
  }

  const size = options?.size ?? DEFAULT_PREVIEW_SIZE
  const padding = options?.padding ?? DEFAULT_PREVIEW_PADDING

  const minX = Math.min(...outline.map((point) => point.x))
  const maxX = Math.max(...outline.map((point) => point.x))
  const minY = Math.min(...outline.map((point) => point.y))
  const maxY = Math.max(...outline.map((point) => point.y))

  const width = maxX - minX
  const height = maxY - minY
  const drawable = Math.max(0, size - padding * 2)

  const shapeSize = Math.max(width, height, Number.EPSILON)
  const scale = drawable / shapeSize
  const offsetX = (size - width * scale) / 2
  const offsetY = (size - height * scale) / 2

  return outline.map((point) => ({
    x: Number((offsetX + (point.x - minX) * scale).toFixed(3)),
    y: Number((offsetY + (point.y - minY) * scale).toFixed(3)),
  }))
}

export const createTilePreviewPath = (shape: TileShape, options?: NormalizeOptions): string => {
  const outline = getTileDefinition(shape).outline
  const normalized = normalizeOutline(outline, options)
  return toPathData(normalized)
}