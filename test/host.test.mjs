import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalSimulationHost } from '../dist/host/index.js'

const INPUT = { moveX: 0.5, moveZ: 0, jumpDown: false, jumpUp: false }

test('local simulation host preserves the transport contract', async () => {
  const host = new LocalSimulationHost()
  try {
    const initial = await host.init()
    assert.equal(initial.tick, 0)
    const frame = await host.advance(10, INPUT)
    assert.equal(frame.previous.tick, 9)
    assert.equal(frame.current.tick, 10)
    assert.equal(frame.stepped, 10)
    const reset = await host.reset()
    assert.equal(reset.tick, 0)
  } finally {
    await host.free()
  }
})

test('local simulation host rejects invalid advance counts', async () => {
  const host = new LocalSimulationHost()
  try {
    await host.init()
    await assert.rejects(host.advance(-1, INPUT), /Invalid simulation advance/)
    await assert.rejects(host.advance(121, INPUT), /Invalid simulation advance/)
  } finally {
    await host.free()
  }
})
