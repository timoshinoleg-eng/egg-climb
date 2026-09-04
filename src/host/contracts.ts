import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'

export interface SimulationFrame {
  readonly previous: SimulationSnapshot
  readonly current: SimulationSnapshot
  readonly stepped: number
}

export interface SimulationHost {
  init(): Promise<SimulationSnapshot>
  advance(steps: number, input: TickInput): Promise<SimulationFrame>
  reset(): Promise<SimulationSnapshot>
  free(): Promise<void>
}
