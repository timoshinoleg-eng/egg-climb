import assert from 'node:assert/strict'
import test from 'node:test'
import { FixedTickInputScheduler, LocalSimulationHost } from '../dist/host/index.js'
import { PHYSICS_DT } from '../dist/sim/index.js'

const INPUT = Object.freeze({ moveX: 0.5, moveZ: 0, jumpDown: false, jumpUp: false })
const ALT_INPUT = Object.freeze({ moveX: 0, moveZ: -0.75, jumpDown: false, jumpUp: false })
const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })

function repeated(input, count) {
  return Array.from({ length: count }, () => input)
}

test('local simulation host preserves per-tick transport and fingerprint contracts', async () => {
  const host = new LocalSimulationHost()
  try {
    const initial = await host.init()
    assert.equal(initial.tick, 0)
    const frame = await host.advance(repeated(INPUT, 10))
    assert.equal(frame.previous.tick, 9)
    assert.equal(frame.current.tick, 10)
    assert.equal(frame.stepped, 10)
    const firstFingerprint = await host.fingerprint()

    const reset = await host.reset()
    assert.equal(reset.tick, 0)
    await host.advance(repeated(INPUT, 10))
    assert.equal(await host.fingerprint(), firstFingerprint)
  } finally {
    await host.free()
  }
})

test('local transport batching is semantically identical to per-tick advance', async () => {
  const inputs = [...repeated(INPUT, 7), ...repeated(ALT_INPUT, 5), ...repeated(NEUTRAL, 4)]
  const batched = new LocalSimulationHost()
  const sequential = new LocalSimulationHost()
  try {
    await batched.init(); await sequential.init()
    const batchFrame = await batched.advance(inputs)
    let sequentialFrame
    for (const input of inputs) sequentialFrame = await sequential.advance([input])
    assert.equal(batchFrame.current.tick, inputs.length)
    assert.equal(sequentialFrame.current.tick, inputs.length)
    assert.deepEqual(batchFrame.current, sequentialFrame.current)
    assert.equal(await batched.fingerprint(), await sequential.fingerprint())
  } finally {
    await batched.free(); await sequential.free()
  }
})

test('local simulation host fails closed on lifecycle and invalid batches', async () => {
  const host = new LocalSimulationHost()
  await assert.rejects(host.advance([NEUTRAL]), /not initialized/)
  await host.init()
  await assert.rejects(host.init(), /already initialized/)
  await assert.rejects(host.advance([]), /at least one tick input/)
  await assert.rejects(host.advance(repeated(NEUTRAL, 121)), /batch is too large/)
  await assert.rejects(host.advance([{ ...NEUTRAL, moveX: 2 }]), /outside \[-1, 1\]/)
  await assert.rejects(host.advance(null), /input array/)
  await host.free()
  await assert.rejects(host.advance([NEUTRAL]), /closed/)
  await assert.rejects(host.init(), /closed/)
  await host.free()
})

test('fixed tick scheduler samples independently of worker acknowledgements and bounds wall-clock debt', () => {
  const scheduler = new FixedTickInputScheduler()
  let sampleCount = 0
  const sample = () => ({ ...NEUTRAL, moveX: ++sampleCount / 10 })
  assert.equal(scheduler.sampleFrame(PHYSICS_DT * 3.5, sample), 3)
  assert.equal(sampleCount, 3)
  assert.equal(scheduler.pendingCount, 3)
  const firstBatch = scheduler.takeBatch(2)
  assert.equal(firstBatch.length, 2)
  assert.equal(scheduler.pendingCount, 1)
  assert.equal(scheduler.sampleFrame(PHYSICS_DT * 2.2, sample), 2)
  assert.equal(sampleCount, 5)
  assert.equal(scheduler.pendingCount, 3)
  scheduler.resetTiming()
  assert.equal(scheduler.alpha, 0)
  assert.throws(() => scheduler.takeBatch(0), /positive integer/)
})
