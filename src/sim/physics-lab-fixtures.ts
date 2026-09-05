import type { EggInitialState } from './contracts.js'
import type { StaticBoxDefinition } from './level.js'

export interface PhysicsLabScenario {
  readonly id: string
  readonly level: readonly StaticBoxDefinition[]
  readonly initialEgg: EggInitialState
}

const IDENTITY = Object.freeze([0, 0, 0, 1] as const)
const SIDE_Z_90 = Object.freeze([0, 0, 0.70710678, 0.70710678] as const)
const TIP_DOWN_Z_180 = Object.freeze([0, 0, 1, 0] as const)
const SLOPE_Z_20 = Object.freeze([0, 0, 0.17364818, 0.98480775] as const)

const FLOOR: StaticBoxDefinition = Object.freeze({
  id: 'lab-floor', center: Object.freeze([0, -0.25, 0] as const), halfExtents: Object.freeze([4, 0.25, 4] as const), friction: 1.05,
})
const WALL: StaticBoxDefinition = Object.freeze({
  id: 'lab-wall', center: Object.freeze([0.55, 0.8, 0] as const), halfExtents: Object.freeze([0.1, 0.8, 2] as const), friction: 1.05,
})
const SLOPE: StaticBoxDefinition = Object.freeze({
  id: 'lab-slope', center: Object.freeze([0, -0.25, 0] as const), halfExtents: Object.freeze([3, 0.25, 2] as const), friction: 1.05, rotation: SLOPE_Z_20,
})

function egg(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number, number] = IDENTITY,
  linearVelocity: readonly [number, number, number] = [0, 0, 0],
  angularVelocity: readonly [number, number, number] = [0, 0, 0],
): EggInitialState {
  return Object.freeze({ position: Object.freeze(position), rotation: Object.freeze(rotation), linearVelocity: Object.freeze(linearVelocity), angularVelocity: Object.freeze(angularVelocity) })
}

export const PHYSICS_LAB_SCENARIOS: Readonly<Record<string, PhysicsLabScenario>> = Object.freeze({
  'broad-base-rest': Object.freeze({ id: 'broad-base-rest', level: Object.freeze([FLOOR]), initialEgg: egg([0, 0.61, 0]) }),
  'side-rest': Object.freeze({ id: 'side-rest', level: Object.freeze([FLOOR]), initialEgg: egg([0, 0.50, 0], SIDE_Z_90) }),
  'tip-biased-contact': Object.freeze({ id: 'tip-biased-contact', level: Object.freeze([FLOOR]), initialEgg: egg([0, 0.79, 0], TIP_DOWN_Z_180) }),
  'slope-contact': Object.freeze({ id: 'slope-contact', level: Object.freeze([SLOPE]), initialEgg: egg([0, 1.25, 0]) }),
  'corner-multiple-contact': Object.freeze({ id: 'corner-multiple-contact', level: Object.freeze([FLOOR, WALL]), initialEgg: egg([0.04, 0.61, 0]) }),
  'wall-only-contact': Object.freeze({ id: 'wall-only-contact', level: Object.freeze([WALL]), initialEgg: egg([0, 0.8, 0], SIDE_Z_90) }),
  'falling-airborne': Object.freeze({ id: 'falling-airborne', level: Object.freeze([FLOOR]), initialEgg: egg([0, 3.0, 0], IDENTITY, [0, -0.5, 0]) }),
  'landing': Object.freeze({ id: 'landing', level: Object.freeze([FLOOR]), initialEgg: egg([0, 2.4, 0]) }),
  'jump-base': Object.freeze({ id: 'jump-base', level: Object.freeze([FLOOR]), initialEgg: egg([0, 0.61, 0]) }),
  'jump-side': Object.freeze({ id: 'jump-side', level: Object.freeze([FLOOR]), initialEgg: egg([0, 0.50, 0], SIDE_Z_90) }),
  'jump-tip': Object.freeze({ id: 'jump-tip', level: Object.freeze([FLOOR]), initialEgg: egg([0, 0.79, 0], TIP_DOWN_Z_180) }),
  'high-angular-impact': Object.freeze({ id: 'high-angular-impact', level: Object.freeze([FLOOR]), initialEgg: egg([0, 2.6, 0], SIDE_Z_90, [0, -1.5, 0], [0, 0, 18]) }),
})

export function physicsLabScenario(id: string): PhysicsLabScenario {
  const scenario = PHYSICS_LAB_SCENARIOS[id]
  if (!scenario) throw new Error(`Unknown Physics Lab scenario: ${id}`)
  return scenario
}
