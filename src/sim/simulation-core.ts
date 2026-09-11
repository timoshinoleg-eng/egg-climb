import { DEFAULT_FEEL, immutableFeelPreset, computeFeelPresetHash } from './feel-presets.js'
import type { FeelPreset } from './feel-presets.js'
import { createFeelState, stepFeel, serializeFeelState, debugFeelState } from './feel-controller.js'
import type { FeelState, FeelJump } from './feel-controller.js'
import { LEVEL_GAMEPLAY_STATE_VERSION, SIMULATION_VERSION, RAPIER_PACKAGE, RAPIER_VERSION, PHYSICS_DT } from './config.js'
import type { EggInitialState, PhysicsDebugSnapshot, SimulationSnapshot, TickInput } from './contracts.js'
import { EGG_COLLIDER_HASH, EGG_COLLIDER_ID, EGG_COLLIDER_VERSION } from './config.js'
import { createEggColliderIndices, createEggColliderVertices, EGG_COLLIDER_MAX_Y, EGG_COLLIDER_MIN_Y } from './egg-collider.js'
import { fingerprintSimulationState } from './fingerprint.js'
import { FOUNDATION_LEVEL, assertTrustedResolvedLevel, kinematicOffsetAtTick } from './level.js'
import type { KinematicBoxDefinition, ResolvedLevel, StaticBoxDefinition, VolumeDefinition } from './level.js'
import { computePhysicsPresetHash, immutablePhysicsPreset, PHYSICS_V1 } from './physics-presets.js'
import type { JumpDirectionModel, PhysicsPreset } from './physics-presets.js'
import type { RapierApi } from './rapier.js'

export interface Simulation {
  readonly tick: number
  step(input: TickInput): void
  snapshot(): SimulationSnapshot
  takePhysicsSnapshot(): Uint8Array
  fingerprint(): string
  free(): void
}

export interface SimulationOptions {
  readonly feel?: FeelPreset
  readonly preset?: PhysicsPreset
  readonly level?: ResolvedLevel
  /** Non-competitive local-practice / Physics Lab geometry; replay execution never uses it. */
  readonly fixtureStaticBoxes?: readonly StaticBoxDefinition[]
  readonly initialEgg?: EggInitialState
}

export function immutableSimulationOptions(options: SimulationOptions): SimulationOptions {
  return Object.freeze({
    preset: immutablePhysicsPreset(options.preset ?? PHYSICS_V1),
    feel: immutableFeelPreset(options.feel ?? DEFAULT_FEEL),
    ...(options.level ? { level: options.level } : {}),
    ...(options.fixtureStaticBoxes ? { fixtureStaticBoxes: Object.freeze(options.fixtureStaticBoxes.map(box => Object.freeze({
      ...box, center: Object.freeze([...box.center] as [number, number, number]),
      halfExtents: Object.freeze([...box.halfExtents] as [number, number, number]),
      ...(box.rotation ? { rotation: Object.freeze([...box.rotation] as [number, number, number, number]) } : {}),
    }))) } : {}),
    ...(options.initialEgg ? { initialEgg: Object.freeze({
      position: Object.freeze([...options.initialEgg.position] as [number, number, number]),
      rotation: Object.freeze([...options.initialEgg.rotation] as [number, number, number, number]),
      linearVelocity: Object.freeze([...options.initialEgg.linearVelocity] as [number, number, number]),
      angularVelocity: Object.freeze([...options.initialEgg.angularVelocity] as [number, number, number]),
    }) } : {}),
  })
}

type Vector3 = { x: number; y: number; z: number }
type Quaternion = { x: number; y: number; z: number; w: number }

type SupportContact = {
  readonly localPoint: Vector3
  readonly worldPoint: Vector3
  readonly normal: Vector3
  readonly distance: number
  readonly upDot: number
  readonly contactT: number
}

const DEFAULT_EGG_STATE: EggInitialState = Object.freeze({
  position: Object.freeze([0, 1.2, 0] as const),
  rotation: Object.freeze([0, 0, 0, 1] as const),
  linearVelocity: Object.freeze([0, 0, 0] as const),
  angularVelocity: Object.freeze([0, 0, 0] as const),
})

