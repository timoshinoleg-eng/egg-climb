import { PHYSICS_PRESET_HASH, PHYSICS_PRESET_ID, PHYSICS_PRESET_VERSION } from './config.js'
import { fingerprintBytes } from './hash.js'

export type JumpDirectionModel = 'WORLD_UP' | 'CONTACT_NORMAL' | 'EGG_AXIS' | 'BLEND'

export interface PhysicsPreset {
  readonly id: string
  readonly version: number
  readonly gravityY: number
  readonly egg: Readonly<{
    mass: number
    centerOfMassY: number
    principalInertia: readonly [number, number, number]
    friction: number
    restitution: number
    linearDamping: number
    angularDamping: number
    ccd: boolean
  }>
  readonly controls: Readonly<{
    torqueImpulse: number
  }>
  readonly support: Readonly<{
    minUpDot: number
    maxContactDistance: number
  }>
  readonly jump: Readonly<{
    curve: 'NEAR_LINEAR' | 'EASED' | 'TIP_REWARD'
    baseImpulse: number
    tipImpulse: number
    directionModel: JumpDirectionModel
    worldUpWeight: number
    contactNormalWeight: number
  }>
}

/**
 * Selected Physics Lab preset. The inertia values are explicit mass-distribution design constants,
 * independent of the collider and renderer; COM is shifted toward the broad end.
 */
export const PHYSICS_V1: PhysicsPreset = Object.freeze({
  id: PHYSICS_PRESET_ID,
  version: PHYSICS_PRESET_VERSION,
  gravityY: -9.81,
  egg: Object.freeze({
    mass: 1.1,
    centerOfMassY: -0.12,
    principalInertia: Object.freeze([0.14, 0.096, 0.14] as const),
    friction: 1.05,
    restitution: 0.03,
    linearDamping: 0.18,
    angularDamping: 0.22,
    ccd: true,
  }),
  controls: Object.freeze({ torqueImpulse: 0.018 }),
  support: Object.freeze({ minUpDot: 0.45, maxContactDistance: 0.025 }),
  jump: Object.freeze({
    curve: 'EASED',
    baseImpulse: 2.6,
    tipImpulse: 5.2,
    directionModel: 'BLEND',
    worldUpWeight: 0.85,
    contactNormalWeight: 0.15,
  }),
})

export function canonicalPhysicsPreset(preset: PhysicsPreset): string {
  const inertia = preset.egg.principalInertia
  return `${preset.id}|${preset.version}|${preset.gravityY}|${preset.egg.mass}|${preset.egg.centerOfMassY}|${inertia[0]},${inertia[1]},${inertia[2]}|${preset.egg.friction}|${preset.egg.restitution}|${preset.egg.linearDamping}|${preset.egg.angularDamping}|${preset.egg.ccd ? 1 : 0}|${preset.controls.torqueImpulse}|${preset.support.minUpDot}|${preset.support.maxContactDistance}|${preset.jump.baseImpulse}|${preset.jump.tipImpulse}|${preset.jump.directionModel}|${preset.jump.worldUpWeight}|${preset.jump.contactNormalWeight}|${preset.jump.curve}`
}

/** Copy nested values so caller-owned options cannot change future ticks. */
export function immutablePhysicsPreset(preset: PhysicsPreset): PhysicsPreset {
  return Object.freeze({ ...preset,
    egg: Object.freeze({ ...preset.egg, principalInertia: Object.freeze([...preset.egg.principalInertia] as [number, number, number]) }),
    controls: Object.freeze({ ...preset.controls }),
    support: Object.freeze({ ...preset.support }),
    jump: Object.freeze({ ...preset.jump }),
  })
}

export const PHYSICS_LAB_PRESETS: Readonly<Record<string, PhysicsPreset>> = Object.freeze({
  'lab-a': immutablePhysicsPreset({ ...PHYSICS_V1, id: 'physics-lab-a',
    egg: { ...PHYSICS_V1.egg, centerOfMassY: -0.08 },
    jump: { ...PHYSICS_V1.jump, curve: 'NEAR_LINEAR', baseImpulse: 2.5, tipImpulse: 4.8, worldUpWeight: 0.9, contactNormalWeight: 0.1 },
  }),
  'lab-b': PHYSICS_V1,
  'lab-c': immutablePhysicsPreset({ ...PHYSICS_V1, id: 'physics-lab-c',
    egg: { ...PHYSICS_V1.egg, centerOfMassY: -0.16 },
    jump: { ...PHYSICS_V1.jump, curve: 'TIP_REWARD', baseImpulse: 2.7, tipImpulse: 5.6, worldUpWeight: 0.8, contactNormalWeight: 0.2 },
  }),
})

export function computePhysicsPresetHash(preset: PhysicsPreset): string {
  const canonical = canonicalPhysicsPreset(preset)
  const bytes = new Uint8Array(canonical.length)
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index)
    if (code > 0x7f) throw new Error('Physics preset canonical form must be ASCII')
    bytes[index] = code
  }
  return fingerprintBytes(bytes)
}

export const PHYSICS_V1_IDENTITY = Object.freeze({
  id: PHYSICS_PRESET_ID,
  version: PHYSICS_PRESET_VERSION,
  hash: PHYSICS_PRESET_HASH,
})
