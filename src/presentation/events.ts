/**
 * Ordered presentation events emitted from authoritative per-tick processing.
 *
 * Events are presentation-only observations. They are intentionally not part
 * of SimulationSnapshot, replay identity, fingerprints or authoritative state.
 * Losing one may lose a sound/VFX cue, but can never change a run result.
 */

export interface PresentationVec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type SimulationPresentationEventKind =
  | 'jump'
  | 'land'
  | 'hard-land'
  | 'fail'
  | 'checkpoint'
  | 'finish'

export interface SimulationPresentationEventBase {
  /** Stable transport identity: attemptId:tick:kind:ordinal. */
  readonly id: string
  /** Monotonic attempt identity within one SimulationHost lifetime. */
  readonly attemptId: number
  /** Completed simulation tick at which the presentation transition occurred. */
  readonly tick: number
  /** Stable ordering for multiple events emitted at the same tick. */
  readonly ordinal: number
  readonly position: PresentationVec3
}

export interface JumpEvent extends SimulationPresentationEventBase {
  readonly kind: 'jump'
  readonly source: 'support' | 'coyote' | 'buffer'
  readonly strength: number
}

export interface LandEvent extends SimulationPresentationEventBase {
  readonly kind: 'land'
  /** Presentation impact strength in [0, 1]. */
  readonly impact: number
}

export interface HardLandEvent extends SimulationPresentationEventBase {
  readonly kind: 'hard-land'
  /** Presentation impact strength in [0, 1]. */
  readonly impact: number
}

export interface FailEvent extends SimulationPresentationEventBase {
  readonly kind: 'fail'
  readonly reason: string
}

export interface CheckpointEvent extends SimulationPresentationEventBase {
  readonly kind: 'checkpoint'
  readonly checkpointId: string
}

export interface FinishEvent extends SimulationPresentationEventBase {
  readonly kind: 'finish'
}

export type SimulationPresentationEvent =
  | JumpEvent
  | LandEvent
  | HardLandEvent
  | FailEvent
  | CheckpointEvent
  | FinishEvent

export interface PersonalBestEvent {
  readonly id: string
  readonly kind: 'personal-best'
  readonly value: number
}

export interface MilestoneEvent {
  readonly id: string
  readonly kind: 'milestone'
  readonly milestoneId: string
}

/** Meta events come from persistence/product logic, not simulation transitions. */
export type MetaPresentationEvent = PersonalBestEvent | MilestoneEvent

export function simulationPresentationEventId(
  attemptId: number,
  tick: number,
  kind: SimulationPresentationEventKind,
  ordinal: number,
): string {
  return `${attemptId}:${tick}:${kind}:${ordinal}`
}

function comparePosition(a: SimulationPresentationEvent, b: SimulationPresentationEvent): number {
  if (a.attemptId !== b.attemptId) return a.attemptId < b.attemptId ? -1 : 1
  if (a.tick !== b.tick) return a.tick < b.tick ? -1 : 1
  if (a.ordinal !== b.ordinal) return a.ordinal < b.ordinal ? -1 : 1
  return 0
}

/**
 * Small exactly-once consumer cursor for ordered transport batches.
 *
 * Re-delivered events at or before the last consumed position are skipped;
 * out-of-order events inside a new batch are rejected. No unbounded Set of
 * event ids is needed because the transport contract is monotonic.
 */
export class PresentationEventCursor {
  private last: SimulationPresentationEvent | undefined

  take(events: readonly SimulationPresentationEvent[]): readonly SimulationPresentationEvent[] {
    const accepted: SimulationPresentationEvent[] = []
    let batchPrevious: SimulationPresentationEvent | undefined

    for (const event of events) {
      if (batchPrevious && comparePosition(event, batchPrevious) <= 0) {
        throw new Error('Presentation events must be strictly ordered within a batch')
      }
      batchPrevious = event

      if (this.last && comparePosition(event, this.last) <= 0) continue
      accepted.push(event)
      this.last = event
    }

    return accepted
  }

  reset(): void {
    this.last = undefined
  }
}