const WORLD_UP: Vector3 = Object.freeze({ x: 0, y: 1, z: 0 })
const IDENTITY_ROTATION: Quaternion = Object.freeze({ x: 0, y: 0, z: 0, w: 1 })

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-1, Math.min(1, value))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function rotateVector(rotation: Quaternion, vector: Vector3): Vector3 {
  const tx = 2 * (rotation.y * vector.z - rotation.z * vector.y)
  const ty = 2 * (rotation.z * vector.x - rotation.x * vector.z)
  const tz = 2 * (rotation.x * vector.y - rotation.y * vector.x)
  return {
    x: vector.x + rotation.w * tx + rotation.y * tz - rotation.z * ty,
    y: vector.y + rotation.w * ty + rotation.z * tx - rotation.x * tz,
    z: vector.z + rotation.w * tz + rotation.x * ty - rotation.y * tx,
  }
}

function normalize(vector: Vector3, fallback: Vector3): Vector3 {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z)
  if (length <= 0) return fallback
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

function copyVector(vector: Vector3): Vector3 {
  return { x: vector.x, y: vector.y, z: vector.z }
}

function worldPoint(bodyPosition: Vector3, bodyRotation: Quaternion, localPoint: Vector3): Vector3 {
  const rotated = rotateVector(bodyRotation, localPoint)
  return { x: bodyPosition.x + rotated.x, y: bodyPosition.y + rotated.y, z: bodyPosition.z + rotated.z }
}

export function contactTFromLocalPointY(localY: number): number {
  return clamp01((localY - EGG_COLLIDER_MIN_Y) / (EGG_COLLIDER_MAX_Y - EGG_COLLIDER_MIN_Y))
}

export function jumpStrengthForContactT(preset: PhysicsPreset, contactT: number): number {
  const t = clamp01(contactT)
  const eased = preset.jump.curve === 'NEAR_LINEAR' ? t : preset.jump.curve === 'TIP_REWARD' ? t * t : t * t * (3 - 2 * t)
  return preset.jump.baseImpulse + (preset.jump.tipImpulse - preset.jump.baseImpulse) * eased
}

function jumpDirectionForModel(model: JumpDirectionModel, supportNormal: Vector3, eggRotation: Quaternion, preset: PhysicsPreset): Vector3 {
  if (model === 'WORLD_UP') return WORLD_UP
  if (model === 'CONTACT_NORMAL') return supportNormal
  if (model === 'EGG_AXIS') return normalize(rotateVector(eggRotation, WORLD_UP), WORLD_UP)
  return normalize({
    x: supportNormal.x * preset.jump.contactNormalWeight,
    y: preset.jump.worldUpWeight + supportNormal.y * preset.jump.contactNormalWeight,
    z: supportNormal.z * preset.jump.contactNormalWeight,
  }, WORLD_UP)
}

function isBetterSupport(candidate: SupportContact, current: SupportContact | null): boolean {
  if (current === null) return true
  if (candidate.distance !== current.distance) return candidate.distance < current.distance
  if (candidate.upDot !== current.upDot) return candidate.upDot > current.upDot
  if (candidate.localPoint.y !== current.localPoint.y) return candidate.localPoint.y < current.localPoint.y
  if (candidate.localPoint.x !== current.localPoint.x) return candidate.localPoint.x < current.localPoint.x
  return candidate.localPoint.z < current.localPoint.z
}

