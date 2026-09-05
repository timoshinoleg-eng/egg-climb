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
import { computePhysicsPresetHash, immutablePhysicsPreset, PHYSICS_V1 } from '../sim/physics-presets.js'
import type { PhysicsPreset } from '../sim/physics-presets.js'
import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { SimulationFrame, SimulationHost } from './contracts.js'
import { assertTickInputs } from './validation.js'
import type { WorkerRequest, WorkerRequestPayload, WorkerResponse, WorkerRuntimeInfo, WorkerSuccessResponse } from './worker-protocol.js'

type SuccessType = WorkerSuccessResponse['type']

type PendingRequest = {
  readonly expectedType: SuccessType
  readonly resolve: (response: WorkerSuccessResponse) => void
  readonly reject: (error: Error) => void
}

export class WorkerSimulationHost implements SimulationHost {
  private readonly worker: Worker
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private closed = false
  private initialized = false
  private runtimeInfoValue: WorkerRuntimeInfo | undefined

  private readonly expectedPreset: PhysicsPreset

  constructor(url: string | URL, expectedPreset: PhysicsPreset = PHYSICS_V1) {
    this.expectedPreset = immutablePhysicsPreset(expectedPreset)
    this.worker = new Worker(url, { type: 'module', name: 'egg-climb-simulation' })
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (!response || typeof response !== 'object' || !Number.isInteger(response.id) || typeof response.type !== 'string') {
        this.fail(new Error('Simulation worker returned a malformed response'))
        return
      }
      if (response.protocolVersion !== WORKER_PROTOCOL_VERSION) {
        this.fail(new Error('Simulation worker protocol version mismatch'))
        return
      }
      const request = this.pending.get(response.id)
      if (!request) {
        this.fail(new Error(`Simulation worker returned an unknown response id: ${response.id}`))
        return
      }
      if (response.type === 'error') {
        this.pending.delete(response.id)
        request.reject(new Error(response.message))
        return
      }
      if (response.type !== request.expectedType) {
        this.fail(new Error(`Simulation worker protocol mismatch: expected ${request.expectedType}, received ${response.type}`))
        return
      }
      this.pending.delete(response.id)
      request.resolve(response)
    })
    this.worker.addEventListener('error', (event) => {
      this.fail(new Error(event.message || 'Simulation worker failed'))
    })
    this.worker.addEventListener('messageerror', () => {
      this.fail(new Error('Simulation worker message could not be decoded'))
    })
  }

  get runtimeInfo(): WorkerRuntimeInfo | undefined {
    return this.runtimeInfoValue
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }

  private fail(error: Error): void {
    if (this.closed) return
    this.closed = true
    this.initialized = false
    this.worker.terminate()
    this.rejectAll(error)
  }

  private request<T extends WorkerSuccessResponse>(message: WorkerRequestPayload, expectedType: T['type']): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Simulation worker is closed'))
    const id = this.nextId
    this.nextId += 1
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { expectedType, resolve: response => resolve(response as T), reject })
      this.worker.postMessage({ ...message, id, protocolVersion: WORKER_PROTOCOL_VERSION } satisfies WorkerRequest)
    })
  }

  async init(): Promise<SimulationSnapshot> {
    if (this.closed) throw new Error('Simulation worker is closed')
    if (this.initialized) throw new Error('Simulation worker is already initialized')
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'initialized' }>>({ type: 'init' }, 'initialized')
    const info = response.runtimeInfo
    if (
      info.runtime !== 'worker' ||
      info.workerProtocolVersion !== WORKER_PROTOCOL_VERSION ||
      info.simulationVersion !== SIMULATION_VERSION ||
      info.rapierPackage !== RAPIER_PACKAGE ||
      info.rapierVersion !== RAPIER_VERSION ||
      info.physicsPresetId !== this.expectedPreset.id ||
      info.physicsPresetVersion !== this.expectedPreset.version ||
      info.physicsPresetHash !== computePhysicsPresetHash(this.expectedPreset) ||
      info.eggColliderId !== EGG_COLLIDER_ID ||
      info.eggColliderVersion !== EGG_COLLIDER_VERSION ||
      info.eggColliderHash !== EGG_COLLIDER_HASH
    ) {
      this.fail(new Error('Simulation worker runtime handshake mismatch'))
      throw new Error('Simulation worker runtime handshake mismatch')
    }
    this.runtimeInfoValue = info
    this.initialized = true
    return response.snapshot
  }

  async advance(inputs: readonly TickInput[]): Promise<SimulationFrame> {
    if (!this.initialized) throw new Error('Simulation worker is not initialized')
    assertTickInputs(inputs)
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'advanced' }>>({ type: 'advance', inputs }, 'advanced')
    return response.frame
  }

  async fingerprint(): Promise<string> {
    if (!this.initialized) throw new Error('Simulation worker is not initialized')
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'fingerprint' }>>({ type: 'fingerprint' }, 'fingerprint')
    return response.fingerprint
  }

  async reset(): Promise<SimulationSnapshot> {
    if (!this.initialized) throw new Error('Simulation worker is not initialized')
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'reset' }>>({ type: 'reset' }, 'reset')
    return response.snapshot
  }

  async free(): Promise<void> {
    if (this.closed) return
    try {
      await this.request<Extract<WorkerSuccessResponse, { type: 'freed' }>>({ type: 'free' }, 'freed')
    } finally {
      if (!this.closed) {
        this.closed = true
        this.initialized = false
        this.worker.terminate()
        this.rejectAll(new Error('Simulation worker closed'))
      }
    }
  }
}
