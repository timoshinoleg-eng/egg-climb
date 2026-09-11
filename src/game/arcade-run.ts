import type { SimulationHost, SimulationFrame } from '../host/contracts.js'
import { FixedTickInputScheduler } from '../host/fixed-tick-scheduler.js'
import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import { worldCenterOfMassYFromSnapshot } from '../sim/scoring.js'
import { EMPTY_ARCADE_SCORE, isOutsideArcadeBounds, updateArcadeScore } from './arcade-score.js'
import type { ArcadeScore } from './arcade-score.js'
import { ARCADE_PHYSICS } from './arcade-level.js'

export type ArcadePhase = 'loading' | 'ready' | 'playing' | 'paused' | 'over' | 'resetting' | 'error' | 'disposed'
export type EndReason = 'fall' | 'summit' | 'finish' | 'timeout' | null
export interface ArcadeCallbacks {
  readonly onFrame?: (frame: SimulationFrame, score: ArcadeScore, previousScore: ArcadeScore) => void
  readonly onPhase?: (phase: ArcadePhase) => void
}

/** Local session policy; never changes the host's authoritative simulation. */
export interface RoundRules {
  readonly localCenterOfMassY: number
  readonly initialLandingHeightMm: number
  readonly maxTicks: number
  readonly isOutside: (snapshot: SimulationSnapshot, peakY: number) => boolean
  readonly completion: (snapshot: SimulationSnapshot) => 'summit' | 'finish' | null
}

const GARDEN_RULES: RoundRules = Object.freeze({
  localCenterOfMassY: ARCADE_PHYSICS.egg.centerOfMassY,
  initialLandingHeightMm: 0,
  maxTicks: 60 * 180,
  isOutside: isOutsideArcadeBounds,
  completion: (snapshot: SimulationSnapshot) => snapshot.physics.grounded &&
    (snapshot.physics.supportContactWorld?.y ?? 0) >= 14.85 ? 'summit' : null,
})

/**
 * Local-practice lifecycle above the unmodified authoritative SimulationHost.
 * No browser globals or timers. One in-flight tick, bounded input queue, exact
 * per-tick scoring, and an epoch fence against stale reset/dispose responses.
 * The owning view supplies frame time and owns/cancels its single rAF.
 */
export class ArcadeRun {
  private readonly scheduler = new FixedTickInputScheduler()
  private epoch = 0
  private inFlight: Promise<void> | undefined
  private resetting: Promise<void> | undefined
  private phaseValue: ArcadePhase = 'loading'
  private previousValue: SimulationSnapshot | undefined
  private currentValue: SimulationSnapshot | undefined
  private scoreValue: ArcadeScore = EMPTY_ARCADE_SCORE
  private peakY = 0
  private startComY = 0
  private reasonValue: EndReason = null
  private errorValue: Error | null = null

  constructor(
    private readonly host: SimulationHost,
    private readonly callbacks: ArcadeCallbacks = {},
    private readonly rules: RoundRules = GARDEN_RULES,
  ) {}

  get phase(): ArcadePhase { return this.phaseValue }
  get previous(): SimulationSnapshot | undefined { return this.previousValue }
  get current(): SimulationSnapshot | undefined { return this.currentValue }
  get score(): ArcadeScore { return this.scoreValue }
  get reason(): EndReason { return this.reasonValue }
  get error(): Error | null { return this.errorValue }
  get alpha(): number { return this.scheduler.alpha }
  get pendingCount(): number { return this.scheduler.pendingCount }
  get busy(): boolean { return this.inFlight !== undefined }
  get overloadCount(): number { return this.scheduler.overloadCount }

  private setPhase(phase: ArcadePhase): void {
    this.phaseValue = phase
    this.callbacks.onPhase?.(phase)
  }

  private installSnapshot(snapshot: SimulationSnapshot): void {
    this.previousValue = snapshot
    this.currentValue = snapshot
    this.peakY = snapshot.position.y
    this.startComY = worldCenterOfMassYFromSnapshot(snapshot, this.rules.localCenterOfMassY)
    this.scoreValue = { ...EMPTY_ARCADE_SCORE, highestLandingMm: this.rules.initialLandingHeightMm }
    this.reasonValue = null
    this.errorValue = null
    this.scheduler.reset()
  }

