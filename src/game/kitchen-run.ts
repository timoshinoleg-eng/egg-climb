import type { SimulationHost } from '../host/contracts.js'
import type { SimulationSnapshot } from '../sim/contracts.js'
import { DEFAULT_FEEL } from '../sim/feel-presets.js'
import { KITCHEN_LEVEL, KITCHEN_LEVEL_DEFINITION } from '../sim/level.js'
import { PHYSICS_V1 } from '../sim/physics-presets.js'
import { heightMetersToMillimeters } from '../sim/scoring.js'
import { ArcadeRun } from './arcade-run.js'
import type { ArcadeCallbacks, RoundRules } from './arcade-run.js'

/** Exact canonical content, without fixture geometry, spawn overrides or assists. */
export const KITCHEN_OPTIONS = Object.freeze({
  level: KITCHEN_LEVEL,
  preset: PHYSICS_V1,
  feel: DEFAULT_FEEL,
})
export const KITCHEN_BEST_SCORE_KEY = 'egg-climb-kitchen-best-v1'

const boxes = [...KITCHEN_LEVEL_DEFINITION.staticBoxes, ...KITCHEN_LEVEL_DEFINITION.kinematicBoxes]
export const KITCHEN_PLAY_BOUNDS = Object.freeze({
  minX: Math.min(...boxes.map(box => box.center[0] - box.halfExtents[0])) - 3,
  maxX: Math.max(...boxes.map(box => box.center[0] + box.halfExtents[0])) + 3,
  minZ: Math.min(...boxes.map(box => box.center[2] - box.halfExtents[2])) - 3,
  maxZ: Math.max(...boxes.map(box => box.center[2] + box.halfExtents[2])) + 3,
  minY: Math.min(...boxes.map(box => box.center[1] - box.halfExtents[1])) - 3,
})

export function isOutsideKitchenBounds(snapshot: SimulationSnapshot): boolean {
  const { x, y, z } = snapshot.position
  return ![x, y, z].every(Number.isFinite) || y < KITCHEN_PLAY_BOUNDS.minY ||
    x < KITCHEN_PLAY_BOUNDS.minX || x > KITCHEN_PLAY_BOUNDS.maxX ||
    z < KITCHEN_PLAY_BOUNDS.minZ || z > KITCHEN_PLAY_BOUNDS.maxZ
}

export const KITCHEN_ROUND_RULES: RoundRules = Object.freeze({
  localCenterOfMassY: PHYSICS_V1.egg.centerOfMassY,
  // Landing on the starting table is not a higher-ledge combo.
  initialLandingHeightMm: heightMetersToMillimeters(KITCHEN_LEVEL.origin[1]),
  maxTicks: 60 * 180,
  isOutside: isOutsideKitchenBounds,
  completion: (snapshot: SimulationSnapshot) => {
    const tick = snapshot.gameplay?.completionTick
    return typeof tick === 'number' && Number.isInteger(tick) && tick > 0 && tick <= snapshot.tick ? 'finish' : null
  },
})

/** Same bounded lifecycle as the garden; victory only observes the genuine Finish latch. */
export class KitchenRun extends ArcadeRun {
  constructor(host: SimulationHost, callbacks: ArcadeCallbacks = {}) {
    super(host, callbacks, KITCHEN_ROUND_RULES)
  }
}
