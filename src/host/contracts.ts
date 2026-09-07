import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { SimulationPresentationEvent } from '../presentation/events.js'

export interface SimulationFrame {
  readonly previous: SimulationSnapshot
  readonly current: SimulationSnapshot
  readonly stepped: number
  /** Ordered presentation-only events observed during every tick in this batch. */
  readonly events: readonly SimulationPresentationEvent[]
}

export interface SimulationHost {
  init(): Promise<SimulationSnapshot>
  /** Advance exactly one authoritative physics tick per input entry, in array order. */
  advance(inputs: readonly TickInput[]): Promise<SimulationFrame>
  fingerprint(): Promise<string>
  reset(): Promise<SimulationSnapshot>
  free(): Promise<void>
}
