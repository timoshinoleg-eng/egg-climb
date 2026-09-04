import RAPIER from '/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs'
import { SimulationWorkerRuntime } from '../dist/host/worker-runtime.js'

await RAPIER.init()
const runtime = new SimulationWorkerRuntime(RAPIER)

self.addEventListener('message', (event) => {
  runtime.enqueue(event.data).then((response) => self.postMessage(response))
})
