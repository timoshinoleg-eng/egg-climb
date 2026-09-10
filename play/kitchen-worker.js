import RAPIER from '/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs'
import { SimulationWorkerRuntime } from '../dist/host/worker-runtime.js'
import { WORKER_PROTOCOL_VERSION } from '../dist/sim/config.js'
import { KITCHEN_OPTIONS } from '../dist/game/kitchen-run.js'

// Never accepts fixture boxes, alternate spawn, or physics overrides from the URL.
const runtime = RAPIER.init().then(() => new SimulationWorkerRuntime(RAPIER, KITCHEN_OPTIONS))
self.addEventListener('message', event => {
  void runtime.then(value => value.enqueue(event.data)).then(
    response => self.postMessage(response),
    error => self.postMessage({ id: event.data?.id ?? -1, type: 'error', protocolVersion: WORKER_PROTOCOL_VERSION, message: error instanceof Error ? error.message : String(error) }),
  )
})
