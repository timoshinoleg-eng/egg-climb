import {
  FOUNDATION_ASSIST_PRESET_ID,
  FOUNDATION_CONTROL_MODE,
  FOUNDATION_DIMENSION_MODE,
  FOUNDATION_LEVEL_ID,
  FOUNDATION_LEVEL_VERSION,
  FOUNDATION_SEED,
  PHYSICS_HZ,
  PHYSICS_PRESET_ID,
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  REPLAY_PROTOCOL_VERSION,
  SIMULATION_VERSION,
} from './config.js'

export type DimensionMode = '2.5d' | '3d'
export type ControlMode = 'tap' | 'hold-release'

export interface TickInput {
  readonly moveX: number
  readonly moveZ: number
  readonly jumpDown: boolean
  readonly jumpUp: boolean
}

export const NEUTRAL_INPUT: TickInput = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })

export type ReplayInputEvent =
  | { readonly tick: number; readonly seq: number; readonly kind: 'move'; readonly moveX: number; readonly moveZ: number }
  | { readonly tick: number; readonly seq: number; readonly kind: 'jump'; readonly down: boolean }

export interface ReplayHeader {
  readonly protocolVersion: typeof REPLAY_PROTOCOL_VERSION
  readonly simulationVersion: typeof SIMULATION_VERSION
  readonly rapierPackage: typeof RAPIER_PACKAGE
  readonly rapierVersion: typeof RAPIER_VERSION
  readonly physicsPresetId: typeof PHYSICS_PRESET_ID
  readonly tickRate: typeof PHYSICS_HZ
  readonly levelId: string
  readonly levelVersion: number
  readonly seed: number
  readonly dimensionMode: DimensionMode
  readonly controlMode: ControlMode
  readonly assistPresetId: string
}

export interface Replay { readonly header: ReplayHeader; readonly inputEvents: readonly ReplayInputEvent[]; readonly finishTick: number }

export interface SimulationSnapshot {
  readonly tick: number
  readonly position: Readonly<{ x: number; y: number; z: number }>
  readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>
  readonly linearVelocity: Readonly<{ x: number; y: number; z: number }>
  readonly angularVelocity: Readonly<{ x: number; y: number; z: number }>
}

export function defaultReplayHeader(): ReplayHeader {
  return {
    protocolVersion: REPLAY_PROTOCOL_VERSION,
    simulationVersion: SIMULATION_VERSION,
    rapierPackage: RAPIER_PACKAGE,
    rapierVersion: RAPIER_VERSION,
    physicsPresetId: PHYSICS_PRESET_ID,
    tickRate: PHYSICS_HZ,
    levelId: FOUNDATION_LEVEL_ID,
    levelVersion: FOUNDATION_LEVEL_VERSION,
    seed: FOUNDATION_SEED,
    dimensionMode: FOUNDATION_DIMENSION_MODE,
    controlMode: FOUNDATION_CONTROL_MODE,
    assistPresetId: FOUNDATION_ASSIST_PRESET_ID,
  }
}
