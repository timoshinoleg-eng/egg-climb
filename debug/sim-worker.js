import RAPIER from '/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs'
import { SimulationWorkerRuntime } from '../dist/host/worker-runtime.js'
import { WORKER_PROTOCOL_VERSION } from '../dist/sim/config.js'

const runtimePromise = RAPIER.init().then(() => new SimulationWorkerRuntime(RAPIER))

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
