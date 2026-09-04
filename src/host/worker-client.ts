import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { SimulationFrame, SimulationHost } from './contracts.js'
import type { WorkerRequest, WorkerRequestPayload, WorkerResponse, WorkerSuccessResponse } from './worker-protocol.js'

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

  constructor(url: string | URL) {
    this.worker = new Worker(url, { type: 'module', name: 'egg-climb-simulation' })
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (!response || typeof response !== 'object' || !Number.isInteger(response.id) || typeof response.type !== 'string') {
        this.fail(new Error('Simulation worker returned a malformed response'))
        return
      }
      const request = this.pending.get(response.id)
      if (!request) return
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

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }

  private fail(error: Error): void {
    if (this.closed) return
    this.closed = true
    this.worker.terminate()
    this.rejectAll(error)
  }

  private request<T extends WorkerSuccessResponse>(message: WorkerRequestPayload, expectedType: T['type']): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Simulation worker is closed'))
    const id = this.nextId
    this.nextId += 1
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { expectedType, resolve: response => resolve(response as T), reject })
      this.worker.postMessage({ ...message, id } satisfies WorkerRequest)
    })
  }

  async init(): Promise<SimulationSnapshot> {
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'initialized' }>>({ type: 'init' }, 'initialized')
    return response.snapshot
  }

  async advance(inputs: readonly TickInput[]): Promise<SimulationFrame> {
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'advanced' }>>({ type: 'advance', inputs }, 'advanced')
    return response.frame
  }

  async fingerprint(): Promise<string> {
    const response = await this.request<Extract<WorkerSuccessResponse, { type: 'fingerprint' }>>({ type: 'fingerprint' }, 'fingerprint')
    return response.fingerprint
  }

  async reset(): Promise<SimulationSnapshot> {
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
        this.worker.terminate()
        this.rejectAll(new Error('Simulation worker closed'))
      }
    }
  }
}
