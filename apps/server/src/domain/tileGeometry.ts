import { rotate, vec2 } from './math2d.js'
import type { Vec2 } from './math2d.js'

export type TileShape =
  | 'square'
  | 'triangle'
  | 'rectangle'
  | 'l-shape'
  | 'large-square'
  | 'circle'
  | 'right-triangle'
  | 'large-right-triangle'
export type MaterialVariant = 'ceramic' | 'glass' | 'stone'
export type ConfidenceState = 'valid' | 'near-valid' | 'invalid'

export type Transform2D = {
  position: Vec2
  rotation: number
  mirrored?: boolean
}

export type ConvexPolygon = Vec2[]

export type TileDefinition = {
  outline: Vec2[]
  convexParts: ConvexPolygon[]
}

const unit = 0.88

const squareOutline: Vec2[] = [
  vec2(-unit / 2, -unit / 2),
  vec2(unit / 2, -unit / 2),
  vec2(unit / 2, unit / 2),
  vec2(-unit / 2, unit / 2),
]

const rectangleOutline: Vec2[] = [
  vec2(-unit * 0.68, -unit * 0.36),
  vec2(unit * 0.68, -unit * 0.36),
  vec2(unit * 0.68, unit * 0.36),
  vec2(-unit * 0.68, unit * 0.36),
]

const triangleOutline: Vec2[] = [
  vec2(0, unit * 0.57),
  vec2(-unit * 0.58, -unit * 0.54),
  vec2(unit * 0.58, -unit * 0.54),
]

const lOutline: Vec2[] = [
  vec2(-unit * 0.62, -unit * 0.62),
  vec2(unit * 0.62, -unit * 0.62),
  vec2(unit * 0.62, -unit * 0.12),
  vec2(-unit * 0.12, -unit * 0.12),
  vec2(-unit * 0.12, unit * 0.62),
  vec2(-unit * 0.62, unit * 0.62),
]

const largeSquareOutline: Vec2[] = [
  vec2(-unit, -unit),
  vec2(unit, -unit),
  vec2(unit, unit),
  vec2(-unit, unit),
]

const circleRadius = unit / Math.sqrt(Math.PI)
const circleSegments = 24
const circleOutline: Vec2[] = Array.from({ length: circleSegments }, (_, index) => {
  const theta = (index / circleSegments) * Math.PI * 2
  return vec2(Math.cos(theta) * circleRadius, Math.sin(theta) * circleRadius)
})

const rightTriangleOutline: Vec2[] = [
  vec2(-unit / 3, -unit / 3),
  vec2((2 * unit) / 3, -unit / 3),
  vec2(-unit / 3, (2 * unit) / 3),
]

const largeRightTriangleOutline: Vec2[] = [
  vec2((-2 * unit) / 3, (-2 * unit) / 3),
  vec2((4 * unit) / 3, (-2 * unit) / 3),
  vec2((-2 * unit) / 3, (4 * unit) / 3),
]

const defs: Record<TileShape, TileDefinition> = {
  square: {
    outline: squareOutline,
    convexParts: [squareOutline],
  },
  rectangle: {
    outline: rectangleOutline,
    convexParts: [rectangleOutline],
  },
  triangle: {
    outline: triangleOutline,
    convexParts: [triangleOutline],
  },
  'l-shape': {
    outline: lOutline,
    convexParts: [
      [
        vec2(-unit * 0.62, -unit * 0.62),
        vec2(unit * 0.62, -unit * 0.62),
        vec2(unit * 0.62, -unit * 0.12),
        vec2(-unit * 0.62, -unit * 0.12),
      ],
      [
        vec2(-unit * 0.62, -unit * 0.12),
        vec2(-unit * 0.12, -unit * 0.12),
        vec2(-unit * 0.12, unit * 0.62),
        vec2(-unit * 0.62, unit * 0.62),
      ],
    ],
  },
  'large-square': {
    outline: largeSquareOutline,
    convexParts: [largeSquareOutline],
  },
  circle: {
    outline: circleOutline,
    convexParts: [circleOutline],
  },
  'right-triangle': {
    outline: rightTriangleOutline,
    convexParts: [rightTriangleOutline],
  },
  'large-right-triangle': {
    outline: largeRightTriangleOutline,
    convexParts: [largeRightTriangleOutline],
  },
}

const mirrorPoint = (point: Vec2): Vec2 => vec2(-point.x, point.y)

const transformPoint = (point: Vec2, transform: Transform2D): Vec2 => {
  const mirroredPoint = transform.mirrored ? mirrorPoint(point) : point
  const rotatedPoint = rotate(mirroredPoint, transform.rotation)
  return vec2(rotatedPoint.x + transform.position.x, rotatedPoint.y + transform.position.y)
}

export const getTileDefinition = (shape: TileShape): TileDefinition => defs[shape]

export const transformPolygon = (polygon: Vec2[], transform: Transform2D): Vec2[] =>
  polygon.map((point) => transformPoint(point, transform))

export const transformTile = (shape: TileShape, transform: Transform2D): TileDefinition => {
  const def = getTileDefinition(shape)
  return {
    outline: transformPolygon(def.outline, transform),
    convexParts: def.convexParts.map((part) => transformPolygon(part, transform)),
  }
}

export const quantizeRotation = (rotation: number): number => {
  const quarterTurns = Math.round(rotation / (Math.PI / 2))
  return quarterTurns * (Math.PI / 2)
}

/** Wraps any angle to the range [0, 2π). */
export const normalizeAngle = (rotation: number): number => {
  const twoPi = 2 * Math.PI
  return ((rotation % twoPi) + twoPi) % twoPi
}