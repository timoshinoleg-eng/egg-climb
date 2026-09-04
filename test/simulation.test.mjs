import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultReplayHeader, runReplay } from '../dist/sim/index.js'

const GOLDEN_REPLAY_FINGERPRINT = '436f6aa7'

function replay(events, finishTick = 240) { return { header: defaultReplayHeader(), inputEvents: events, finishTick } }

test('golden replay is byte-identical and stable', async () => {
  const input = replay([
    { tick: 10, seq: 0, kind: 'move', moveX: 1, moveZ: 0 },
    { tick: 90, seq: 0, kind: 'move', moveX: 0, moveZ: 0.5 },
    { tick: 150, seq: 0, kind: 'move', moveX: 0, moveZ: 0 },
    { tick: 170, seq: 0, kind: 'jump', down: true },
    { tick: 175, seq: 0, kind: 'jump', down: false },
  ])
  const a = await runReplay(input); const b = await runReplay(input)
  assert.equal(a.fingerprint, GOLDEN_REPLAY_FINGERPRINT)
  assert.equal(b.fingerprint, GOLDEN_REPLAY_FINGERPRINT)
  assert.deepEqual(a.snapshot, b.snapshot)
  assert.equal(a.snapshot.tick, 240)
})

test('different tick-boundary movement changes the simulation result', async () => {
  const left = await runReplay(replay([{ tick: 10, seq: 0, kind: 'move', moveX: -1, moveZ: 0 }, { tick: 120, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }]))
  const right = await runReplay(replay([{ tick: 10, seq: 0, kind: 'move', moveX: 1, moveZ: 0 }, { tick: 120, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }]))
  assert.notEqual(left.fingerprint, right.fingerprint)
  assert.ok(left.snapshot.position.x < right.snapshot.position.x)
})

test('replay rejects non-canonical input order', async () => {
  await assert.rejects(runReplay(replay([{ tick: 20, seq: 0, kind: 'move', moveX: 1, moveZ: 0 }, { tick: 10, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }])), /canonical/)
})
