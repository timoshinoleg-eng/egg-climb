import type { TickInput } from '../sim/contracts.js'
import { createSimulation } from '../sim/simulation.js'
import type { Simulation } from '../sim/simulation.js'
import type { SimulationFrame, SimulationHost } from './contracts.js'
import { assertTickInputs } from './validation.js'

export class LocalSimulationHost implements SimulationHost {
  private simulation: Simulation | undefined
  private closed = false

  async init() {
    if (this.closed) throw new Error('Simulation host is closed')
    if (this.simulation) throw new Error('Simulation host already initialized')
    this.simulation = await createSimulation()
    return this.simulation.snapshot()
  }

  async advance(inputs: readonly TickInput[]): Promise<SimulationFrame> {
    if (this.closed) throw new Error('Simulation host is closed')
    if (!this.simulation) throw new Error('Simulation host is not initialized')
    assertTickInputs(inputs)
    let previous = this.simulation.snapshot()
    let current = previous
    for (const input of inputs) {
      previous = current
      this.simulation.step(input)
      current = this.simulation.snapshot()
    }
    return { previous, current, stepped: inputs.length }
  }

  async fingerprint(): Promise<string> {
    if (this.closed) throw new Error('Simulation host is closed')
    if (!this.simulation) throw new Error('Simulation host is not initialized')
    return this.simulation.fingerprint()
  }

  async reset() {
    if (this.closed) throw new Error('Simulation host is closed')
    if (!this.simulation) throw new Error('Simulation host is not initialized')
    this.simulation.free()
    this.simulation = await createSimulation()
    return this.simulation.snapshot()
  }

  async free() {
    if (this.closed) return
    this.simulation?.free()
    this.simulation = undefined
    this.closed = true
  }
}
