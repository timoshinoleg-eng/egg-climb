import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { SimulationFrame, SimulationHost } from './contracts.js'
import type { WorkerRequest, WorkerRequestPayload, WorkerResponse } from './worker-protocol.js'

type PendingRequest = {
  readonly resolve: (response: WorkerResponse) => void
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
      const request = this.pending.get(response.id)
      if (!request) return
      this.pending.delete(response.id)
      if (response.type === 'error') request.reject(new Error(response.message))
      else request.resolve(response)
    })
    this.worker.addEventListener('error', (event) => {
      this.rejectAll(new Error(event.message || 'Simulation worker failed'))
    })
    this.worker.addEventListener('messageerror', () => {
      this.rejectAll(new Error('Simulation worker message could not be decoded'))
    })
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }

  private request<T extends WorkerResponse>(message: WorkerRequestPayload): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Simulation worker is closed'))
    const id = this.nextId
    this.nextId += 1
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: response => resolve(response as T), reject })
      this.worker.postMessage({ ...message, id } satisfies WorkerRequest)
    })
  }

  async init(): Promise<SimulationSnapshot> {
    const response = await this.request<Extract<WorkerResponse, { type: 'initialized' }>>({ type: 'init' })
    return response.snapshot
  }

  async advance(steps: number, input: TickInput): Promise<SimulationFrame> {
    const response = await this.request<Extract<WorkerResponse, { type: 'advanced' }>>({ type: 'advance', steps, input })
    return response.frame
  }

  async reset(): Promise<SimulationSnapshot> {
    const response = await this.request<Extract<WorkerResponse, { type: 'reset' }>>({ type: 'reset' })
    return response.snapshot
  }

  async free(): Promise<void> {
    if (this.closed) return
    try {
      await this.request<Extract<WorkerResponse, { type: 'freed' }>>({ type: 'free' })
    } finally {
      this.closed = true
      this.worker.terminate()
      this.rejectAll(new Error('Simulation worker closed'))
    }
  }
}
