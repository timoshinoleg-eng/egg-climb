import type { EggInitialState } from '../sim/contracts.js'
import { FEEL_PRESETS } from '../sim/feel-presets.js'
import type { LevelDefinition } from '../sim/level.js'
import { immutablePhysicsPreset, PHYSICS_V1 } from '../sim/physics-presets.js'

/** Opt-in local arcade content. Never replaces a Foundation replay identity. */
export const ARCADE_PHYSICS = immutablePhysicsPreset({
  ...PHYSICS_V1,
  id: 'arcade-physics-v1',
  version: 1,
  egg: { ...PHYSICS_V1.egg, linearDamping: 0.8 },
  controls: { torqueImpulse: 0.012, driveImpulse: 0.065 },
  jump: { ...PHYSICS_V1.jump, baseImpulse: 8.5, tipImpulse: 10.0, directionModel: 'WORLD_UP' },
})
export const ARCADE_FEEL = FEEL_PRESETS['2d-tap-assist']!
export const ARCADE_LEVEL: LevelDefinition = Object.freeze({
  id: 'cloud-garden-v1', version: 1, formatVersion: 1,
  origin: [0, 0, 0] as const,
  staticBoxes: [
    { id: 'nest', center: [0, -0.35, 0], halfExtents: [3.5, 0.35, 1.5], friction: 1 },
    { id: 'leaf-01', center: [3.0, 1.51, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-02', center: [0.15, 3.18, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-03', center: [-2.8, 4.84, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-04', center: [0.15, 6.51, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-05', center: [3.0, 8.18, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-06', center: [0.15, 9.84, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-07', center: [-2.8, 11.51, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-08', center: [0.15, 13.18, 0], halfExtents: [1.35, 0.16, 1], friction: 1 },
    { id: 'leaf-09', center: [3.0, 14.8, 0], halfExtents: [1.6, 0.2, 1], friction: 1 },
  ],
} satisfies LevelDefinition)
export const ARCADE_INITIAL_EGG: EggInitialState = Object.freeze({
  position: [0, 0.72, 0] as const,
  rotation: [0, 0, 0, 1] as const,
  linearVelocity: [0, 0, 0] as const,
  angularVelocity: [0, 0, 0] as const,
})
export const ARCADE_OPTIONS = Object.freeze({
  preset: ARCADE_PHYSICS, feel: ARCADE_FEEL,
  // Explicitly non-competitive geometry. Keep the authoritative Foundation /
  // Kitchen registry and its level-identity validation closed and unchanged.
  fixtureStaticBoxes: ARCADE_LEVEL.staticBoxes, initialEgg: ARCADE_INITIAL_EGG,
})
