export const PHYSICS_HZ = 60 as const
export const PHYSICS_DT = 1 / PHYSICS_HZ

export const SIMULATION_VERSION = 'sim-foundation-v1' as const
export const PHYSICS_PRESET_ID = 'foundation-v1' as const
export const RAPIER_PACKAGE = '@dimforge/rapier3d-deterministic-compat' as const
export const RAPIER_VERSION = '0.20.0' as const
export const REPLAY_PROTOCOL_VERSION = 1 as const
export const FINGERPRINT_VERSION = 1 as const
export const AUTHORITATIVE_STATE_VERSION = 1 as const
export const WORKER_PROTOCOL_VERSION = 1 as const

// Foundation supports exactly one committed world/mode. Replay metadata is fail-closed
// until the corresponding behavior is implemented in the simulation itself.
export const FOUNDATION_LEVEL_ID = 'foundation-ribbon-v1' as const
export const FOUNDATION_LEVEL_VERSION = 1 as const
export const FOUNDATION_SEED = 0 as const
export const FOUNDATION_DIMENSION_MODE = '3d' as const
export const FOUNDATION_CONTROL_MODE = 'tap' as const
export const FOUNDATION_ASSIST_PRESET_ID = 'none' as const

export const FOUNDATION_TORQUE_IMPULSE = 0.018
