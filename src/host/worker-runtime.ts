import { DEFAULT_FEEL, computeFeelPresetHash } from '../sim/feel-presets.js'
import { immutableSimulationOptions } from '../sim/simulation-core.js'
import {
  EGG_COLLIDER_HASH,
  EGG_COLLIDER_ID,
  EGG_COLLIDER_VERSION,
  PHYSICS_PRESET_HASH,
  PHYSICS_PRESET_ID,
  PHYSICS_PRESET_VERSION,
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  SIMULATION_VERSION,
  WORKER_PROTOCOL_VERSION,
} from '../sim/config.js'
import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { RapierApi } from '../sim/rapier.js'
import { createSimulationWithRapier } from '../sim/simulation-core.js'
import { computePhysicsPresetHash, PHYSICS_V1 } from '../sim/physics-presets.js'
import type { SimulationOptions } from '../sim/simulation-core.js'
import type { Simulation } from '../sim/simulation-core.js'
import { assertTickInputs } from './validation.js'
import type { WorkerRequest, WorkerResponse, WorkerRuntimeInfo } from './worker-protocol.js'

const RUNTIME_INFO: WorkerRuntimeInfo = Object.freeze({
  feelPresetId: DEFAULT_FEEL.id, feelPresetVersion: DEFAULT_FEEL.version, feelPresetHash: computeFeelPresetHash(DEFAULT_FEEL),
  runtime: 'worker',
  workerProtocolVersion: WORKER_PROTOCOL_VERSION,
  simulationVersion: SIMULATION_VERSION,
  rapierPackage: RAPIER_PACKAGE,
  rapierVersion: RAPIER_VERSION,
  physicsPresetId: PHYSICS_PRESET_ID,
  physicsPresetVersion: PHYSICS_PRESET_VERSION,
  physicsPresetHash: PHYSICS_PRESET_HASH,
  eggColliderId: EGG_COLLIDER_ID,
  eggColliderVersion: EGG_COLLIDER_VERSION,
  eggColliderHash: EGG_COLLIDER_HASH,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export class SimulationWorkerRuntime {
  private simulation: Simulation | undefined
  private previous: SimulationSnapshot | undefined
  private current: SimulationSnapshot | undefined
  private closed = false
  private requestQueue: Promise<void> = Promise.resolve()

  private readonly options: SimulationOptions

  constructor(private readonly RAPIER: RapierApi, options: SimulationOptions = {}) { this.options = immutableSimulationOptions(options) }

  enqueue(rawRequest: unknown): Promise<WorkerResponse> {
    let resolveResponse: (response: WorkerResponse) => void = () => undefined
    const responsePromise = new Promise<WorkerResponse>((resolve) => { resolveResponse = resolve })
    const run = () => { resolveResponse(this.handle(rawRequest)) }
    this.requestQueue = this.requestQueue.then(run, run)
    return responsePromise
  }

  private error(id: number, message: string): WorkerResponse {
    return { id, protocolVersion: WORKER_PROTOCOL_VERSION, type: 'error', message }
  }

  private createFreshSimulation(): SimulationSnapshot {
    this.simulation?.free()
    this.simulation = createSimulationWithRapier(this.RAPIER, this.options)
    const snapshot = this.simulation.snapshot()
    this.previous = snapshot
    this.current = snapshot
    return snapshot
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
        return { id, protocolVersion: WORKER_PROTOCOL_VERSION, type: 'freed' }
      }

      if (this.closed) return this.error(id, 'Simulation worker is closed')

      if (request.type === 'init') {
        if (this.simulation) return this.error(id, 'Simulation worker is already initialized')
        const snapshot = this.createFreshSimulation()
        return { id, protocolVersion: WORKER_PROTOCOL_VERSION, type: 'initialized', snapshot, runtimeInfo: { ...RUNTIME_INFO, feelPresetId: (this.options.feel ?? DEFAULT_FEEL).id, feelPresetVersion: (this.options.feel ?? DEFAULT_FEEL).version, feelPresetHash: computeFeelPresetHash(this.options.feel ?? DEFAULT_FEEL), physicsPresetId: (this.options.preset ?? PHYSICS_V1).id, physicsPresetVersion: (this.options.preset ?? PHYSICS_V1).version, physicsPresetHash: computePhysicsPresetHash(this.options.preset ?? PHYSICS_V1) } }
      }

      if (!this.simulation || !this.current) return this.error(id, 'Simulation worker is not initialized')

      if (request.type === 'advance') {
        assertTickInputs(request.inputs as readonly TickInput[])
        let previous = this.current
        let current = previous
        for (const input of request.inputs) {
          previous = current
          this.simulation.step(input)
          current = this.simulation.snapshot()
        }
        this.previous = previous
        this.current = current
        return { id, protocolVersion: WORKER_PROTOCOL_VERSION, type: 'advanced', frame: { previous, current, stepped: request.inputs.length } }
      }

      if (request.type === 'fingerprint') {
        return { id, protocolVersion: WORKER_PROTOCOL_VERSION, type: 'fingerprint', fingerprint: this.simulation.fingerprint(), tick: this.simulation.tick }
      }

      if (request.type === 'reset') {
        const snapshot = this.createFreshSimulation()
        return { id, protocolVersion: WORKER_PROTOCOL_VERSION, type: 'reset', snapshot }
      }

      return this.error(id, 'Unsupported simulation worker request')
    } catch (error) {
      return this.error(id, error instanceof Error ? error.message : String(error))
    }
  }
}