export function findSupportContact(
  world: InstanceType<RapierApi['World']>,
  eggCollider: ReturnType<InstanceType<RapierApi['World']>['createCollider']>,
  eggBody: ReturnType<InstanceType<RapierApi['World']>['createRigidBody']>,
  preset: PhysicsPreset,
): SupportContact | null {
  let best: SupportContact | null = null
  const rotation = eggBody.rotation()
  const position = eggBody.translation()

  world.contactPairsWith(eggCollider, (otherCollider) => {
    world.contactPair(eggCollider, otherCollider, (manifold, flipped) => {
      if (manifold.numContacts() <= 0) return
      const localNormalRaw = flipped ? manifold.localNormal2() : manifold.localNormal1()
      if (localNormalRaw === null) return
      const outwardWorld = normalize(rotateVector(rotation, localNormalRaw), { x: 0, y: -1, z: 0 })
      const supportNormal = { x: -outwardWorld.x, y: -outwardWorld.y, z: -outwardWorld.z }
      const upDot = supportNormal.y
      if (upDot < preset.support.minUpDot) return

      for (let index = 0; index < manifold.numContacts(); index += 1) {
        const distance = manifold.contactDist(index)
        if (distance > preset.support.maxContactDistance) continue
        const pointRaw = flipped ? manifold.localContactPoint2(index) : manifold.localContactPoint1(index)
        const otherPointRaw = flipped ? manifold.localContactPoint1(index) : manifold.localContactPoint2(index)
        if (pointRaw === null || otherPointRaw === null) continue
        const localPoint = copyVector(pointRaw)
        const eggPointWorld = worldPoint(position, rotation, localPoint)
        const otherPointWorld = worldPoint(otherCollider.translation(), otherCollider.rotation(), otherPointRaw)
        // Manifolds describe the pre-solver poses. Reproject their actual contact
        // points to reject cached support after this tick has separated the bodies.
        const separation = (eggPointWorld.x - otherPointWorld.x) * supportNormal.x
          + (eggPointWorld.y - otherPointWorld.y) * supportNormal.y
          + (eggPointWorld.z - otherPointWorld.z) * supportNormal.z
        if (separation > preset.support.maxContactDistance) continue
        const candidate: SupportContact = {
          localPoint,
          worldPoint: eggPointWorld,
          normal: supportNormal,
          distance,
          upDot,
          contactT: contactTFromLocalPointY(localPoint.y),
        }
        if (isBetterSupport(candidate, best)) best = candidate
      }
    })
  })

  return best
}

function physicsDebug(support: SupportContact | null, eggRotation: Quaternion, preset: PhysicsPreset): PhysicsDebugSnapshot {
  if (support === null) {
    return {
      grounded: false,
      contactT: null,
      supportContactLocal: null,
      supportContactWorld: null,
      supportNormal: null,
      contactDistance: null,
      jumpStrength: null,
      jumpDirection: null,
    }
  }
  const jumpStrength = jumpStrengthForContactT(preset, support.contactT)
  return {
    grounded: true,
    contactT: support.contactT,
    supportContactLocal: support.localPoint,
    supportContactWorld: support.worldPoint,
    supportNormal: support.normal,
    contactDistance: support.distance,
    jumpStrength,
    jumpDirection: jumpDirectionForModel(preset.jump.directionModel, support.normal, eggRotation, preset),
  }
}

function writeU32(target: number[], value: number): void {
  const normalized = value >>> 0
  target.push(normalized & 0xff, (normalized >>> 8) & 0xff, (normalized >>> 16) & 0xff, (normalized >>> 24) & 0xff)
}

function writeAscii(target: number[], value: string): void {
  writeU32(target, value.length)
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code > 0x7f) throw new Error('Authoritative identifiers must be ASCII')
    target.push(code)
  }
}

export function serializeLevelGameplayState(level: ResolvedLevel, completionTick: number | null, launchZoneInside: readonly boolean[]): Uint8Array {
  if (level.formatVersion === 1) return new Uint8Array(0)
  if (completionTick !== null && (!Number.isSafeInteger(completionTick) || completionTick <= 0)) throw new Error('Invalid completion tick')
  const expectedZones = level.definition.formatVersion === 2 ? level.definition.launchZones.length : 0
  if (launchZoneInside.length !== expectedZones) throw new Error('Launch-zone state length mismatch')
  const bytes: number[] = [0x4b, 0x4c, 0x56, 0x32]
  writeU32(bytes, LEVEL_GAMEPLAY_STATE_VERSION)
  writeAscii(bytes, level.id); writeU32(bytes, level.version); writeAscii(bytes, level.hash)
  writeU32(bytes, completionTick === null ? 0xffffffff : completionTick); writeU32(bytes, launchZoneInside.length)
  for (const inside of launchZoneInside) bytes.push(inside ? 1 : 0)
  return Uint8Array.from(bytes)
}

