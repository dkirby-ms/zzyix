export type Vec2 = { x: number; y: number }

export const vec2 = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y)
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y)
export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s)

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b))

export const normalize = (a: Vec2): Vec2 => {
  const l = len(a)
  if (l === 0) return vec2(0, 0)
  return vec2(a.x / l, a.y / l)
}

export const perp = (a: Vec2): Vec2 => vec2(-a.y, a.x)

export const rotate = (point: Vec2, radians: number): Vec2 => {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return vec2(point.x * c - point.y * s, point.x * s + point.y * c)
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t))

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const shortestAngleDelta = (from: number, to: number): number => {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export const hash2 = (x: number, y: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return v - Math.floor(v)
}
