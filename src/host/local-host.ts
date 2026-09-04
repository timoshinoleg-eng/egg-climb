import type { TickInput } from '../sim/contracts.js'
import { createSimulation } from '../sim/simulation.js'
import type { Simulation } from '../sim/simulation.js'
import type { SimulationFrame, SimulationHost } from './contracts.js'

function assertSteps(steps: number): void {
  if (!Number.isInteger(steps) || steps < 0 || steps > 120) throw new Error('Invalid simulation advance step count')
}

export class LocalSimulationHost implements SimulationHost {
  private simulation: Simulation | undefined

  async init() {
    if (this.simulation) throw new Error('Simulation host already initialized')
    this.simulation = await createSimulation()
    return this.simulation.snapshot()
  }

  async advance(steps: number, input: TickInput): Promise<SimulationFrame> {
    assertSteps(steps)
    if (!this.simulation) throw new Error('Simulation host is not initialized')
    let previous = this.simulation.snapshot()
    let current = previous
    for (let index = 0; index < steps; index += 1) {
      previous = current
      this.simulation.step(input)
      current = this.simulation.snapshot()
    }
    return { previous, current, stepped: steps }
  }

  async reset() {
    this.simulation?.free()
    this.simulation = await createSimulation()
    return this.simulation.snapshot()
  }

  async free() {
    this.simulation?.free()
    this.simulation = undefined
  }
}
