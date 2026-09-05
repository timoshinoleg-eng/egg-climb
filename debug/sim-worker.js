import RAPIER from '/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs'
import { SimulationWorkerRuntime } from '../dist/host/worker-runtime.js'
import { WORKER_PROTOCOL_VERSION } from '../dist/sim/config.js'
import { PHYSICS_LAB_PRESETS } from '../dist/sim/physics-presets.js'
import { physicsLabScenario } from '../dist/sim/physics-lab-fixtures.js'

const query = new URL(self.location.href).searchParams
const presetKey = query.get('physics') ?? 'physics-v1'
const preset = presetKey === 'physics-v1' ? undefined : PHYSICS_LAB_PRESETS[presetKey]
if (presetKey !== 'physics-v1' && !preset) throw new Error(`Unknown Physics Lab preset: ${presetKey}`)
const scenarioKey = query.get('scenario')
const scenario = scenarioKey ? physicsLabScenario(scenarioKey) : undefined
const runtimeOptions = { ...(preset ? { preset } : {}), ...(scenario ? { level: scenario.level, initialEgg: scenario.initialEgg } : {}) }

const runtimePromise = RAPIER.init().then(() => new SimulationWorkerRuntime(RAPIER, runtimeOptions))

self.addEventListener('message', (event) => {
  const request = event.data
  runtimePromise
    .then(runtime => runtime.enqueue(request))
    .then(response => self.postMessage(response))
    .catch(error => {
      const id = Number.isInteger(request?.id) ? request.id : -1
      self.postMessage({
        id,
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    })
})
