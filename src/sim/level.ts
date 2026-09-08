import { DAILY_RULESET_HASH, FOUNDATION_GENERATOR_VERSION, FOUNDATION_LEVEL_FORMAT_VERSION, FOUNDATION_LEVEL_HASH, FOUNDATION_LEVEL_ID, FOUNDATION_LEVEL_VERSION, FOUNDATION_SEED, KITCHEN_GENERATOR_VERSION, KITCHEN_LEVEL_FORMAT_VERSION, KITCHEN_LEVEL_HASH, KITCHEN_LEVEL_ID, KITCHEN_LEVEL_VERSION, KITCHEN_SEED } from './config.js'

export type Vec3Tuple = readonly [number, number, number]
export interface StaticBoxDefinition { readonly id: string; readonly center: Vec3Tuple; readonly halfExtents: Vec3Tuple; readonly friction: number; readonly rotation?: readonly [number, number, number, number] }
export interface LevelDefinitionV1 { readonly id: string; readonly version: number; readonly formatVersion: 1; readonly origin: Vec3Tuple; readonly staticBoxes: readonly StaticBoxDefinition[] }
export interface KinematicBoxDefinition extends StaticBoxDefinition { readonly motion: Readonly<{ readonly axis: Vec3Tuple; readonly distance: number; readonly travelTicks: number; readonly phaseTick: number }> }
export interface VolumeDefinition { readonly id: string; readonly center: Vec3Tuple; readonly halfExtents: Vec3Tuple }
export interface ContinuousForceZoneDefinition extends VolumeDefinition { readonly impulsePerTick: Vec3Tuple }
export interface LaunchZoneDefinition extends VolumeDefinition { readonly impulse: Vec3Tuple }
export interface LevelDefinitionV2 { readonly id: string; readonly version: number; readonly formatVersion: 2; readonly origin: Vec3Tuple; readonly spawn: Vec3Tuple; readonly staticBoxes: readonly StaticBoxDefinition[]; readonly kinematicBoxes: readonly KinematicBoxDefinition[]; readonly continuousForceZones: readonly ContinuousForceZoneDefinition[]; readonly launchZones: readonly LaunchZoneDefinition[]; readonly finishVolumes: readonly VolumeDefinition[] }
export type LevelDefinition = LevelDefinitionV1 | LevelDefinitionV2

export interface ResolvedLevel { readonly definition: LevelDefinition; readonly id: string; readonly version: number; readonly formatVersion: number; readonly hash: string; readonly origin: Vec3Tuple; readonly generatorVersion: number; readonly seed: number; readonly rulesetHash: string }
export interface LevelIdentity { readonly levelId: string; readonly levelVersion: number; readonly levelFormatVersion: number; readonly levelHash: string; readonly generatorVersion: number; readonly rulesetHash: string; readonly seed: number }

export const FOUNDATION_LEVEL_DEFINITION: LevelDefinitionV1 = Object.freeze({
  id: FOUNDATION_LEVEL_ID, version: FOUNDATION_LEVEL_VERSION, formatVersion: FOUNDATION_LEVEL_FORMAT_VERSION,
  origin: Object.freeze([0, 0, 0] as const),
  staticBoxes: Object.freeze([
    { id: 'ground', center: [0, -0.25, 0], halfExtents: [6, 0.25, 6], friction: 1 },
    { id: 'step-1', center: [1.5, 0.35, 0], halfExtents: [1.2, 0.15, 1.5], friction: 0.9 },
    { id: 'step-2', center: [3.6, 0.85, 0], halfExtents: [1, 0.15, 1.5], friction: 0.9 },
  ]) as readonly StaticBoxDefinition[],
})

