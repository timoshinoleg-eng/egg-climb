import RAPIER from '/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs'
import { assertTickInputs } from '../dist/host/validation.js'
import { createSimulationWithRapier } from '../dist/sim/simulation-core.js'

let initializedPhysics = false
let simulation
let previous
let current
let requestQueue = Promise.resolve()

async function ensurePhysics() {
  if (!initializedPhysics) {
    await RAPIER.init()
    initializedPhysics = true
  }
}

async function createFreshSimulation() {
  await ensurePhysics()
  simulation?.free()
  simulation = createSimulationWithRapier(RAPIER)
  previous = simulation.snapshot()
  current = previous
  return current
}

async function handleRequest(request) {
  const id = Number.isInteger(request?.id) ? request.id : -1
  try {
    if (request?.type === 'init') {
      if (simulation) throw new Error('Simulation worker is already initialized')
      const snapshot = await createFreshSimulation()
      self.postMessage({ id, type: 'initialized', snapshot })
      return
    }
    if (request?.type === 'advance') {
      if (!simulation) throw new Error('Simulation worker is not initialized')
      assertTickInputs(request.inputs)
      for (const input of request.inputs) {
        previous = current
        simulation.step(input)
        current = simulation.snapshot()
      }
      self.postMessage({ id, type: 'advanced', frame: { previous, current, stepped: request.inputs.length } })
      return
    }
    if (request?.type === 'fingerprint') {
      if (!simulation) throw new Error('Simulation worker is not initialized')
      self.postMessage({ id, type: 'fingerprint', fingerprint: simulation.fingerprint() })
      return
    }
    if (request?.type === 'reset') {
      if (!simulation) throw new Error('Simulation worker is not initialized')
      const snapshot = await createFreshSimulation()
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
}

self.addEventListener('message', (event) => {
  requestQueue = requestQueue.then(() => handleRequest(event.data))
})
