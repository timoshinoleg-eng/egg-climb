import { PHYSICS_DT } from '../sim/config.js'
import type { TickInput } from '../sim/contracts.js'

export const MAX_FRAME_DELTA_SECONDS = 0.1 as const
export const MAX_SAMPLED_TICKS_PER_FRAME = 8 as const
export const MAX_PENDING_TICK_INPUTS = 120 as const
export const DEFAULT_TRANSPORT_BATCH_TICKS = 8 as const

export class FixedTickInputScheduler {
  private accumulatorSeconds = 0
  private readonly pending: TickInput[] = []
  private overloadCountValue = 0

  sampleFrame(frameDeltaSeconds: number, sampleInput: () => TickInput): number {
    const boundedDelta = Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA_SECONDS)
    this.accumulatorSeconds += boundedDelta
    let sampled = 0
    while (
      this.accumulatorSeconds >= PHYSICS_DT &&
      sampled < MAX_SAMPLED_TICKS_PER_FRAME &&
      this.pending.length < MAX_PENDING_TICK_INPUTS
    ) {
      this.pending.push(sampleInput())
      this.accumulatorSeconds -= PHYSICS_DT
      sampled += 1
    }
    if (this.accumulatorSeconds >= PHYSICS_DT) {
      // Under sustained overload, drop wall-clock debt rather than synthesizing unrecorded catch-up ticks.
      this.accumulatorSeconds = 0
      this.overloadCountValue += 1
    }
    return sampled
  }

  takeBatch(maxTicks = DEFAULT_TRANSPORT_BATCH_TICKS): TickInput[] {
    if (!Number.isInteger(maxTicks) || maxTicks <= 0) throw new Error('Transport batch size must be a positive integer')
    return this.pending.splice(0, Math.min(maxTicks, this.pending.length))
  }

  resetTiming(): void {
    this.accumulatorSeconds = 0
  }

  get alpha(): number {
    return Math.min(Math.max(this.accumulatorSeconds / PHYSICS_DT, 0), 1)
  }

  get pendingCount(): number {
    return this.pending.length
  }

  get overloadCount(): number {
    return this.overloadCountValue
  }
}
