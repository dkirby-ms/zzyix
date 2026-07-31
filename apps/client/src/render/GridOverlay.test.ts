import { describe, expect, it } from 'vitest'
import { GRID_PATTERNS, generateGridPatternSlots } from '../domain/gridPatterns'
import { getTileDefinition, transformPolygon } from '../domain/tileGeometry'
import {
  buildGridOverlaySegments,
  classifyGridPatternSlot,
} from './gridOverlayGeometry'
import type { TileInstance } from '../domain/placementSolver'

const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
const viewport = { minX: -0.1, maxX: 0.1, minY: -0.1, maxY: 0.1 }
const squarePattern = GRID_PATTERNS.find((pattern) => pattern.id === 'square-lattice')!

describe('GridOverlay geometry', () => {
  it('batches transformed canonical outlines for viewport-visible cells plus overscan', () => {
    const groups = buildGridOverlaySegments({
      pattern: squarePattern,
      viewport,
      activeShape: 'square',
      tiles: [],
      bounds,
    })
    const generatedSlots = generateGridPatternSlots(squarePattern, {
      minX: -2,
      maxX: 2,
      minY: -2,
      maxY: 2,
    })
    const edgeCount = getTileDefinition('square').outline.length

    expect(groups.placeable).toHaveLength(generatedSlots.length * edgeCount * 6)
    expect(groups.structural).toHaveLength(0)
    expect(groups.blocked).toHaveLength(0)
  })

  it('uses exact transformed outline coordinates and adds an active center marker', () => {
    const slot = generateGridPatternSlots(squarePattern, {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })[0]
    const groups = buildGridOverlaySegments({
      pattern: squarePattern,
      viewport,
      activeShape: 'square',
      tiles: [],
      bounds,
      activeSlotId: slot.id,
    })
    const outline = transformPolygon(getTileDefinition('square').outline, slot.transform)
    const firstEdge = groups.active.slice(0, 6)

    expect(firstEdge).toEqual([
      outline[0].x,
      outline[0].y,
      0,
      outline[1].x,
      outline[1].y,
      0,
    ])
    expect(groups.active).toHaveLength(getTileDefinition('square').outline.length * 6 + 12)
  })

  it('classifies incompatible and occupied slots without changing settled tiles', () => {
    const slot = generateGridPatternSlots(squarePattern, {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })[0]
    const settled: TileInstance[] = [
      {
        id: 'settled',
        shape: 'square',
        color: '#fff',
        material: 'ceramic',
        transform: slot.transform,
        createdAt: 0,
      },
    ]
    const snapshot = structuredClone(settled)

    expect(classifyGridPatternSlot(slot, 'triangle', settled, bounds)).toBe('structural')
    expect(classifyGridPatternSlot(slot, 'square', settled, bounds)).toBe('blocked')
    expect(classifyGridPatternSlot(slot, 'square', settled, bounds, slot.id)).toBe('active')
    expect(settled).toEqual(snapshot)
  })

  it('omits slots whose tile outline extends outside owned bounds', () => {
    const groups = buildGridOverlaySegments({
      pattern: squarePattern,
      viewport: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
      activeShape: 'square',
      tiles: [],
      bounds: { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 },
    })
    const edgeCount = getTileDefinition('square').outline.length

    expect(groups.placeable).toHaveLength(edgeCount * 6)
    expect(groups.blocked).toHaveLength(0)
    expect(groups.structural).toHaveLength(0)
  })
})
