import {
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  SIMULATION_VERSION,
  WORKER_PROTOCOL_VERSION,
} from '../sim/config.js'
import type { SimulationSnapshot, TickInput } from '../sim/contracts.js'
import type { SimulationFrame } from './contracts.js'

export interface WorkerRuntimeInfo {
  readonly runtime: 'worker'
  readonly workerProtocolVersion: typeof WORKER_PROTOCOL_VERSION
  readonly simulationVersion: typeof SIMULATION_VERSION
  readonly rapierPackage: typeof RAPIER_PACKAGE
  readonly rapierVersion: typeof RAPIER_VERSION
}

export const EXPECTED_WORKER_RUNTIME_INFO: WorkerRuntimeInfo = Object.freeze({
  runtime: 'worker',
  workerProtocolVersion: WORKER_PROTOCOL_VERSION,
  simulationVersion: SIMULATION_VERSION,
  rapierPackage: RAPIER_PACKAGE,
  rapierVersion: RAPIER_VERSION,
})

export type WorkerRequestPayload =
  | { readonly type: 'init' }
  | { readonly type: 'advance'; readonly inputs: readonly TickInput[] }
  | { readonly type: 'fingerprint' }
  | { readonly type: 'reset' }
  | { readonly type: 'free' }

export type WorkerRequest = WorkerRequestPayload & {
  readonly id: number
  readonly protocolVersion: typeof WORKER_PROTOCOL_VERSION
}

type WorkerResponseBase = {
  readonly id: number
  readonly protocolVersion: typeof WORKER_PROTOCOL_VERSION
}

export type WorkerSuccessResponse =
  | (WorkerResponseBase & { readonly type: 'initialized'; readonly snapshot: SimulationSnapshot; readonly runtimeInfo: WorkerRuntimeInfo })
  | (WorkerResponseBase & { readonly type: 'advanced'; readonly frame: SimulationFrame })
  | (WorkerResponseBase & { readonly type: 'fingerprint'; readonly fingerprint: string; readonly tick: number })
  | (WorkerResponseBase & { readonly type: 'reset'; readonly snapshot: SimulationSnapshot })
  | (WorkerResponseBase & { readonly type: 'freed' })

export type WorkerErrorResponse = WorkerResponseBase & {
  readonly type: 'error'
  readonly message: string
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse
