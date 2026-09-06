/**
 * Visual Preset v1 — headless "juice" core.
 *
 * Implements ADR 0001 step 4 ("Visual Preset v1 ... isolated from
 * simulation"). The module consumes simulation snapshots and produces pure
 * visual state: squash & stretch, camera trauma shake and contact/record
 * events. It never writes back into the simulation and never touches Rapier,
 * three.js, the DOM, wall clocks or ambient randomness, so replay determinism
 * stays intact (ADR 0001 rule 8).
 *
 * three.js binding: `debug/juice-view.js`. Runnable showcase:
 * `debug/juice-demo.html` via `npm run debug:serve`.
 * Design doc: `docs/specs/2026-09-06-visual-preset-v1.md`.
 */

export interface JuiceVec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Structural subset of `SimulationSnapshot`: the only fields the juice layer
 * reads. Keeping the contract minimal lets the visual preset evolve without
 * touching the simulation boundary.
 */
export interface JuiceSnapshot {
  readonly tick: number
  readonly position: JuiceVec3
  readonly linearVelocity: JuiceVec3
  readonly angularVelocity: JuiceVec3
}

/** Contact events derived purely from kinematics (no collider data needed). */
export interface ContactEvents {
  /** Landing impact strength in [0, 1]; 0 means "no landing this step". */
  readonly landingImpact: number
  /** True on the step where the egg leaves the ground moving up fast. */
  readonly jumped: boolean
}

/** All visual events emitted for a step. */
export interface JuiceEvents extends ContactEvents {
  /** True when the egg beats its attempt height record by the margin. */
  readonly newHeightRecord: boolean
}

export const LANDING_MIN_FALL_SPEED = 1.5
export const LANDING_ABSORB_DELTA = 2.5
export const LANDING_FULL_IMPACT_SPEED = 12
export const JUMP_EXIT_SPEED = 2.5
export const HEIGHT_RECORD_MARGIN = 0.2

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Detect landing and takeoff between two snapshots from vertical velocity.
 * A landing is a fast fall whose downward speed is mostly absorbed in one
 * tick; a jump is a near-stationary body leaving the ground upward.
 * Same-tick snapshot pairs (paused sim, replayed frame) never emit events.
 */
export function detectContactEvents(prev: JuiceSnapshot, curr: JuiceSnapshot): ContactEvents {
  if (prev === curr || curr.tick === prev.tick) return { landingImpact: 0, jumped: false }
  const prevVy = prev.linearVelocity.y
  const currVy = curr.linearVelocity.y
  const absorbed = currVy - prevVy

  let landingImpact = 0
  if (prevVy < -LANDING_MIN_FALL_SPEED && absorbed > LANDING_ABSORB_DELTA) {
    landingImpact = clamp(-prevVy / LANDING_FULL_IMPACT_SPEED, 0, 1)
  }

  const jumped = prevVy <= 1 && currVy > JUMP_EXIT_SPEED && absorbed > JUMP_EXIT_SPEED * 0.6

  return { landingImpact, jumped }
}

/**
 * Merge per-tick contact events from a batched worker advance into one
 * frame-level set: the strongest landing wins, jumps are OR-ed.
 *
 * Why: `WorkerSimulationHost.advance(inputs)` returns only the last
 * `{ previous, current }` snapshot pair of the batch, so one-tick contacts
 * inside the batch are invisible on the UI thread. The event-accurate
 * wiring computes `detectContactEvents` per tick inside the worker and
 * folds the resulting array here (see docs/specs/2026-09-06-visual-preset-v1.md).
 */
export function mergeContactEvents(events: readonly ContactEvents[]): ContactEvents {
  let landingImpact = 0
  let jumped = false
  for (const event of events) {
    if (event.landingImpact > landingImpact) landingImpact = event.landingImpact
    if (event.jumped) jumped = true
  }
  return { landingImpact, jumped }
}

export interface SquashScale {
  readonly x: number
  readonly y: number
  readonly z: number
}

const SQUASH_SPRING = 190
const SQUASH_DAMPING = 15
const SQUASH_MIN = -0.45
const SQUASH_MAX = 0.35
const AIR_STRETCH_PER_SPEED = 0.02
const AIR_STRETCH_MAX = 0.16
const LANDING_KICK = 16
const JUMP_KICK = 6.5

/**
 * Spring-driven squash & stretch. Landing compresses the egg, takeoff
 * elongates it, air time adds subtle speed stretch. Horizontal axes
 * compensate so the silhouette keeps roughly constant volume.
 */
export class SquashStretch {
  private stretch = 0
  private velocity = 0

  /** Compression impulse on landing, scaled by impact [0..1]. */
  kick(impact: number): void {
    this.velocity -= clamp(impact, 0, 1) * LANDING_KICK
  }

  /** Elongation impulse on takeoff. */
  stretchKick(): void {
    this.velocity += JUMP_KICK
  }

  update(dt: number, verticalSpeed: number): SquashScale {
    const step = clamp(dt, 0, 0.1)
    const airTarget = clamp(verticalSpeed * AIR_STRETCH_PER_SPEED, -AIR_STRETCH_MAX, AIR_STRETCH_MAX)
    const acceleration = (airTarget - this.stretch) * SQUASH_SPRING - this.velocity * SQUASH_DAMPING
    this.velocity += acceleration * step
    this.stretch = clamp(this.stretch + this.velocity * step, SQUASH_MIN, SQUASH_MAX)

    const y = 1 + this.stretch
    const xz = 1 / Math.sqrt(Math.max(0.2, y))
    return { x: xz, y, z: xz }
  }

