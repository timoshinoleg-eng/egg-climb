import { initPhysics, RAPIER } from './rapier.js'
import { createSimulationWithRapier } from './simulation-core.js'
import type { Simulation } from './simulation-core.js'

export type { Simulation } from './simulation-core.js'

export async function createSimulation(): Promise<Simulation> {
  await initPhysics()
  return createSimulationWithRapier(RAPIER)
}
