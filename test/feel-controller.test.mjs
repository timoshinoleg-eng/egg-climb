import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createFeelState,
  debugFeelState,
  serializeFeelState,
  stepFeel,
} from '../dist/sim/feel-controller.js'
import { DEFAULT_FEEL, FEEL_PRESETS, computeFeelPresetHash } from '../dist/sim/feel-presets.js'

const support = (contactT = 0.5) => ({ contactT, normal: { x: 0, y: 1, z: 0 } })
const neutral = { jumpDown: false, jumpUp: false }

test('feel presets are complete, immutable, and canonically hashed', () => {
  assert.deepEqual(Object.keys(FEEL_PRESETS).sort(), [
    '2d-hold', '2d-hold-assist', '2d-tap', '2d-tap-assist',
    '3d-hold', '3d-hold-assist', '3d-tap', '3d-tap-assist',
  ])
  assert.equal(DEFAULT_FEEL, FEEL_PRESETS['3d-tap'])
  assert.equal(Object.isFrozen(DEFAULT_FEEL), true)
  assert.equal(computeFeelPresetHash(DEFAULT_FEEL), computeFeelPresetHash({ ...DEFAULT_FEEL }))
  assert.throws(() => { DEFAULT_FEEL.bufferTicks = 3 }, TypeError)
  assert.equal(FEEL_PRESETS['3d-tap-assist'].bufferTicks, 6)
  assert.equal(FEEL_PRESETS['3d-tap-assist'].coyoteTicks, 4)
  assert.equal(FEEL_PRESETS['3d-tap-assist'].tipHoldTicks, 8)
  assert.equal(FEEL_PRESETS['3d-tap-assist'].tipDampingImpulse, 0.012)
})

test('tap jumps once, and needs genuine air-to-landing before another jump', () => {
  const state = createFeelState()
  assert.equal(stepFeel(state, { ...neutral, jumpDown: true }, support(), DEFAULT_FEEL, 10).jump.source, 'support')
  assert.equal(stepFeel(state, { ...neutral, jumpDown: true }, support(), DEFAULT_FEEL, 11).jump, null)
  assert.equal(stepFeel(state, neutral, null, DEFAULT_FEEL, 12).jump, null)
  assert.equal(stepFeel(state, { ...neutral, jumpDown: true }, support(), DEFAULT_FEEL, 13).jump.source, 'support')
})

test('assist coyote and buffer expiration are inclusive', () => {
  const preset = FEEL_PRESETS['3d-tap-assist']
  const coyote = createFeelState()
  stepFeel(coyote, neutral, support(), preset, 20)
  stepFeel(coyote, neutral, null, preset, 21)
  assert.equal(stepFeel(coyote, { ...neutral, jumpDown: true }, null, preset, 22).jump.source, 'coyote')

  const buffer = createFeelState()
  stepFeel(buffer, { ...neutral, jumpDown: true }, null, preset, 30)
  assert.equal(stepFeel(buffer, neutral, support(), preset, 36).jump.source, 'buffer')
  const expired = createFeelState()
  stepFeel(expired, { ...neutral, jumpDown: true }, null, preset, 30)
  assert.equal(stepFeel(expired, neutral, support(), preset, 37).jump, null)
})

test('hold release scales charge, including same-tick down/up minimum', () => {
  const preset = FEEL_PRESETS['3d-hold']
  const state = createFeelState()
  stepFeel(state, { ...neutral, jumpDown: true }, support(), preset, 1)
  for (let tick = 2; tick <= 16; tick += 1) stepFeel(state, neutral, support(), preset, tick)
  const jump = stepFeel(state, { ...neutral, jumpUp: true }, support(), preset, 17).jump
  assert.equal(jump.source, 'support')
  assert.ok(jump.scale > preset.minChargeScale && jump.scale < 1)
  const instant = createFeelState()
  const instantJump = stepFeel(instant, { ...neutral, jumpDown: true, jumpUp: true }, support(), preset, 1).jump
  assert.equal(instantJump.scale, preset.minChargeScale)
})

test('hold release buffers charged scale in air and expires at the inclusive boundary', () => {
  const preset = FEEL_PRESETS['3d-hold-assist']
  const state = createFeelState()
  stepFeel(state, { ...neutral, jumpDown: true }, support(), preset, 0)
  for (let tick = 1; tick < 30; tick += 1) stepFeel(state, neutral, support(), preset, tick)
  for (let tick = 30; tick < 36; tick += 1) stepFeel(state, neutral, null, preset, tick)
  assert.equal(stepFeel(state, { ...neutral, jumpUp: true }, null, preset, 36).jump, null)
  const buffered = stepFeel(state, neutral, null, preset, 37)
  assert.equal(buffered.jump, null)
  const landed = stepFeel(state, neutral, support(), preset, 42).jump
  assert.equal(landed.source, 'buffer')
  assert.equal(landed.scale, 1)

  const expired = createFeelState()
  stepFeel(expired, { ...neutral, jumpDown: true }, support(), preset, 0)
  stepFeel(expired, { ...neutral, jumpUp: true }, null, preset, 1)
  assert.equal(stepFeel(expired, neutral, support(), preset, 8).jump, null)
})

test('tip damping is contactT squared and capped by held-contact ticks', () => {
  const preset = FEEL_PRESETS['3d-tap-assist']
  const state = createFeelState()
  assert.equal(stepFeel(state, { ...neutral, jumpDown: true }, support(0.5), preset, 1).tipDamping, 0.003)
  assert.equal(stepFeel(state, neutral, support(1), preset, 2).tipDamping, 0.012)
  for (let tick = 3; tick <= 9; tick += 1) stepFeel(state, neutral, support(1), preset, tick)
  assert.equal(stepFeel(state, neutral, support(1), preset, 10).tipDamping, 0)
})

test('state serialization and debug view include deterministic future state', () => {
  const state = createFeelState()
  stepFeel(state, { ...neutral, jumpDown: true }, support(0.25), FEEL_PRESETS['3d-tap-assist'], 4)
  const bytes = serializeFeelState(state)
  assert.equal(bytes instanceof Uint8Array, true)
  assert.equal(bytes.length, 64)
  assert.deepEqual(debugFeelState(state).lastSupport, support(0.25))
  assert.notDeepEqual(bytes, serializeFeelState(createFeelState()))
})
