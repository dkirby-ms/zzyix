import { getTileDefinition } from './tileGeometry'
import type { Vec2 } from './math2d'
import type { TileShape, Transform2D } from './tileGeometry'

export type GridPatternId = 'square-lattice' | 'running-bond' | 'triangle-tessellation'

export type GridPatternTemplateSlot = {
  id: string
  shape: TileShape
  offset: Vec2
  rotation: number
  mirrored: boolean
}

export type GridPattern = {
  id: GridPatternId
  label: string
  description: string
  basis: readonly [Vec2, Vec2]
  slots: readonly GridPatternTemplateSlot[]
}

export type GridCell = {
  x: number
  y: number
}

export type GridCellRange = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type GridPatternSlot = {
  id: string
  patternId: GridPatternId
  templateSlotId: string
  cell: GridCell
  shape: TileShape
  transform: Transform2D
}

export type WorldViewport = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const GRID_GAP = 0.1

const getOutlineSize = (shape: TileShape): Vec2 => {
  const outline = getTileDefinition(shape).outline
  const xs = outline.map((point) => point.x)
  const ys = outline.map((point) => point.y)

  return {
    x: Math.max(...xs) - Math.min(...xs),
    y: Math.max(...ys) - Math.min(...ys),
  }
}

const squareSize = getOutlineSize('square')
const rectangleSize = getOutlineSize('rectangle')
const triangleSize = getOutlineSize('triangle')
const squareStep = squareSize.x + GRID_GAP
const rectangleStepX = rectangleSize.x + GRID_GAP
const rectangleStepY = rectangleSize.y + GRID_GAP
const triangleStepX = triangleSize.x / 2 + 0.13
const triangleStepY = triangleSize.y + GRID_GAP

export const GRID_PATTERNS: readonly GridPattern[] = [
  {
    id: 'square-lattice',
    label: 'Square lattice',
    description: 'Even rows and columns of square tiles.',
    basis: [
      { x: squareStep, y: 0 },
      { x: 0, y: squareStep },
    ],
    slots: [
      {
        id: 'square',
        shape: 'square',
        offset: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
      },
    ],
  },
  {
    id: 'running-bond',
    label: 'Running bond',
    description: 'Offset rows of rectangular tiles.',
    basis: [
      { x: rectangleStepX, y: 0 },
      { x: 0, y: rectangleStepY * 2 },
    ],
    slots: [
      {
        id: 'even-row',
        shape: 'rectangle',
        offset: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
      },
      {
        id: 'offset-row',
        shape: 'rectangle',
        offset: { x: rectangleStepX / 2, y: rectangleStepY },
        rotation: 0,
        mirrored: false,
      },
    ],
  },
  {
    id: 'triangle-tessellation',
    label: 'Triangle tessellation',
    description: 'Alternating rows of upward and downward triangles.',
    basis: [
      { x: triangleStepX * 2, y: 0 },
      { x: 0, y: triangleStepY },
    ],
    slots: [
      {
        id: 'up',
        shape: 'triangle',
        offset: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
      },
      {
        id: 'down',
        shape: 'triangle',
        offset: { x: triangleStepX, y: 0 },
        rotation: Math.PI,
        mirrored: false,
      },
    ],
  },
]

export const getPatternCompatibleShapes = (pattern: GridPattern): TileShape[] =>
  Array.from(new Set(pattern.slots.map((slot) => slot.shape)))

export const getConstructibleGridPatterns = (
  availableShapes: ReadonlySet<TileShape>,
  patterns: readonly GridPattern[] = GRID_PATTERNS,
): GridPattern[] =>
  patterns.filter((pattern) =>
    getPatternCompatibleShapes(pattern).every((shape) => availableShapes.has(shape)),
  )

export const worldToLattice = (pattern: GridPattern, point: Vec2): Vec2 => {
  const [basisX, basisY] = pattern.basis
  const determinant = basisX.x * basisY.y - basisX.y * basisY.x

  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) {
    throw new Error(`Grid pattern "${pattern.id}" has a non-invertible basis`)
  }

  return {
    x: (point.x * basisY.y - point.y * basisY.x) / determinant,
    y: (basisX.x * point.y - basisX.y * point.x) / determinant,
  }
}

export const getNearestGridCells = (pattern: GridPattern, point: Vec2): GridCell[] => {
  const lattice = worldToLattice(pattern, point)
  const centerX = Math.round(lattice.x)
  const centerY = Math.round(lattice.y)
  const cells: GridCell[] = []

  for (let x = centerX - 1; x <= centerX + 1; x += 1) {
    for (let y = centerY - 1; y <= centerY + 1; y += 1) {
      cells.push({ x, y })
    }
  }

  return cells
}

export const getViewportCellRange = (
  pattern: GridPattern,
  viewport: WorldViewport,
  overscan = 1,
): GridCellRange => {
  const corners = [
    { x: viewport.minX, y: viewport.minY },
    { x: viewport.minX, y: viewport.maxY },
    { x: viewport.maxX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.maxY },
  ].map((corner) => worldToLattice(pattern, corner))

  return {
    minX: Math.floor(Math.min(...corners.map((corner) => corner.x))) - overscan,
    maxX: Math.ceil(Math.max(...corners.map((corner) => corner.x))) + overscan,
    minY: Math.floor(Math.min(...corners.map((corner) => corner.y))) - overscan,
    maxY: Math.ceil(Math.max(...corners.map((corner) => corner.y))) + overscan,
  }
}

export const createGridPatternSlot = (
  pattern: GridPattern,
  cell: GridCell,
  templateSlot: GridPatternTemplateSlot,
): GridPatternSlot => {
  const [basisX, basisY] = pattern.basis

  return {
    id: `${pattern.id}:${cell.x}:${cell.y}:${templateSlot.id}`,
    patternId: pattern.id,
    templateSlotId: templateSlot.id,
    cell,
    shape: templateSlot.shape,
    transform: {
      position: {
        x: cell.x * basisX.x + cell.y * basisY.x + templateSlot.offset.x,
        y: cell.x * basisX.y + cell.y * basisY.y + templateSlot.offset.y,
      },
      rotation: templateSlot.rotation,
      mirrored: templateSlot.mirrored,
    },
  }
}

export const generateGridPatternSlots = (
  pattern: GridPattern,
  range: GridCellRange,
): GridPatternSlot[] => {
  const slots: GridPatternSlot[] = []

  for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
    for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
      for (const templateSlot of pattern.slots) {
        slots.push(createGridPatternSlot(pattern, { x: cellX, y: cellY }, templateSlot))
      }
    }
  }

  return slots
}