export const KITCHEN_LEVEL_DEFINITION: LevelDefinitionV2 = Object.freeze({
  id: KITCHEN_LEVEL_ID, version: KITCHEN_LEVEL_VERSION, formatVersion: KITCHEN_LEVEL_FORMAT_VERSION,
  origin: Object.freeze([10, 2, -4] as const),
  spawn: Object.freeze([10, 2.6, -4] as const),
  staticBoxes: Object.freeze([
    { id: 'table', center: [10, 1.75, -4], halfExtents: [3, 0.25, 5], friction: 1 },
    { id: 'cutting-board', center: [13, 2.25, -4], halfExtents: [1.5, 0.15, 5], friction: 0.95 },
    { id: 'counter', center: [15.5, 2.75, -4], halfExtents: [1.5, 0.2, 5], friction: 0.9 },
    { id: 'toaster', center: [18, 3.2, -4], halfExtents: [1.2, 0.2, 5], friction: 0.85 },
    { id: 'fridge', center: [20.5, 3.75, -4], halfExtents: [1.4, 0.25, 5], friction: 0.9 },
    { id: 'hood', center: [24.5, 5.25, -4], halfExtents: [1.5, 0.25, 5], friction: 0.9 },
    { id: 'vent', center: [27, 5.7, -4], halfExtents: [1.2, 0.2, 5], friction: 0.9 },
  ]) as readonly StaticBoxDefinition[],
  kinematicBoxes: Object.freeze([{ id: 'moving-cabinet', center: [22.5, 4.15, -4], halfExtents: [1.2, 0.2, 5], friction: 0.95, motion: { axis: [0, 1, 0], distance: 1.25, travelTicks: 120, phaseTick: 0 } }]) as unknown as readonly KinematicBoxDefinition[],
  continuousForceZones: Object.freeze([{ id: 'coffee-steam', center: [18.5, 5, -4], halfExtents: [9, 4, 5], impulsePerTick: [0.3, 0.2, 0] }]) as unknown as readonly ContinuousForceZoneDefinition[],
  launchZones: Object.freeze([{ id: 'toaster-launch', center: [18, 3.65, -4], halfExtents: [1, 0.55, 5], impulse: [0.7, 5.8, 0] }]) as unknown as readonly LaunchZoneDefinition[],
  finishVolumes: Object.freeze([{ id: 'vent-finish', center: [27, 8, -4], halfExtents: [1, 4, 5] }]) as unknown as readonly VolumeDefinition[],
})

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  for (const child of Object.values(value)) deepFreeze(child)
  if (!Object.isFrozen(value)) Object.freeze(value)
}

function assertVector(value: unknown, name: string, positive = false): asserts value is Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3 || value.some(item => !Number.isFinite(item))) throw new Error(`Invalid ${name}`)
  if (positive && value.some(item => item <= 0)) throw new Error(`Invalid ${name}`)
}

/** Strict committed-format validation; unknown fields fail rather than becoming ignored mechanics. */
export function assertLevelDefinition(value: unknown): asserts value is LevelDefinition {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid level definition')
  const level = value as Record<string, unknown>
  if (level.formatVersion !== 1 && level.formatVersion !== 2) throw new Error('Unsupported level format')
  if (typeof level.id !== 'string' || level.id.length === 0 || !Number.isInteger(level.version) || (level.version as number) <= 0) throw new Error('Invalid level identity')
  assertVector(level.origin, 'level origin')
  const expectedKeys = level.formatVersion === 1
    ? ['formatVersion', 'id', 'origin', 'staticBoxes', 'version']
    : ['continuousForceZones', 'finishVolumes', 'formatVersion', 'id', 'kinematicBoxes', 'launchZones', 'origin', 'spawn', 'staticBoxes', 'version']
  const actualKeys = Object.keys(level).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) throw new Error('Unsupported level fields')
  if (!Array.isArray(level.staticBoxes)) throw new Error('Invalid static boxes')
  const collections = level.formatVersion === 1 ? [level.staticBoxes] : [level.staticBoxes, level.kinematicBoxes, level.continuousForceZones, level.launchZones, level.finishVolumes]
  if (collections.some(collection => !Array.isArray(collection))) throw new Error('Invalid level collection')
  const ids = new Set<string>()
  for (const collection of collections as unknown[][]) for (const raw of collection) {
    if (typeof raw !== 'object' || raw === null) throw new Error('Invalid level primitive')
    const primitive = raw as Record<string, unknown>
    if (typeof primitive.id !== 'string' || primitive.id.length === 0 || ids.has(primitive.id)) throw new Error('Invalid or duplicate level primitive id')
    ids.add(primitive.id)
    assertVector(primitive.center, 'primitive center')
    assertVector(primitive.halfExtents, 'primitive half extents', true)
    if ('friction' in primitive && (!Number.isFinite(primitive.friction) || (primitive.friction as number) < 0)) throw new Error('Invalid primitive friction')
    if ('rotation' in primitive && (!Array.isArray(primitive.rotation) || primitive.rotation.length !== 4 || primitive.rotation.some(item => !Number.isFinite(item)))) throw new Error('Invalid primitive rotation')
    if ('impulsePerTick' in primitive) assertVector(primitive.impulsePerTick, 'continuous force impulse')
    if ('impulse' in primitive) assertVector(primitive.impulse, 'launch impulse')
  }
  if (level.formatVersion === 2) {
    assertVector(level.spawn, 'level spawn')
    for (const raw of level.kinematicBoxes as unknown[]) {
      const motion = (raw as Record<string, unknown>).motion as Record<string, unknown>
      if (!motion || !Number.isInteger(motion.travelTicks) || (motion.travelTicks as number) <= 0 || !Number.isInteger(motion.phaseTick) || !Number.isFinite(motion.distance)) throw new Error('Invalid kinematic motion')
      assertVector(motion.axis, 'kinematic axis')
      if (motion.axis.every(component => component === 0)) throw new Error('Invalid kinematic axis')
    }
  }
}

