import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'

export interface SimulationFrame {
  readonly previous: SimulationSnapshot
  readonly current: SimulationSnapshot
  readonly stepped: number
}

export interface SimulationHost {
  init(): Promise<SimulationSnapshot>
  /** Advance exactly one authoritative physics tick per input entry, in array order. */
  advance(inputs: readonly TickInput[]): Promise<SimulationFrame>
  fingerprint(): Promise<string>
  reset(): Promise<SimulationSnapshot>
  free(): Promise<void>
}
