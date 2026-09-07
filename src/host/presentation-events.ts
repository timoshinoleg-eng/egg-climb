import type { SimulationSnapshot } from '../sim/contracts.js'
import type { SimulationPresentationEvent } from '../presentation/events.js'
import { simulationPresentationEventId } from '../presentation/events.js'

/** Fall speed at which a landing reaches full presentation impact. */
export const LANDING_FULL_IMPACT_SPEED = 12
/** Threshold separating ordinary landing accents from hard-landing accents. */
export const HARD_LAND_IMPACT_THRESHOLD = 0.65

function clampImpact(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function landingImpact(previous: SimulationSnapshot): number {
  const fallSpeed = previous.linearVelocity.y < 0 ? -previous.linearVelocity.y : 0
  return clampImpact(fallSpeed / LANDING_FULL_IMPACT_SPEED)
}

/**
 * Derive presentation transitions from exact authoritative semantic fields
 * after one completed simulation tick. This never guesses a jump/landing from
 * an arbitrary velocity change.
 */
export function collectSimulationPresentationEvents(
  previous: SimulationSnapshot,
  current: SimulationSnapshot,
  attemptId: number,
): SimulationPresentationEvent[] {
  if (current.tick !== previous.tick + 1) {
    throw new Error('Presentation events require adjacent authoritative snapshots')
  }

  const events: SimulationPresentationEvent[] = []
  const position = {
    x: current.position.x,
    y: current.position.y,
    z: current.position.z,
  }

  // A support transition is the authoritative landing semantic. Velocity only
  // controls visual intensity; it never decides whether a landing happened.
  if (!previous.physics.grounded && current.physics.grounded) {
    const impact = landingImpact(previous)
    const kind = impact >= HARD_LAND_IMPACT_THRESHOLD ? 'hard-land' : 'land'
    const ordinal = events.length
    events.push({
      id: simulationPresentationEventId(attemptId, current.tick, kind, ordinal),
      attemptId,
      tick: current.tick,
      ordinal,
      kind,
      impact,
      position,
    })
  }

  // simulation-core records the exact tick/source/strength when stepFeel
  // authorizes an actual jump impulse. This is immune to toaster/updraft/etc.
  if (
    current.feel.lastJumpTick === previous.tick
    && current.feel.lastJumpTick !== previous.feel.lastJumpTick
    && current.feel.lastJumpSource !== null
  ) {
    const ordinal = events.length
    events.push({
      id: simulationPresentationEventId(attemptId, current.tick, 'jump', ordinal),
      attemptId,
      tick: current.tick,
      ordinal,
      kind: 'jump',
      source: current.feel.lastJumpSource,
      strength: current.feel.lastJumpStrength,
      position,
    })
  }

  return events
}