  reset(): void {
    this.stretch = 0
    this.velocity = 0
  }
}

export interface ShakeOffset {
  readonly x: number
  readonly y: number
  readonly roll: number
}

const TRAUMA_DECAY_PER_SECOND = 1.1
const SHAKE_MAX_OFFSET = 0.35
const SHAKE_MAX_ROLL = 0.06
const SHAKE_SAMPLE_RATE = 24

function hash1(value: number): number {
  const s = Math.sin(value) * 43758.5453123
  return s - Math.floor(s)
}

/**
 * Smooth value noise in [-1, 1]. Deterministic (seeded, no ambient
 * randomness), so identical trauma curves always read identically
 * in recordings and playtests.
 */
function noise1(t: number, seed: number): number {
  const scaled = t * SHAKE_SAMPLE_RATE + seed * 97.31
  const i = Math.floor(scaled)
  const f = scaled - i
  const u = f * f * (3 - 2 * f)
  const a = hash1(i * 0.7548776662 + seed * 0.6180339887)
  const b = hash1((i + 1) * 0.7548776662 + seed * 0.6180339887)
  return (a + (b - a) * u) * 2 - 1
}

/**
 * Trauma-based camera shake: impacts add trauma, the visible offset scales
 * with trauma squared, so small hits stay subtle while big ones hit hard.
 */
export class TraumaShake {
  private trauma = 0
  private time = 0

  /** Add trauma in [0..1]; the accumulated level is clamped to 1. */
  add(amount: number): void {
    this.trauma = clamp(this.trauma + clamp(amount, 0, 1), 0, 1)
  }

  get level(): number {
    return this.trauma
  }

  update(dt: number): ShakeOffset {
    const step = clamp(dt, 0, 0.1)
    this.time += step
    this.trauma = Math.max(0, this.trauma - step * TRAUMA_DECAY_PER_SECOND)
    const shake = this.trauma * this.trauma
    if (shake === 0) return { x: 0, y: 0, roll: 0 }
    return {
      x: noise1(this.time, 1) * SHAKE_MAX_OFFSET * shake,
      y: noise1(this.time, 2) * SHAKE_MAX_OFFSET * shake,
      roll: noise1(this.time, 3) * SHAKE_MAX_ROLL * shake,
    }
  }

  reset(): void {
    this.trauma = 0
    this.time = 0
  }
}

/**
 * Tracks the attempt height record. The celebration margin is measured from
 * the last CELEBRATED height while the true maximum tracks independently —
 * otherwise a smooth 60 Hz climb would ratchet the reference every tick and
 * the margin would never accumulate.
 */
export class HeightTracker {
  private maxHeightValue = Number.NEGATIVE_INFINITY
  private lastCelebrated = Number.NEGATIVE_INFINITY

  update(y: number): boolean {
    if (!Number.isFinite(y)) return false
    if (y > this.maxHeightValue) this.maxHeightValue = y
    if (y > this.lastCelebrated + HEIGHT_RECORD_MARGIN) {
      this.lastCelebrated = y
      return true
    }
    return false
  }

  get maxHeight(): number {
    return this.maxHeightValue
  }

  reset(startY = 0): void {
    this.maxHeightValue = startY
    this.lastCelebrated = startY
  }
}

/** Everything the view needs for one rendered frame. */
export interface JuiceFrame {
  readonly events: JuiceEvents
  readonly squash: SquashScale
  readonly shake: ShakeOffset
  readonly maxHeight: number
}

/**
 * Facade composing event detection, squash & stretch, camera shake and
 * height records. Purely a snapshot consumer: feed it the same snapshot
 * pair the renderer interpolates between; it can never influence physics.
 */
export class Juice {
  private readonly squashSpring = new SquashStretch()
  private readonly cameraShake = new TraumaShake()
  private readonly heights = new HeightTracker()

  /** Reset per-attempt state; pass the egg spawn height. */
  reset(spawnY = 0): void {
    this.squashSpring.reset()
    this.cameraShake.reset()
    this.heights.reset(spawnY)
  }

  /**
   * Advance the visual state from a snapshot pair. Frame-rate independent:
   * dynamics integrate `dt`, clamped to [0, 0.1].
   */
  update(dt: number, prev: JuiceSnapshot, curr: JuiceSnapshot): JuiceFrame {
    return this.updateWithEvents(dt, detectContactEvents(prev, curr), curr)
  }

  /**
   * Advance with externally computed contact events — e.g. a worker batch
   * folded via `mergeContactEvents` when the simulation runs in a worker
   * and the UI thread only receives batch-edge snapshots.
   */
  updateWithEvents(dt: number, events: ContactEvents, curr: JuiceSnapshot): JuiceFrame {
    const step = clamp(dt, 0, 0.1)

    if (events.landingImpact > 0) {
      this.squashSpring.kick(events.landingImpact)
      this.cameraShake.add(0.15 + events.landingImpact * 0.5)
    }
    if (events.jumped) {
      this.squashSpring.stretchKick()
      this.cameraShake.add(0.1)
    }

    const newHeightRecord = this.heights.update(curr.position.y)
    const squash = this.squashSpring.update(step, curr.linearVelocity.y)
    const shake = this.cameraShake.update(step)

    return {
      events: {
        landingImpact: events.landingImpact,
        jumped: events.jumped,
        newHeightRecord,
      },
      squash,
      shake,
      maxHeight: this.heights.maxHeight,
    }
  }
}
