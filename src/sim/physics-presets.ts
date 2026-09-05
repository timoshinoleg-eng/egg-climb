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
    baseImpulse: number
    tipImpulse: number
    directionModel: JumpDirectionModel
    worldUpWeight: number
    contactNormalWeight: number
  }>
}

/**
 * Selected Physics Lab preset. The inertia values are precomputed from the committed
 * convex hull scaled to mass 1.1; the COM is intentionally shifted toward the broad end.
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
    baseImpulse: 2.6,
    tipImpulse: 5.2,
    directionModel: 'BLEND',
    worldUpWeight: 0.85,
    contactNormalWeight: 0.15,
  }),
})

export function canonicalPhysicsPreset(preset: PhysicsPreset): string {
  const inertia = preset.egg.principalInertia
  return `${preset.id}|${preset.version}|${preset.gravityY}|${preset.egg.mass}|${preset.egg.centerOfMassY}|${inertia[0]},${inertia[1]},${inertia[2]}|${preset.egg.friction}|${preset.egg.restitution}|${preset.egg.linearDamping}|${preset.egg.angularDamping}|${preset.egg.ccd ? 1 : 0}|${preset.controls.torqueImpulse}|${preset.support.minUpDot}|${preset.support.maxContactDistance}|${preset.jump.baseImpulse}|${preset.jump.tipImpulse}|${preset.jump.directionModel}|${preset.jump.worldUpWeight}|${preset.jump.contactNormalWeight}`
}

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
