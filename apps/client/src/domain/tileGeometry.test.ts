import { describe, expect, it } from 'vitest'
import { quantizeRotation, transformPolygon } from './tileGeometry'
import { vec2 } from './math2d'

describe('tileGeometry', () => {
  it('quantizes to 90 degree increments', () => {
    const result = quantizeRotation(Math.PI * 0.74)
    expect(result).toBeCloseTo(Math.PI / 2)
  })

  it('applies mirror and rotation transforms', () => {
    const square = [
      vec2(-0.5, -0.5),
      vec2(0.5, -0.5),
      vec2(0.5, 0.5),
      vec2(-0.5, 0.5),
    ]

    const transformed = transformPolygon(square, {
      position: vec2(2, 1),
      rotation: Math.PI / 2,
      mirrored: true,
    })

    expect(transformed[0].x).toBeCloseTo(2.5)
    expect(transformed[0].y).toBeCloseTo(1.5)
  })
})
