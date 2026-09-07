import type { SimulationSnapshot } from './contracts.js'

export interface HeightScoreTelemetry {
  readonly maxHeightMm: number | null
  readonly firstTickAtMaxHeight: number | null
}

export const EMPTY_HEIGHT_SCORE: HeightScoreTelemetry = Object.freeze({
  maxHeightMm: null,
  firstTickAtMaxHeight: null,
})

/**
 * Canonical fixed-point conversion: nearest millimetre, exact .5 ties away
 * from zero. Math.floor is in the authoritative deterministic math allowlist.
 */
export function heightMetersToMillimeters(heightMeters: number): number {
  if (!Number.isFinite(heightMeters)) throw new Error('Height must be finite')
  const scaled = heightMeters * 1000
  const rounded = scaled < 0 ? -Math.floor(-scaled + 0.5) : Math.floor(scaled + 0.5)
  if (!Number.isSafeInteger(rounded)) throw new Error('Height is outside safe fixed-point range')
  return rounded
}

/**
 * Derive the world-space Y coordinate of Rapier's configured local COM from
 * the authoritative rigid-body pose carried by SimulationSnapshot.
 */
export function worldCenterOfMassYFromSnapshot(snapshot: SimulationSnapshot, localCenterOfMassY: number): number {
  if (!Number.isFinite(localCenterOfMassY)) throw new Error('Center of mass offset must be finite')
  const { x, z } = snapshot.rotation
  const rotatedLocalY = localCenterOfMassY * (1 - 2 * (x * x + z * z))
  return snapshot.position.y + rotatedLocalY
}

/**
 * Record one post-step authoritative sample. Comparisons happen after
 * quantization, so equal millimetre scores preserve the earliest tick.
 */
export function recordHeightScore(
  current: HeightScoreTelemetry,
  worldCenterOfMassY: number,
  levelOriginY: number,
  completedTick: number,
): HeightScoreTelemetry {
  if (!Number.isFinite(levelOriginY)) throw new Error('Level origin must be finite')
  if (!Number.isInteger(completedTick) || completedTick <= 0) throw new Error('Completed tick must be a positive integer')
  const heightMm = heightMetersToMillimeters(worldCenterOfMassY - levelOriginY)
  if (current.maxHeightMm === null || heightMm > current.maxHeightMm) {
    return { maxHeightMm: heightMm, firstTickAtMaxHeight: completedTick }
  }
  return current
}
