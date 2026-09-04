import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { LocalSimulationHost } from '../dist/host/index.js'
import { defaultReplayHeader, runReplay } from '../dist/sim/index.js'

const tickInputArbitrary = fc.array(
  fc.record({
    moveXInt: fc.integer({ min: -10, max: 10 }),
    moveZInt: fc.integer({ min: -10, max: 10 }),
  }),
  { minLength: 1, maxLength: 50 },
)
const chunkArbitrary = fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 12 })

function toInputs(values) {
  return values.map(({ moveXInt, moveZInt }) => ({ moveX: moveXInt / 10, moveZ: moveZInt / 10, jumpDown: false, jumpUp: false }))
}

function toReplay(inputs) {
  return {
    header: defaultReplayHeader(),
    inputEvents: inputs.map((input, tick) => ({ tick, seq: 0, kind: 'move', moveX: input.moveX, moveZ: input.moveZ })),
    finishTick: inputs.length,
  }
}

async function runHost(inputs, chunkSizes) {
  const host = new LocalSimulationHost()
  try {
    await host.init()
    let cursor = 0
    let chunkCursor = 0
    while (cursor < inputs.length) {
      const requested = chunkSizes[chunkCursor % chunkSizes.length]
      const end = Math.min(inputs.length, cursor + requested)
      await host.advance(inputs.slice(cursor, end))
      cursor = end
      chunkCursor += 1
    }
    return { fingerprint: await host.fingerprint() }
  } finally {
    await host.free()
  }
}

test('property: replay, single batch and arbitrary transport chunking are equivalent', async () => {
  await fc.assert(
    fc.asyncProperty(tickInputArbitrary, chunkArbitrary, async (rawInputs, chunkSizes) => {
      const inputs = toInputs(rawInputs)
      const replayResult = await runReplay(toReplay(inputs))
      const singleBatch = await runHost(inputs, [inputs.length])
      const chunked = await runHost(inputs, chunkSizes)
      assert.equal(singleBatch.fingerprint, replayResult.fingerprint)
      assert.equal(chunked.fingerprint, replayResult.fingerprint)
      assert.equal(replayResult.snapshot.tick, inputs.length)
    }),
    { numRuns: 20, seed: 0x45_47_47 },
  )
})
