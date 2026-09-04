import type { SimulationSnapshot } from '../sim/contracts.js'

export interface RenderTransform {
  readonly position: Readonly<{ x: number; y: number; z: number }>
  readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function interpolateSnapshots(previous: SimulationSnapshot, current: SimulationSnapshot, alpha: number): RenderTransform {
  const t = clamp01(alpha)
  const position = {
    x: previous.position.x + (current.position.x - previous.position.x) * t,
    y: previous.position.y + (current.position.y - previous.position.y) * t,
    z: previous.position.z + (current.position.z - previous.position.z) * t,
  }

  let bx = current.rotation.x
  let by = current.rotation.y
  let bz = current.rotation.z
  let bw = current.rotation.w
  const dot = previous.rotation.x * bx + previous.rotation.y * by + previous.rotation.z * bz + previous.rotation.w * bw
  if (dot < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw
  }

  let x = previous.rotation.x + (bx - previous.rotation.x) * t
  let y = previous.rotation.y + (by - previous.rotation.y) * t
  let z = previous.rotation.z + (bz - previous.rotation.z) * t
  let w = previous.rotation.w + (bw - previous.rotation.w) * t
  const length = Math.sqrt(x * x + y * y + z * z + w * w)
  if (length > 0) {
    x /= length; y /= length; z /= length; w /= length
  } else {
    x = current.rotation.x; y = current.rotation.y; z = current.rotation.z; w = current.rotation.w
  }

  return { position, rotation: { x, y, z, w } }
}
