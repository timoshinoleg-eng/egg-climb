export interface StaticBoxDefinition {
  readonly id: string
  readonly center: readonly [number, number, number]
  readonly halfExtents: readonly [number, number, number]
  readonly friction: number
}

/** Foundation-only ribbon. Committed literals; bodies are created in this exact order. */
export const FOUNDATION_LEVEL: readonly StaticBoxDefinition[] = Object.freeze([
  { id: 'ground', center: [0, -0.25, 0], halfExtents: [6, 0.25, 6], friction: 1 },
  { id: 'step-1', center: [1.5, 0.35, 0], halfExtents: [1.2, 0.15, 1.5], friction: 0.9 },
  { id: 'step-2', center: [3.6, 0.85, 0], halfExtents: [1, 0.15, 1.5], friction: 0.9 },
])
