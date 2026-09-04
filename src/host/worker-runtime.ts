import {
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  SIMULATION_VERSION,
  WORKER_PROTOCOL_VERSION,
} from '../sim/config.js'
import type { TickInput } from '../sim/contracts.js'
import type { RapierApi } from '../sim/rapier.js'
import { createSimulationWithRapier } from '../sim/simulation-core.js'
import type { Simulation } from '../sim/simulation-core.js'
import { assertTickInputs } from './validation.js'
import type { WorkerRequest, WorkerResponse, WorkerRuntimeInfo } from './worker-protocol.js'

const RUNTIME_INFO: WorkerRuntimeInfo = Object.freeze({
  runtime: 'worker',
  workerProtocolVersion: WORKER_PROTOCOL_VERSION,
  simulationVersion: SIMULATION_VERSION,
  rapierPackage: RAPIER_PACKAGE,
  rapierVersion: RAPIER_VERSION,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export class SimulationWorkerRuntime {
  private simulation: Simulation | undefined
  private previous
  private current
  private closed = false
  private requestQueue: Promise<void> = Promise.resolve()

  constructor(private readonly RAPIER: RapierApi) {}

  enqueue(rawRequest: unknown): Promise<WorkerResponse> {
    let resolveResponse: (response: WorkerResponse) => void = () => undefined
    const responsePromise = new Promise<WorkerResponse>((resolve) => { resolveResponse = resolve })
    this.requestQueue = this.requestQueue.then(async () => {
      resolveResponse(this.handle(rawRequest))
    }, async () => {
      resolveResponse(this.handle(rawRequest))
    })
    return responsePromise
  }

  private response(id: number, response: Omit<WorkerResponse, 'id' | 'protocolVersion'>): WorkerResponse {
    return { ...response, id, protocolVersion: WORKER_PROTOCOL_VERSION } as WorkerResponse
  }

  private error(id: number, message: string): WorkerResponse {
    return this.response(id, { type: 'error', message })
  }

  private createFreshSimulation(): void {
    this.simulation?.free()
    this.simulation = createSimulationWithRapier(this.RAPIER)
    this.previous = this.simulation.snapshot()
    this.current = this.previous
  }

  private handle(rawRequest: unknown): WorkerResponse {
    const id = isRecord(rawRequest) && Number.isInteger(rawRequest.id) ? rawRequest.id as number : -1
    try {
      if (!isRecord(rawRequest)) return this.error(id, 'Malformed simulation worker request')
      if (rawRequest.protocolVersion !== WORKER_PROTOCOL_VERSION) return this.error(id, 'Simulation worker protocol version mismatch')
      if (typeof rawRequest.type !== 'string') return this.error(id, 'Malformed simulation worker request')
      const request = rawRequest as unknown as WorkerRequest

      if (request.type === 'free') {
        if (!this.closed) {
          this.simulation?.free()
          this.simulation = undefined
          this.previous = undefined
          this.current = undefined
          this.closed = true
        }
        return this.response(id, { type: 'freed' })
      }

      if (this.closed) return this.error(id, 'Simulation worker is closed')

      if (request.type === 'init') {
        if (this.simulation) return this.error(id, 'Simulation worker is already initialized')
        this.createFreshSimulation()
        return this.response(id, { type: 'initialized', snapshot: this.current, runtimeInfo: RUNTIME_INFO })
      }

      if (!this.simulation) return this.error(id, 'Simulation worker is not initialized')

      if (request.type === 'advance') {
        assertTickInputs(request.inputs as readonly TickInput[])
        for (const input of request.inputs) {
          this.previous = this.current
          this.simulation.step(input)
          this.current = this.simulation.snapshot()
        }
        return this.response(id, { type: 'advanced', frame: { previous: this.previous, current: this.current, stepped: request.inputs.length } })
      }

      if (request.type === 'fingerprint') {
        return this.response(id, { type: 'fingerprint', fingerprint: this.simulation.fingerprint(), tick: this.simulation.tick })
      }

      if (request.type === 'reset') {
        this.createFreshSimulation()
        return this.response(id, { type: 'reset', snapshot: this.current })
      }

      return this.error(id, 'Unsupported simulation worker request')
    } catch (error) {
      return this.error(id, error instanceof Error ? error.message : String(error))
    }
  }
}
