import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalSimulationHost } from '../dist/host/index.js'

const INPUT = Object.freeze({ moveX: 0.5, moveZ: 0, jumpDown: false, jumpUp: false })
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

test('local simulation host rejects invalid batches and values', async () => {
  const host = new LocalSimulationHost()
  try {
    await host.init()
    await assert.rejects(host.advance(repeated(NEUTRAL, 121)), /batch is too large/)
    await assert.rejects(host.advance([{ ...NEUTRAL, moveX: 2 }]), /outside \[-1, 1\]/)
    await assert.rejects(host.advance(null), /input array/)
  } finally {
    await host.free()
  }
})

test('local simulation host closes permanently after free', async () => {
  const host = new LocalSimulationHost()
  await host.init()
  await host.free()
  await assert.rejects(host.advance([NEUTRAL]), /closed/)
  await assert.rejects(host.init(), /closed/)
})
