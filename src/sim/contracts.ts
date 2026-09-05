import type { FeelState, FeelJump } from './feel-controller.js'
import { DEFAULT_FEEL, computeFeelPresetHash } from './feel-presets.js'
import type { FeelPreset } from './feel-presets.js'
import {
  EGG_COLLIDER_HASH,
  EGG_COLLIDER_ID,
  EGG_COLLIDER_VERSION,
  FINGERPRINT_VERSION,
  FOUNDATION_ASSIST_PRESET_ID,
  FOUNDATION_CONTROL_MODE,
  FOUNDATION_DIMENSION_MODE,
  FOUNDATION_LEVEL_ID,
  FOUNDATION_LEVEL_VERSION,
  FOUNDATION_SEED,
  PHYSICS_HZ,
  PHYSICS_PRESET_HASH,
  PHYSICS_PRESET_ID,
  PHYSICS_PRESET_VERSION,
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
  readonly jumpCancel?: boolean
}

export const NEUTRAL_INPUT: TickInput = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })

export type ReplayInputEvent =
  | { readonly tick: number; readonly seq: number; readonly kind: 'move'; readonly moveX: number; readonly moveZ: number }
  | { readonly tick: number; readonly seq: number; readonly kind: 'jump'; readonly down: boolean }
  | { readonly tick: number; readonly seq: number; readonly kind: 'jump-cancel' }

export interface ReplayHeader {
  readonly protocolVersion: typeof REPLAY_PROTOCOL_VERSION
  readonly simulationVersion: typeof SIMULATION_VERSION
  readonly rapierPackage: typeof RAPIER_PACKAGE
  readonly rapierVersion: typeof RAPIER_VERSION
  readonly fingerprintVersion: typeof FINGERPRINT_VERSION
  readonly physicsPresetId: typeof PHYSICS_PRESET_ID
  readonly physicsPresetVersion: typeof PHYSICS_PRESET_VERSION
  readonly physicsPresetHash: typeof PHYSICS_PRESET_HASH
  readonly eggColliderId: typeof EGG_COLLIDER_ID
  readonly eggColliderVersion: typeof EGG_COLLIDER_VERSION
  readonly eggColliderHash: typeof EGG_COLLIDER_HASH
  readonly feelPresetId: string
  readonly feelPresetVersion: number
  readonly feelPresetHash: string
  readonly tickRate: typeof PHYSICS_HZ
  readonly levelId: string
  readonly levelVersion: number
  readonly seed: number
  readonly dimensionMode: DimensionMode
  readonly controlMode: ControlMode
  readonly assistPresetId: string
}

export interface Replay {
  readonly header: ReplayHeader
  readonly inputEvents: readonly ReplayInputEvent[]
  readonly finishTick: number
  /** Untrusted client telemetry. A mismatch is nondeterminism evidence, never proof of cheating. */
  readonly clientFingerprint?: string
}

export interface Vector3Snapshot {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface PhysicsDebugSnapshot {
  readonly grounded: boolean
  readonly contactT: number | null
  readonly supportContactLocal: Vector3Snapshot | null
  readonly supportContactWorld: Vector3Snapshot | null
  readonly supportNormal: Vector3Snapshot | null
  readonly contactDistance: number | null
  readonly jumpStrength: number | null
  readonly jumpDirection: Vector3Snapshot | null
}

export interface SimulationSnapshot {
  readonly tick: number
  readonly identity: Readonly<{
    simulationVersion: string
    rapierPackage: string
    rapierVersion: string
    feelPresetId: string
    feelPresetVersion: number
    feelPresetHash: string
    physicsPresetId: string
    physicsPresetVersion: number
    physicsPresetHash: string
    eggColliderId: string
    eggColliderVersion: number
    eggColliderHash: string
  }>
  readonly position: Vector3Snapshot
  readonly rotation: Readonly<{ x: number; y: number; z: number; w: number }>
  readonly linearVelocity: Vector3Snapshot
  readonly angularVelocity: Vector3Snapshot
  readonly feel: Readonly<FeelState> & Readonly<{ lastJumpTick: number; lastJumpSource: FeelJump['source'] | null; lastJumpStrength: number }>
  readonly physics: PhysicsDebugSnapshot
}

export interface EggInitialState {
  readonly position: readonly [number, number, number]
  readonly rotation: readonly [number, number, number, number]
  readonly linearVelocity: readonly [number, number, number]
  readonly angularVelocity: readonly [number, number, number]
}

export function defaultReplayHeader(feel: FeelPreset = DEFAULT_FEEL): ReplayHeader {
  return {
    protocolVersion: REPLAY_PROTOCOL_VERSION,
    simulationVersion: SIMULATION_VERSION,
    rapierPackage: RAPIER_PACKAGE,
    rapierVersion: RAPIER_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    physicsPresetId: PHYSICS_PRESET_ID,
    physicsPresetVersion: PHYSICS_PRESET_VERSION,
    physicsPresetHash: PHYSICS_PRESET_HASH,
    eggColliderId: EGG_COLLIDER_ID,
    eggColliderVersion: EGG_COLLIDER_VERSION,
    eggColliderHash: EGG_COLLIDER_HASH,
    feelPresetId: feel.id,
    feelPresetVersion: feel.version,
    feelPresetHash: computeFeelPresetHash(feel),
    tickRate: PHYSICS_HZ,
    levelId: FOUNDATION_LEVEL_ID,
    levelVersion: FOUNDATION_LEVEL_VERSION,
    seed: FOUNDATION_SEED,
    dimensionMode: feel.dimensionMode,
    controlMode: feel.controlMode,
    assistPresetId: feel.bufferTicks || feel.coyoteTicks || feel.tipHoldTicks ? feel.id : 'none',
  }
}
