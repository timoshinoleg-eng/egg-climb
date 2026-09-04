import RAPIER from '/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs'
import { createSimulationWithRapier } from '../dist/sim/simulation-core.js'

let initializedPhysics = false
let simulation
let previous
let current

async function ensurePhysics() {
  if (!initializedPhysics) {
    await RAPIER.init()
    initializedPhysics = true
  }
}

async function resetSimulation() {
  await ensurePhysics()
  simulation?.free()
  simulation = createSimulationWithRapier(RAPIER)
  previous = simulation.snapshot()
  current = previous
  return current
}

function validateAdvance(steps, input) {
  if (!Number.isInteger(steps) || steps < 0 || steps > 120) throw new Error('Invalid simulation advance step count')
  if (!input || !Number.isFinite(input.moveX) || !Number.isFinite(input.moveZ)) throw new Error('Invalid simulation input')
  if (typeof input.jumpDown !== 'boolean' || typeof input.jumpUp !== 'boolean') throw new Error('Invalid simulation input edges')
}

self.addEventListener('message', async (event) => {
  const request = event.data
  const id = Number.isInteger(request?.id) ? request.id : -1
  try {
    if (request?.type === 'init') {
      const snapshot = await resetSimulation()
      self.postMessage({ id, type: 'initialized', snapshot })
      return
    }
    if (request?.type === 'advance') {
      if (!simulation) throw new Error('Simulation worker is not initialized')
      validateAdvance(request.steps, request.input)
      for (let index = 0; index < request.steps; index += 1) {
        previous = current
        simulation.step(request.input)
        current = simulation.snapshot()
      }
      self.postMessage({ id, type: 'advanced', frame: { previous, current, stepped: request.steps } })
      return
    }
    if (request?.type === 'reset') {
      const snapshot = await resetSimulation()
      self.postMessage({ id, type: 'reset', snapshot })
      return
    }
    if (request?.type === 'free') {
      simulation?.free()
      simulation = undefined
      previous = undefined
      current = undefined
      self.postMessage({ id, type: 'freed' })
      return
    }
    throw new Error('Unsupported simulation worker request')
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})
