import type { TickInput } from '../sim/contracts.js'

export const MAX_ADVANCE_TICKS = 120 as const

export function assertTickInput(input: TickInput): void {
  if (!input || typeof input !== 'object') throw new Error('Invalid simulation input')
  if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveZ)) throw new Error('Invalid simulation movement input')
  if (input.moveX < -1 || input.moveX > 1 || input.moveZ < -1 || input.moveZ > 1) throw new Error('Simulation movement input is outside [-1, 1]')
  if (input.jumpCancel !== undefined && typeof input.jumpCancel !== 'boolean') throw new Error('Invalid jump cancel edge')
  if (typeof input.jumpDown !== 'boolean' || typeof input.jumpUp !== 'boolean') throw new Error('Invalid simulation input edges')
}

export function assertTickInputs(inputs: readonly TickInput[]): void {
  if (!Array.isArray(inputs)) throw new Error('Simulation advance requires an input array')
  if (inputs.length === 0) throw new Error('Simulation advance requires at least one tick input')
  if (inputs.length > MAX_ADVANCE_TICKS) throw new Error('Simulation advance input batch is too large')
  for (const input of inputs) assertTickInput(input)
}