function authoritativeStateBytes(preset: PhysicsPreset, feel: FeelPreset, state: FeelState, level: ResolvedLevel, completionTick: number | null, launchZoneInside: readonly boolean[]): Uint8Array {
  const bytes: number[] = []
  bytes.push(0x50, 0x48, 0x59, 0x53) // PHYS
  writeAscii(bytes, preset.id)
  writeU32(bytes, preset.version)
  writeAscii(bytes, computePhysicsPresetHash(preset))
  writeAscii(bytes, EGG_COLLIDER_ID)
  writeU32(bytes, EGG_COLLIDER_VERSION)
  writeAscii(bytes, EGG_COLLIDER_HASH)
  writeAscii(bytes, feel.id)
  writeU32(bytes, feel.version)
  writeAscii(bytes, computeFeelPresetHash(feel))
  const stateBytes = serializeFeelState(state)
  writeU32(bytes, stateBytes.length)
  for (const byte of stateBytes) bytes.push(byte)
  // Preserve byte-for-byte Foundation v1 fingerprints; v2 appends a tagged schema.
  for (const byte of serializeLevelGameplayState(level, completionTick, launchZoneInside)) bytes.push(byte)
  return Uint8Array.from(bytes)
}

function containsPoint(volume: VolumeDefinition, point: Vector3): boolean {
  return Math.abs(point.x - volume.center[0]) <= volume.halfExtents[0]
    && Math.abs(point.y - volume.center[1]) <= volume.halfExtents[1]
    && Math.abs(point.z - volume.center[2]) <= volume.halfExtents[2]
}

export function advanceLaunchZoneEdge(wasInside: boolean, isInside: boolean): Readonly<{ inside: boolean; activated: boolean }> {
  return { inside: isInside, activated: isInside && !wasInside }
}

function createKinematicBox(RAPIER: RapierApi, world: InstanceType<RapierApi['World']>, box: KinematicBoxDefinition) {
  const [x, y, z] = box.center
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)
  const body = world.createRigidBody(bodyDesc)
  world.createCollider(RAPIER.ColliderDesc.cuboid(...box.halfExtents).setFriction(box.friction), body)
  return body
}

function createStaticBox(RAPIER: RapierApi, world: InstanceType<RapierApi['World']>, box: StaticBoxDefinition): void {
  const [x, y, z] = box.center
  const [hx, hy, hz] = box.halfExtents
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
  if (box.rotation) {
    const [qx, qy, qz, qw] = box.rotation
    bodyDesc.setRotation({ x: qx, y: qy, z: qz, w: qw })
  }
  const body = world.createRigidBody(bodyDesc)
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(box.friction), body)
}

