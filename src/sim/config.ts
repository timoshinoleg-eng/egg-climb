export const PHYSICS_HZ = 60 as const
export const PHYSICS_DT = 1 / PHYSICS_HZ

export const SIMULATION_VERSION = 'sim-feel-lab-v1' as const
export const PHYSICS_PRESET_ID = 'physics-v1' as const
export const PHYSICS_PRESET_VERSION = 1 as const
export const PHYSICS_PRESET_HASH = 'ce73c5de' as const
export const EGG_COLLIDER_ID = 'egg-convex-v1' as const
export const EGG_COLLIDER_VERSION = 1 as const
export const EGG_COLLIDER_HASH = 'c7ac9e44' as const
export const RAPIER_PACKAGE = '@dimforge/rapier3d-deterministic-compat' as const
export const RAPIER_VERSION = '0.20.0' as const
export const REPLAY_PROTOCOL_VERSION = 3 as const
export const FINGERPRINT_VERSION = 1 as const
export const AUTHORITATIVE_STATE_VERSION = 4 as const
/** v4 adds ordered presentation events to SimulationFrame transport only. */
export const WORKER_PROTOCOL_VERSION = 4 as const

export const FOUNDATION_LEVEL_ID = 'foundation-ribbon-v1' as const
export const FOUNDATION_LEVEL_VERSION = 1 as const
export const FOUNDATION_SEED = 0 as const
export const FOUNDATION_DIMENSION_MODE = '3d' as const
export const FOUNDATION_CONTROL_MODE = 'tap' as const
export const FOUNDATION_ASSIST_PRESET_ID = 'none' as const