function descriptor(definition: LevelDefinition, hash: string, generatorVersion: number, seed: number): ResolvedLevel {
  assertLevelDefinition(definition)
  return Object.freeze({ definition, id: definition.id, version: definition.version, formatVersion: definition.formatVersion, hash, origin: definition.origin, generatorVersion, seed, rulesetHash: DAILY_RULESET_HASH })
}
deepFreeze(FOUNDATION_LEVEL_DEFINITION)
deepFreeze(KITCHEN_LEVEL_DEFINITION)
export const FOUNDATION_LEVEL = descriptor(FOUNDATION_LEVEL_DEFINITION, FOUNDATION_LEVEL_HASH, FOUNDATION_GENERATOR_VERSION, FOUNDATION_SEED)
export const KITCHEN_LEVEL = descriptor(KITCHEN_LEVEL_DEFINITION, KITCHEN_LEVEL_HASH, KITCHEN_GENERATOR_VERSION, KITCHEN_SEED)
export const SUPPORTED_LEVELS: readonly ResolvedLevel[] = Object.freeze([FOUNDATION_LEVEL, KITCHEN_LEVEL])

export function assertTrustedResolvedLevel(level: ResolvedLevel): void {
  if (!SUPPORTED_LEVELS.includes(level)) throw new Error('Simulation requires a trusted resolved level')
}

export function resolveTrustedLevel(identity: LevelIdentity): ResolvedLevel {
  const candidate = SUPPORTED_LEVELS.find(level => level.id === identity.levelId)
  if (!candidate) throw new Error('Level version mismatch: Unknown authoritative level')
  if (candidate.version !== identity.levelVersion) throw new Error('Level version mismatch')
  if (candidate.formatVersion !== identity.levelFormatVersion) throw new Error('Level format mismatch')
  if (candidate.hash !== identity.levelHash) throw new Error('Level hash mismatch')
  if (candidate.generatorVersion !== identity.generatorVersion) throw new Error('Generator version mismatch')
  if (candidate.rulesetHash !== identity.rulesetHash) throw new Error('Ruleset mismatch')
  if (candidate.seed !== identity.seed) throw new Error('Level seed mismatch')
  return candidate
}

/** Exact deterministic triangle wave: tick 0=start, travelTicks=end, 2*travelTicks=start. */
export function kinematicOffsetAtTick(box: KinematicBoxDefinition, tick: number): Vec3Tuple {
  const period = box.motion.travelTicks * 2
  const absolutePhase = tick + box.motion.phaseTick
  const phase = absolutePhase - Math.floor(absolutePhase / period) * period
  const numerator = phase <= box.motion.travelTicks ? phase : period - phase
  const scale = box.motion.distance * numerator / box.motion.travelTicks
  return [box.motion.axis[0] * scale, box.motion.axis[1] * scale, box.motion.axis[2] * scale]
}