export function createSimulationWithRapier(RAPIER: RapierApi, options: SimulationOptions = {}): Simulation {
  const preset = immutablePhysicsPreset(options.preset ?? PHYSICS_V1)
  const feel = immutableFeelPreset(options.feel ?? DEFAULT_FEEL)
  const rawFixture = options.fixtureStaticBoxes
  const level = options.level ?? FOUNDATION_LEVEL
  assertTrustedResolvedLevel(level)
  const definition = level.definition
  const staticBoxes = rawFixture ?? definition.staticBoxes
  const initial = options.initialEgg ?? (definition.formatVersion === 2 ? { ...DEFAULT_EGG_STATE, position: definition.spawn } : DEFAULT_EGG_STATE)
  const world = new RAPIER.World({ x: 0, y: preset.gravityY, z: 0 })
  world.timestep = PHYSICS_DT

  for (const box of staticBoxes) createStaticBox(RAPIER, world, box)
  const kinematicDefinitions = rawFixture || definition.formatVersion === 1 ? [] : definition.kinematicBoxes
  const kinematicBodies = kinematicDefinitions.map(box => createKinematicBox(RAPIER, world, box))

  const [px, py, pz] = initial.position
  const [qx, qy, qz, qw] = initial.rotation
  const [lvx, lvy, lvz] = initial.linearVelocity
  const [avx, avy, avz] = initial.angularVelocity
  const [ix, iy, iz] = preset.egg.principalInertia
  const eggDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(px, py, pz)
    .setRotation({ x: qx, y: qy, z: qz, w: qw })
    .setLinvel(lvx, lvy, lvz)
    .setAngvel({ x: avx, y: avy, z: avz })
    .setAdditionalMassProperties(
      preset.egg.mass,
      { x: 0, y: preset.egg.centerOfMassY, z: 0 },
      { x: ix, y: iy, z: iz },
      IDENTITY_ROTATION,
    )
    .setLinearDamping(preset.egg.linearDamping)
    .setAngularDamping(preset.egg.angularDamping)
    .setCcdEnabled(preset.egg.ccd)
  if (feel.dimensionMode === '2.5d') {
    const planarRotation = normalize({ x: qz, y: qw, z: 0 }, { x: 0, y: 1, z: 0 })
    eggDesc.setRotation({ x: 0, y: 0, z: planarRotation.x, w: planarRotation.y })
      .setLinvel(lvx, lvy, 0).setAngvel({ x: 0, y: 0, z: avz })
      .enabledTranslations(true, true, false).enabledRotations(false, false, true)
  }
  const egg = world.createRigidBody(eggDesc)
  const colliderDesc = RAPIER.ColliderDesc.convexMesh(createEggColliderVertices(), createEggColliderIndices())
  if (colliderDesc === null) throw new Error('Pre-baked egg collider mesh is invalid')
  colliderDesc.setDensity(0).setFriction(preset.egg.friction).setRestitution(preset.egg.restitution)
  const eggCollider = world.createCollider(colliderDesc, egg)
  // Additional properties are otherwise deferred until world.step(), losing
  // torque impulses sampled for tick zero because inverse inertia is still zero.
  egg.recomputeMassPropertiesFromColliders()
  const identity = Object.freeze({
    simulationVersion: SIMULATION_VERSION, rapierPackage: RAPIER_PACKAGE, rapierVersion: RAPIER_VERSION,
    feelPresetId: feel.id, feelPresetVersion: feel.version, feelPresetHash: computeFeelPresetHash(feel),
    physicsPresetId: preset.id, physicsPresetVersion: preset.version,
    physicsPresetHash: computePhysicsPresetHash(preset),
    eggColliderId: EGG_COLLIDER_ID, eggColliderVersion: EGG_COLLIDER_VERSION,
    eggColliderHash: EGG_COLLIDER_HASH,
    levelId: level.id, levelVersion: level.version, levelFormatVersion: level.formatVersion, levelHash: level.hash,
  })

  let tick = 0
  const feelState = createFeelState()
  let lastJumpTick = -1
  let lastJumpSource: FeelJump['source'] | null = null
  let lastJumpStrength = 0
  let completionTick: number | null = null
  const launchZoneInside = definition.formatVersion === 2 ? definition.launchZones.map(() => false) : []
  let activeContinuousForceZoneIds: string[] = []
  let activatedLaunchZoneIds: string[] = []
  return {
    get tick() { return tick },
    step(input) {
      activeContinuousForceZoneIds = []
      activatedLaunchZoneIds = []
      for (let index = 0; index < kinematicDefinitions.length; index += 1) {
        const box = kinematicDefinitions[index] as KinematicBoxDefinition
        const offset = kinematicOffsetAtTick(box, tick + 1)
        kinematicBodies[index]?.setNextKinematicTranslation({ x: box.center[0] + offset[0], y: box.center[1] + offset[1], z: box.center[2] + offset[2] })
      }
      if (!rawFixture && definition.formatVersion === 2) {
        const position = egg.translation()
        for (const zone of definition.continuousForceZones) {
          if (containsPoint(zone, position)) {
            egg.applyImpulse({ x: zone.impulsePerTick[0], y: zone.impulsePerTick[1], z: zone.impulsePerTick[2] }, true)
            activeContinuousForceZoneIds.push(zone.id)
          }
        }
        for (let index = 0; index < definition.launchZones.length; index += 1) {
          const zone = definition.launchZones[index] as typeof definition.launchZones[number]
          const inside = containsPoint(zone, position)
          const edge = advanceLaunchZoneEdge(launchZoneInside[index] as boolean, inside)
          if (edge.activated) {
            egg.applyImpulse({ x: zone.impulse[0], y: zone.impulse[1], z: zone.impulse[2] }, true)
            activatedLaunchZoneIds.push(zone.id)
          }
          launchZoneInside[index] = edge.inside
        }
      }
      const moveX = clampAxis(input.moveX)
      const moveZ = feel.dimensionMode === '2.5d' ? 0 : clampAxis(input.moveZ)
      if (moveX !== 0 || moveZ !== 0) {
        egg.applyTorqueImpulse({ x: moveZ * preset.controls.torqueImpulse, y: 0, z: -moveX * preset.controls.torqueImpulse }, true)
      }

      // Torque-only planar contact can stall. Arcade presets explicitly opt in
      // to fixed-tick lateral steering; legacy preset/hash semantics stay intact.
      if (preset.controls.driveImpulse !== undefined && (moveX !== 0 || moveZ !== 0)) {
        egg.applyImpulse({ x: moveX * preset.controls.driveImpulse, y: 0, z: moveZ * preset.controls.driveImpulse }, true)
      }

      const support = findSupportContact(world, eggCollider, egg, preset)
      const action = stepFeel(feelState, input, support, feel, tick)
      if (action.jump !== null) {
        const direction = jumpDirectionForModel(preset.jump.directionModel, action.jump.normal, egg.rotation(), preset)
        const strength = jumpStrengthForContactT(preset, action.jump.contactT) * action.jump.scale
        egg.applyImpulse({ x: direction.x * strength, y: direction.y * strength, z: direction.z * strength }, true)
        lastJumpTick = tick
        lastJumpSource = action.jump.source
        lastJumpStrength = strength
      }
      if (action.tipDamping > 0 && action.jump === null) {
        const av = egg.angvel()
        egg.applyTorqueImpulse({ x: -av.x * action.tipDamping, y: -av.y * action.tipDamping, z: -av.z * action.tipDamping }, true)
      }

      world.step()
      tick += 1
      if (completionTick === null && !rawFixture && definition.formatVersion === 2) {
        const position = egg.translation()
        if (definition.finishVolumes.some(volume => containsPoint(volume, position))) completionTick = tick
      }
    },
    snapshot() {
      const p = egg.translation(); const r = egg.rotation(); const lv = egg.linvel(); const av = egg.angvel()
      const support = findSupportContact(world, eggCollider, egg, preset)
      return {
        tick,
        identity,
        feel: { ...debugFeelState(feelState), lastJumpTick, lastJumpSource, lastJumpStrength },
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
        linearVelocity: { x: lv.x, y: lv.y, z: lv.z },
        angularVelocity: { x: av.x, y: av.y, z: av.z },
        physics: physicsDebug(support, r, preset),
        gameplay: { completionTick, launchZoneInside: [...launchZoneInside], activeContinuousForceZoneIds: [...activeContinuousForceZoneIds], activatedLaunchZoneIds: [...activatedLaunchZoneIds] },
      }
    },
    takePhysicsSnapshot() { return world.takeSnapshot() },
    fingerprint() {
      return fingerprintSimulationState({
        tick,
        authoritativeState: authoritativeStateBytes(preset, feel, feelState, level, completionTick, launchZoneInside),
        physicsSnapshot: world.takeSnapshot(),
      })
    },
    free() { world.free() },
  }
}
