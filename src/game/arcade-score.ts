import type { SimulationSnapshot } from '../sim/contracts.js'
import { heightMetersToMillimeters, worldCenterOfMassYFromSnapshot } from '../sim/scoring.js'

export interface ArcadeScore {
  readonly heightMm: number
  readonly points: number
  readonly combo: number
  readonly bonus: number
  readonly highestLandingMm: number
}
export const EMPTY_ARCADE_SCORE: ArcadeScore = Object.freeze({
  heightMm: 0, points: 0, combo: 0, bonus: 0, highestLandingMm: 0,
})

/** Local practice points, NOT a server-accepted Daily leaderboard score. */
export function updateArcadeScore(
  score: ArcadeScore,
  snapshot: SimulationSnapshot,
  startComY: number,
  localComY: number,
  landed: boolean,
): ArcadeScore {
  const heightMm = Math.max(score.heightMm, 0, heightMetersToMillimeters(
    worldCenterOfMassYFromSnapshot(snapshot, localComY) - startComY,
  ))
  const landingMm = snapshot.physics.supportContactWorld
    ? heightMetersToMillimeters(snapshot.physics.supportContactWorld.y) : 0
  const newLedge = landed && landingMm > score.highestLandingMm + 250
  const combo = newLedge ? Math.min(score.combo + 1, 5) : score.combo
  const bonus = score.bonus + (newLedge ? combo * 10 : 0)
  return {
    heightMm, points: Math.floor(heightMm / 100) * 10 + bonus, combo, bonus,
    highestLandingMm: newLedge ? landingMm : score.highestLandingMm,
  }
}

export function isOutsideArcadeBounds(snapshot: SimulationSnapshot, peakY: number): boolean {
  const { x, y, z } = snapshot.position
  return ![x, y, z].every(Number.isFinite) ||
    y < Math.max(-3, peakY - 7) || Math.abs(x) > 14 || Math.abs(z) > 2
}
