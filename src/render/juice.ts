/**
 * Visual Preset v1 — headless presentation dynamics.
 *
 * This module consumes explicit presentation events plus read-only simulation
 * snapshot values. It never reconstructs gameplay transitions from velocity,
 * never writes to simulation, and never participates in replay/fingerprints.
 */

import { PresentationEventCursor } from '../presentation/events.js'
import type { SimulationPresentationEvent } from '../presentation/events.js'

export interface JuiceVec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface JuiceSnapshot {
  readonly position: JuiceVec3
  readonly linearVelocity: JuiceVec3
}

export interface SquashScale {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type VisualQualityTier = 'high' | 'medium' | 'low'

export interface VisualQualityProfile {
  readonly renderScale: number
  readonly particlePoints: number
  /** Whether this tier is ever allowed to construct/run the bloom path. */
  readonly bloom: boolean
}

export const VISUAL_QUALITY_PROFILES: Readonly<Record<VisualQualityTier, VisualQualityProfile>> = Object.freeze({
  high: Object.freeze({ renderScale: 1, particlePoints: 72, bloom: true }),
  medium: Object.freeze({ renderScale: 0.85, particlePoints: 48, bloom: false }),
  low: Object.freeze({ renderScale: 0.7, particlePoints: 24, bloom: false }),
})

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Compose from the known base transform; callers must not feed back output. */
export function composeVisualScale(base: SquashScale, effect: SquashScale): SquashScale {
  return {
    x: base.x * effect.x,
    y: base.y * effect.y,
    z: base.z * effect.z,
  }
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

  kick(impact: number): void {
    this.velocity -= clamp(impact, 0, 1) * LANDING_KICK
  }

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

function noise1(t: number, seed: number): number {
  const scaled = t * SHAKE_SAMPLE_RATE + seed * 97.31
  const i = Math.floor(scaled)
  const f = scaled - i
  const u = f * f * (3 - 2 * f)
  const a = hash1(i * 0.7548776662 + seed * 0.6180339887)
  const b = hash1((i + 1) * 0.7548776662 + seed * 0.6180339887)
  return (a + (b - a) * u) * 2 - 1
}

/** Trauma-based additive camera shake. */
export class TraumaShake {
  private trauma = 0
  private time = 0

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

/** Attempt-local telemetry only. This does not mean Personal Best. */
export class AttemptHeightTracker {
  private maxHeightValue = Number.NEGATIVE_INFINITY

  update(y: number): void {
    if (Number.isFinite(y) && y > this.maxHeightValue) this.maxHeightValue = y
  }

  get maxHeight(): number {
    return this.maxHeightValue
  }

  reset(startY = 0): void {
    this.maxHeightValue = startY
  }
}

export interface JuiceFrame {
  /** Exactly-once accepted ordered events for this visual update. */
  readonly events: readonly SimulationPresentationEvent[]
  readonly squash: SquashScale
  readonly shake: ShakeOffset
  readonly attemptMaxHeight: number
}

/**
 * Presentation facade. Continuous visual dynamics integrate at render/update
 * time, while gameplay transitions arrive only through the explicit event
 * stream produced by the authoritative host.
 */
export class Juice {
  private readonly squashSpring = new SquashStretch()
  private readonly cameraShake = new TraumaShake()
  private readonly heights = new AttemptHeightTracker()
  private readonly cursor = new PresentationEventCursor()

  reset(spawnY = 0): void {
    this.squashSpring.reset()
    this.cameraShake.reset()
    this.heights.reset(spawnY)
    this.cursor.reset()
  }

  update(
    dt: number,
    current: JuiceSnapshot,
    events: readonly SimulationPresentationEvent[] = [],
  ): JuiceFrame {
    const step = clamp(dt, 0, 0.1)
    const accepted = this.cursor.take(events)

    for (const event of accepted) {
      if (event.kind === 'land' || event.kind === 'hard-land') {
        this.squashSpring.kick(event.impact)
        this.cameraShake.add(0.15 + event.impact * 0.5)
      } else if (event.kind === 'jump') {
        this.squashSpring.stretchKick()
        this.cameraShake.add(0.1)
      } else if (event.kind === 'fail') {
        this.cameraShake.add(0.75)
      }
    }

    this.heights.update(current.position.y)
    return {
      events: accepted,
      squash: this.squashSpring.update(step, current.linearVelocity.y),
      shake: this.cameraShake.update(step),
      attemptMaxHeight: this.heights.maxHeight,
    }
  }
}