  async init(): Promise<void> {
    const epoch = this.epoch
    try {
      const snapshot = await this.host.init()
      if (epoch !== this.epoch || this.phaseValue === 'disposed') return
      this.installSnapshot(snapshot)
      this.setPhase('ready')
    } catch (error) {
      if (epoch === this.epoch) this.fail(error)
    }
  }

  start(): void {
    if (this.phaseValue !== 'ready') return
    this.scheduler.reset()
    this.setPhase('playing')
  }

  pause(): void {
    if (this.phaseValue !== 'playing') return
    this.scheduler.discardPending()
    this.setPhase('paused')
  }

  resume(): void {
    if (this.phaseValue !== 'paused') return
    this.scheduler.discardPending()
    this.setPhase('playing')
  }

  tick(dt: number, sample: () => TickInput): void {
    if (this.phaseValue !== 'playing') return
    this.scheduler.sampleFrame(dt, sample)
    this.pump()
  }

  private pump(): void {
    if (this.inFlight || this.phaseValue !== 'playing' || this.scheduler.pendingCount === 0) return
    const epoch = this.epoch
    // A one-tick transport preserves exact apex/terminal scoring without
    // changing the existing Worker protocol or dropping batch-internal peaks.
    const inputs = this.scheduler.takeBatch(1)
    this.inFlight = this.host.advance(inputs).then(frame => {
      if (epoch !== this.epoch || this.phaseValue === 'disposed') return
      this.previousValue = frame.previous
      this.currentValue = frame.current
      this.peakY = Math.max(this.peakY, frame.current.position.y)
      if (this.rules.isOutside(frame.current, this.peakY)) {
        this.callbacks.onFrame?.(frame, this.scoreValue, this.scoreValue)
        this.end('fall')
        return
      }
      const oldScore = this.scoreValue
      this.scoreValue = updateArcadeScore(
        oldScore, frame.current, this.startComY, this.rules.localCenterOfMassY,
        frame.events.some(event => event.kind === 'land' || event.kind === 'hard-land'),
      )
      this.callbacks.onFrame?.(frame, this.scoreValue, oldScore)
      const completion = this.rules.completion(frame.current)
      if (completion) this.end(completion)
      else if (frame.current.tick >= this.rules.maxTicks) this.end('timeout')
    }).catch(error => {
      if (epoch === this.epoch) this.fail(error)
    }).finally(() => {
      this.inFlight = undefined
      this.pump()
    })
  }

  private end(reason: Exclude<EndReason, null>): void {
    this.reasonValue = reason
    this.scheduler.discardPending()
    this.setPhase('over')
  }

  private fail(error: unknown): void {
    if (this.phaseValue === 'disposed') return
    this.errorValue = error instanceof Error ? error : new Error(String(error))
    this.scheduler.reset()
    this.setPhase('error')
  }

  /** Idempotent even while a slow advance or a previous restart is pending. */
  restart(): Promise<void> {
    if (this.phaseValue === 'disposed') return Promise.resolve()
    if (this.resetting) return this.resetting
    const epoch = ++this.epoch
    this.scheduler.reset()
    this.setPhase('resetting')
    this.resetting = (async () => {
      try {
        await this.inFlight
        if (epoch !== this.epoch) return
        const snapshot = await this.host.reset()
        if (epoch !== this.epoch) return
        this.installSnapshot(snapshot)
        this.setPhase('ready')
      } catch (error) {
        if (epoch === this.epoch) this.fail(error)
      } finally {
        this.resetting = undefined
      }
    })()
    return this.resetting
  }

  /** Useful for orderly shutdown and deterministic host tests; no timer polling. */
  async settled(): Promise<void> {
    while (this.inFlight) await this.inFlight
  }

  async dispose(): Promise<void> {
    if (this.phaseValue === 'disposed') return
    this.epoch += 1
    this.scheduler.reset()
    this.setPhase('disposed')
    await this.host.free().catch(() => undefined)
  }
}
