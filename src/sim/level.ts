import {
  FOUNDATION_LEVEL_FORMAT_VERSION,
  FOUNDATION_LEVEL_ID,
  FOUNDATION_LEVEL_VERSION,
} from './config.js'

export interface StaticBoxDefinition {
  readonly id: string
  readonly center: readonly [number, number, number]
  readonly halfExtents: readonly [number, number, number]
  readonly friction: number
  readonly rotation?: readonly [number, number, number, number]
}

/**
 * Canonical level storage contract. This intentionally models only geometry
 * supported by the current simulation; future Kitchen fields extend a new
 * formatVersion rather than being guessed into this PR.
 */
export interface LevelDefinition {
  readonly id: string
  readonly version: number
  readonly formatVersion: number
  readonly origin: readonly [number, number, number]
  readonly staticBoxes: readonly StaticBoxDefinition[]
}

const FOUNDATION_STATIC_BOXES: readonly StaticBoxDefinition[] = Object.freeze([
  { id: 'ground', center: [0, -0.25, 0], halfExtents: [6, 0.25, 6], friction: 1 },
  { id: 'step-1', center: [1.5, 0.35, 0], halfExtents: [1.2, 0.15, 1.5], friction: 0.9 },
  { id: 'step-2', center: [3.6, 0.85, 0], halfExtents: [1, 0.15, 1.5], friction: 0.9 },
])

/** Foundation-only ribbon. Committed literals; bodies are created in this exact order. */
export const FOUNDATION_LEVEL_DEFINITION: LevelDefinition = Object.freeze({
  id: FOUNDATION_LEVEL_ID,
  version: FOUNDATION_LEVEL_VERSION,
  formatVersion: FOUNDATION_LEVEL_FORMAT_VERSION,
  origin: Object.freeze([0, 0, 0] as const),
  staticBoxes: FOUNDATION_STATIC_BOXES,
})

/** Backward-compatible simulation fixture alias. */
export const FOUNDATION_LEVEL = FOUNDATION_LEVEL_DEFINITION.staticBoxes
