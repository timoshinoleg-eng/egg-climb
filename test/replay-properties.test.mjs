import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { defaultReplayHeader, runReplay } from '../dist/sim/index.js'

function canonicalize(rawEvents) {
  const sorted = [...rawEvents].sort((a, b) => a.tick - b.tick || a.order - b.order)
  let currentTick = -1
  let seq = 0
  return sorted.map((event) => {
    if (event.tick !== currentTick) {
      currentTick = event.tick
      seq = 0
    }
    const canonical = event.kind === 'move'
      ? { tick: event.tick, seq, kind: 'move', moveX: event.x / 100, moveZ: event.z / 100 }
      : { tick: event.tick, seq, kind: 'jump', down: event.down }
    seq += 1
    return canonical
  })
}

const rawEventArbitrary = fc.array(
  fc.oneof(
    fc.record({
      kind: fc.constant('move'),
      tick: fc.integer({ min: 0, max: 89 }),
      order: fc.integer({ min: 0, max: 1_000_000 }),
      x: fc.integer({ min: -100, max: 100 }),
      z: fc.integer({ min: -100, max: 100 }),
    }),
    fc.record({
      kind: fc.constant('jump'),
      tick: fc.integer({ min: 0, max: 89 }),
      order: fc.integer({ min: 0, max: 1_000_000 }),
      down: fc.boolean(),
    }),
  ),
  { maxLength: 16 },
)

function assertFiniteSnapshot(snapshot) {
  const values = [
    snapshot.position.x, snapshot.position.y, snapshot.position.z,
    snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w,
    snapshot.linearVelocity.x, snapshot.linearVelocity.y, snapshot.linearVelocity.z,
    snapshot.angularVelocity.x, snapshot.angularVelocity.y, snapshot.angularVelocity.z,
  ]
  for (const value of values) assert.ok(Number.isFinite(value), `non-finite simulation value: ${value}`)
}

test('property: any canonical input log replays identically and stays finite', async () => {
  await fc.assert(
    fc.asyncProperty(rawEventArbitrary, async (rawEvents) => {
      const replay = {
        header: defaultReplayHeader(),
        inputEvents: canonicalize(rawEvents),
        finishTick: 90,
      }
      const first = await runReplay(replay)
      const second = await runReplay(replay)
      assert.equal(first.fingerprint, second.fingerprint)
      assert.deepEqual(first.snapshot, second.snapshot)
      assert.equal(first.snapshot.tick, 90)
      assertFiniteSnapshot(first.snapshot)
    }),
    { numRuns: 32, seed: 0x45_47_47 },
  )
})
