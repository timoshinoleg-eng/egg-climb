import { DEFAULT_FEEL, type FeelPreset } from './feel-presets.js'

export interface FeelInput {
  readonly jumpDown: boolean
  readonly jumpUp: boolean
  readonly jumpCancel?: boolean
}

export interface FeelSupport {
  readonly contactT: number
  readonly normal: Readonly<{ x: number; y: number; z: number }>
}

export interface FeelState {
  jumpHeld: boolean
  jumpConsumed: boolean
  airborneSinceJump: boolean
  bufferUntilTick: number
  coyoteRemaining: number
  chargeTicks: number
  pendingScale: number
  tipHoldTicksElapsed: number
  lastSupport: FeelSupport | null
}

export interface FeelJump {
  readonly contactT: number
  readonly normal: Readonly<{ x: number; y: number; z: number }>
  readonly scale: number
  readonly source: 'support' | 'coyote' | 'buffer'
}

export interface FeelStepResult { readonly jump: FeelJump | null; readonly tipDamping: number }

export { DEFAULT_FEEL, FEEL_PRESETS, computeFeelPresetHash, resolveFeelPreset } from './feel-presets.js'

export function createFeelState(): FeelState {
  return {
    jumpHeld: false,
    jumpConsumed: false,
    airborneSinceJump: false,
    bufferUntilTick: -1,
    coyoteRemaining: 0,
    chargeTicks: 0,
    pendingScale: 1,
    tipHoldTicksElapsed: 0,
    lastSupport: null,
  }
}

function copySupport(support: FeelSupport): FeelSupport {
  return { contactT: support.contactT, normal: { x: support.normal.x, y: support.normal.y, z: support.normal.z } }
}

function chargeScale(state: FeelState, preset: FeelPreset): number {
  if (preset.controlMode === 'tap') return 1
  const ratio = Math.min(state.chargeTicks, preset.chargeTicks) / preset.chargeTicks
  return preset.minChargeScale + (1 - preset.minChargeScale) * ratio
}

function canJump(state: FeelState, support: FeelSupport | null, tick: number): 'support' | 'coyote' | 'buffer' | null {
  if (state.jumpConsumed) return null
  if (support && state.bufferUntilTick >= tick) return 'buffer'
  if (support) return 'support'
  if (state.coyoteRemaining > 0) return 'coyote'
  return null
}

function makeJump(support: FeelSupport, scale: number, source: FeelJump['source']): FeelJump {
  return { contactT: support.contactT, normal: { ...support.normal }, scale, source }
}

export function stepFeel(
  state: FeelState,
  input: FeelInput,
  support: FeelSupport | null,
  preset: FeelPreset = DEFAULT_FEEL,
  tick: number,
): FeelStepResult {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Feel tick must be a nonnegative safe integer')
  if (support) {
    state.lastSupport = copySupport(support)
    state.coyoteRemaining = preset.coyoteTicks
    if (state.airborneSinceJump) {
      state.airborneSinceJump = false
      state.jumpConsumed = false
    }
  } else {
    if (state.jumpConsumed) state.airborneSinceJump = true
  }

  if (input.jumpCancel) {
    state.jumpHeld = false
    state.chargeTicks = 0
    state.pendingScale = 1
    state.bufferUntilTick = -1
    state.tipHoldTicksElapsed = 0
    if (!support && state.coyoteRemaining > 0) state.coyoteRemaining -= 1
    return { jump: null, tipDamping: 0 }
  }

  const wasHeld = state.jumpHeld
  if (input.jumpDown) {
    state.jumpHeld = true
    state.chargeTicks = 0
    if (preset.controlMode === 'tap') state.bufferUntilTick = tick + preset.bufferTicks
  } else if (state.jumpHeld && !input.jumpUp) {
    state.chargeTicks = Math.min(state.chargeTicks + 1, preset.chargeTicks)
  }

  const release = preset.controlMode === 'tap'
    ? input.jumpDown
    : (input.jumpUp && (wasHeld || input.jumpDown))
  if (release) {
    if (preset.controlMode === 'hold-release' && wasHeld) state.chargeTicks = Math.min(state.chargeTicks + 1, preset.chargeTicks)
    state.pendingScale = chargeScale(state, preset)
    state.bufferUntilTick = tick + preset.bufferTicks
  }
  const hadBuffer = state.bufferUntilTick >= tick
  const intent = preset.controlMode === 'tap' ? (input.jumpDown || hadBuffer) : (release || hadBuffer)
  const eligible = intent ? canJump(state, support, tick) : null
  const source = eligible ? (release && support ? 'support' : eligible) : null
  const jumpSupport = support ?? state.lastSupport
  const jump = source && jumpSupport ? makeJump(jumpSupport, source === 'buffer' ? state.pendingScale : chargeScale(state, preset), source) : null
  if (jump) {
    state.jumpConsumed = true
    state.bufferUntilTick = -1
    state.pendingScale = 1
  }
  if (preset.controlMode === 'hold-release' && input.jumpUp) {
    state.jumpHeld = false
    state.chargeTicks = 0
  }
  if (preset.controlMode === 'tap' && input.jumpUp) state.jumpHeld = false

  let tipDamping = 0
  if (state.jumpHeld && support && preset.tipHoldTicks > 0 && state.tipHoldTicksElapsed < preset.tipHoldTicks) {
    state.tipHoldTicksElapsed += 1
    tipDamping = preset.tipDampingImpulse * support.contactT * support.contactT
  } else if (!support || !state.jumpHeld) {
    state.tipHoldTicksElapsed = 0
  }
  if (!support && state.coyoteRemaining > 0) state.coyoteRemaining -= 1
  return { jump, tipDamping }
}

export function debugFeelState(state: FeelState): Readonly<FeelState> {
  return Object.freeze({ ...state, lastSupport: state.lastSupport && copySupport(state.lastSupport) })
}

/** Fixed-size canonical little-endian state record. */
export function serializeFeelState(state: FeelState): Uint8Array {
  const bytes = new Uint8Array(64)
  const view = new DataView(bytes.buffer)
  view.setFloat64(0, state.bufferUntilTick, true)
  view.setInt32(8, state.coyoteRemaining, true)
  view.setInt32(12, state.chargeTicks, true)
  view.setInt32(16, state.tipHoldTicksElapsed, true)
  bytes[20] = state.jumpHeld ? 1 : 0
  bytes[21] = state.jumpConsumed ? 1 : 0
  bytes[22] = state.airborneSinceJump ? 1 : 0
  bytes[23] = state.lastSupport ? 1 : 0
  view.setFloat64(24, state.pendingScale, true)
  if (state.lastSupport) {
    view.setFloat64(32, state.lastSupport.contactT, true)
    view.setFloat64(40, state.lastSupport.normal.x, true)
    view.setFloat64(48, state.lastSupport.normal.y, true)
    view.setFloat64(56, state.lastSupport.normal.z, true)
  }
  return bytes
}

export const feelDebug = debugFeelState
