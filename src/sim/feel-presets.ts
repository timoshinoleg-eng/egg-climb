import { fingerprintBytes } from './hash.js'

export type FeelDimensionMode = '2.5d' | '3d'
export type FeelControlMode = 'tap' | 'hold-release'

export interface FeelPreset {
  readonly id: string
  readonly version: number
  readonly dimensionMode: FeelDimensionMode
  readonly controlMode: FeelControlMode
  readonly bufferTicks: number
  readonly coyoteTicks: number
  readonly chargeTicks: number
  readonly minChargeScale: number
  readonly tipHoldTicks: number
  readonly tipDampingImpulse: number
}

function validatePreset(preset: FeelPreset): void {
  if (!preset || typeof preset.id !== 'string' || preset.id.length === 0) throw new Error('Feel preset id is required')
  if (!Number.isInteger(preset.version) || preset.version < 1) throw new Error('Feel preset version must be a positive integer')
  if (preset.dimensionMode !== '2.5d' && preset.dimensionMode !== '3d') throw new Error('Invalid feel dimension mode')
  if (preset.controlMode !== 'tap' && preset.controlMode !== 'hold-release') throw new Error('Invalid feel control mode')
  for (const key of ['bufferTicks', 'coyoteTicks', 'chargeTicks', 'tipHoldTicks'] as const) {
    if (!Number.isSafeInteger(preset[key]) || preset[key] < 0 || preset[key] > 0x7fffffff) throw new Error(`Invalid feel ${key}`)
  }
  if (!Number.isFinite(preset.minChargeScale) || preset.minChargeScale < 0 || preset.minChargeScale > 1) throw new Error('Invalid minimum charge scale')
  if (!Number.isFinite(preset.tipDampingImpulse) || preset.tipDampingImpulse < 0) throw new Error('Invalid tip damping impulse')
  if (preset.controlMode === 'hold-release' && preset.chargeTicks < 1) throw new Error('Hold-release requires charge ticks')
}

export function immutableFeelPreset(preset: FeelPreset): FeelPreset {
  validatePreset(preset)
  return Object.freeze({ ...preset })
}

export function canonicalFeelPreset(preset: FeelPreset): string {
  return `${preset.id}|${preset.version}|${preset.dimensionMode}|${preset.controlMode}|${preset.bufferTicks}|${preset.coyoteTicks}|${preset.chargeTicks}|${preset.minChargeScale}|${preset.tipHoldTicks}|${preset.tipDampingImpulse}`
}

export function computeFeelPresetHash(preset: FeelPreset): string {
  const canonical = canonicalFeelPreset(preset)
  const bytes = new Uint8Array(canonical.length)
  for (let i = 0; i < canonical.length; i += 1) {
    const code = canonical.charCodeAt(i)
    if (code > 0x7f) throw new Error('Feel preset canonical form must be ASCII')
    bytes[i] = code
  }
  return fingerprintBytes(bytes)
}

const base = {
  version: 1,
  bufferTicks: 0,
  coyoteTicks: 0,
  chargeTicks: 0,
  minChargeScale: 1,
  tipHoldTicks: 0,
  tipDampingImpulse: 0,
} as const

function make(id: string, dimensionMode: FeelDimensionMode, controlMode: FeelControlMode, assist: boolean): FeelPreset {
  return immutableFeelPreset({
    ...base,
    id,
    dimensionMode,
    controlMode,
    chargeTicks: controlMode === 'hold-release' ? 30 : 0,
    minChargeScale: controlMode === 'hold-release' ? 0.55 : 1,
    bufferTicks: assist ? 6 : 0,
    coyoteTicks: assist ? 4 : 0,
    tipHoldTicks: assist ? 8 : 0,
    tipDampingImpulse: assist ? 0.012 : 0,
  })
}

export const FEEL_PRESETS: Readonly<Record<string, FeelPreset>> = Object.freeze({
  '3d-tap': make('3d-tap', '3d', 'tap', false),
  '2d-tap': make('2d-tap', '2.5d', 'tap', false),
  '3d-hold': make('3d-hold', '3d', 'hold-release', false),
  '2d-hold': make('2d-hold', '2.5d', 'hold-release', false),
  '3d-tap-assist': make('3d-tap-assist', '3d', 'tap', true),
  '2d-tap-assist': make('2d-tap-assist', '2.5d', 'tap', true),
  '3d-hold-assist': make('3d-hold-assist', '3d', 'hold-release', true),
  '2d-hold-assist': make('2d-hold-assist', '2.5d', 'hold-release', true),
})

export const DEFAULT_FEEL = FEEL_PRESETS['3d-tap']!

export function resolveFeelPreset(id: string): FeelPreset {
  const preset = Object.prototype.hasOwnProperty.call(FEEL_PRESETS, id) ? FEEL_PRESETS[id] : undefined
  if (!preset) throw new Error(`Unknown feel preset: ${id}`)
  return preset
}
