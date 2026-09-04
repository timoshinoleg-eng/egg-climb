import type { JumpQuality } from '../store/useGame'

export type QuaternionLike = { x: number; y: number; z: number; w: number }

export type JumpProfile = {
  quality: JumpQuality
  impulse: number
  assist: number
}

export function getTipAlignment(q: QuaternionLike): number {
  // Rotate the egg's local +Y tip axis by q and dot it with world +Y.
  // The Y component of that rotated unit vector is 1 - 2(x² + z²).
  const alignment = 1 - 2 * (q.x * q.x + q.z * q.z)
  return Math.max(0, Math.min(1, alignment))
}

export function getJumpProfile(alignment: number): JumpProfile {
  if (alignment >= 0.9) return { quality: 'PERFECT', impulse: 6.6, assist: 0.3 }
  if (alignment >= 0.65) return { quality: 'GOOD', impulse: 5.2, assist: 0.22 }
  if (alignment >= 0.25) return { quality: 'ANGLED', impulse: 4.1, assist: 0.12 }
  return { quality: 'SIDE', impulse: 3.2, assist: 0.04 }
}

export function clampInput(value: number): number {
  return Math.max(-1, Math.min(1, value))
}
