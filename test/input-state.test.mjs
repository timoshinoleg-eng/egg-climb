import assert from 'node:assert/strict'
import test from 'node:test'
import { InputState } from '../dist/game/input-state.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { FixedTickInputScheduler } from '../dist/host/fixed-tick-scheduler.js'

test('multiple pointer and keyboard owners cannot release each other', () => {
  const input = new InputState()
  input.press('jump', 'pointer:1'); input.press('jump', 'pointer:2'); input.press('jump', 'key:Space')
  assert.equal(input.sample().jumpDown, true)
  input.release('pointer:99', true); input.release('pointer:2', true)
  assert.equal(input.held('jump'), true); assert.equal(input.sample().jumpCancel, false)
  input.release('key:Space'); assert.equal(input.sample().jumpUp, false)
  input.release('pointer:1'); assert.equal(input.sample().jumpUp, true)
  assert.deepEqual(input.sample(), { ...NEUTRAL_INPUT, jumpCancel: false })
})

test('short press retains both edges and keyboard repeat cannot inject jumps', () => {
  const input = new InputState()
  input.press('jump', 'key'); input.press('jump', 'key')
  assert.equal(input.sample().jumpDown, true)
  input.press('jump', 'key'); assert.equal(input.sample().jumpDown, false)
  input.release('key'); input.sample()
  input.press('jump', 'pointer'); input.release('pointer')
  const sample = input.sample(); assert.equal(sample.jumpDown, true); assert.equal(sample.jumpUp, true)
  assert.deepEqual(input.sample(), { ...NEUTRAL_INPUT, jumpCancel: false })
})

test('focus loss cancels queued release and restart removes every input edge', () => {
  const input = new InputState()
  input.press('right', 'move'); input.press('jump', 'jump'); input.release('jump'); input.cancel()
  const sample = input.sample()
  assert.equal(sample.jumpCancel, true); assert.equal(sample.jumpUp, false); assert.equal(sample.jumpDown, false); assert.equal(sample.moveX, 0)
  input.press('jump', 'other'); input.reset(); assert.deepEqual(input.sample(), { ...NEUTRAL_INPUT, jumpCancel: false })
})

test('opposing actions, aliases, and planar sampling preserve neutral axes', () => {
  const input = new InputState()
  input.press('right', 'ArrowRight'); input.press('right', 'KeyD'); input.press('left', 'KeyA')
  assert.equal(input.sample().moveX, 0)
  input.release('KeyA'); input.release('ArrowRight'); assert.equal(input.sample().moveX, 1)
  input.press('forward', 'KeyW'); assert.equal(input.sample().moveZ, 0); assert.equal(input.sample(false).moveZ, -1)
})

test('NaN and infinite deltas do not poison the scheduler or sample unbounded input', () => {
  const scheduler = new FixedTickInputScheduler()
  let calls = 0
  const sample = () => { calls++; return NEUTRAL_INPUT }
  for (const delta of [NaN, Infinity, -Infinity, -1]) assert.equal(scheduler.sampleFrame(delta, sample), 0)
  assert.equal(scheduler.sampleFrame(1 / 60, sample), 1); assert.equal(calls, 1)
  scheduler.reset()
  assert.ok(scheduler.sampleFrame(100, sample) <= 6)
  for (let i = 0; i < 100; i++) scheduler.sampleFrame(0.1, sample)
  assert.ok(scheduler.pendingCount <= 120); assert.ok(scheduler.overloadCount > 0)
  const dropped = scheduler.discardPending(); assert.ok(dropped > 0); assert.equal(scheduler.pendingCount, 0); assert.equal(scheduler.alpha, 0)
  scheduler.reset(); assert.equal(scheduler.overloadCount, 0)
})
