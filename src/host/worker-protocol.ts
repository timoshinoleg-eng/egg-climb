import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { SimulationFrame } from './contracts.js'

export type WorkerRequestPayload =
  | { readonly type: 'init' }
  | { readonly type: 'advance'; readonly inputs: readonly TickInput[] }
  | { readonly type: 'fingerprint' }
  | { readonly type: 'reset' }
  | { readonly type: 'free' }

export type WorkerRequest = WorkerRequestPayload & { readonly id: number }

export type WorkerSuccessResponse =
  | { readonly id: number; readonly type: 'initialized'; readonly snapshot: SimulationSnapshot }
  | { readonly id: number; readonly type: 'advanced'; readonly frame: SimulationFrame }
  | { readonly id: number; readonly type: 'fingerprint'; readonly fingerprint: string }
  | { readonly id: number; readonly type: 'reset'; readonly snapshot: SimulationSnapshot }
  | { readonly id: number; readonly type: 'freed' }

export interface WorkerErrorResponse {
  readonly id: number
  readonly type: 'error'
  readonly message: string
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse
