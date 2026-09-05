import { initPhysics, RAPIER } from './rapier.js'
import { createSimulationWithRapier } from './simulation-core.js'
import type { Simulation, SimulationOptions } from './simulation-core.js'

export type { Simulation, SimulationOptions } from './simulation-core.js'

export async function createSimulation(options: SimulationOptions = {}): Promise<Simulation> {
  await initPhysics()
  return createSimulationWithRapier(RAPIER, options)
}
