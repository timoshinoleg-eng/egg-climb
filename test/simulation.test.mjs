import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultReplayHeader, runReplay } from '../dist/sim/index.js'

const GOLDEN_REPLAY_FINGERPRINT = '436f6aa7'

function replay(events, finishTick = 240, header = defaultReplayHeader(), clientFingerprint) {
  return clientFingerprint === undefined
    ? { header, inputEvents: events, finishTick }
    : { header, inputEvents: events, finishTick, clientFingerprint }
}

const GOLDEN_EVENTS = [
  { tick: 10, seq: 0, kind: 'move', moveX: 1, moveZ: 0 },
  { tick: 90, seq: 0, kind: 'move', moveX: 0, moveZ: 0.5 },
  { tick: 150, seq: 0, kind: 'move', moveX: 0, moveZ: 0 },
  { tick: 170, seq: 0, kind: 'jump', down: true },
  { tick: 175, seq: 0, kind: 'jump', down: false },
]

test('golden replay is byte-identical and stable', async () => {
  const input = replay(GOLDEN_EVENTS)
  const a = await runReplay(input); const b = await runReplay(input)
  assert.equal(a.fingerprint, GOLDEN_REPLAY_FINGERPRINT)
  assert.equal(b.fingerprint, GOLDEN_REPLAY_FINGERPRINT)
  assert.deepEqual(a.snapshot, b.snapshot)
  assert.equal(a.snapshot.tick, 240)
  assert.equal(a.clientFingerprintMatches, null)
})

test('client fingerprint comparison is telemetry and does not reject the replay', async () => {
  const matching = await runReplay(replay(GOLDEN_EVENTS, 240, defaultReplayHeader(), GOLDEN_REPLAY_FINGERPRINT))
  const mismatching = await runReplay(replay(GOLDEN_EVENTS, 240, defaultReplayHeader(), '00000000'))
  assert.equal(matching.clientFingerprintMatches, true)
  assert.equal(mismatching.clientFingerprintMatches, false)
  assert.equal(mismatching.fingerprint, GOLDEN_REPLAY_FINGERPRINT)
  await assert.rejects(runReplay(replay(GOLDEN_EVENTS, 240, defaultReplayHeader(), 'not-a-hash')), /Invalid client fingerprint/)
})

test('different tick-boundary movement changes the simulation result', async () => {
  const left = await runReplay(replay([{ tick: 10, seq: 0, kind: 'move', moveX: -1, moveZ: 0 }, { tick: 120, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }]))
  const right = await runReplay(replay([{ tick: 10, seq: 0, kind: 'move', moveX: 1, moveZ: 0 }, { tick: 120, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }]))
  assert.notEqual(left.fingerprint, right.fingerprint)
  assert.ok(left.snapshot.position.x < right.snapshot.position.x)
})

test('replay rejects non-canonical event ordering and sequence gaps', async () => {
  await assert.rejects(runReplay(replay([{ tick: 20, seq: 0, kind: 'move', moveX: 1, moveZ: 0 }, { tick: 10, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }])), /canonical/)
  await assert.rejects(runReplay(replay([{ tick: 10, seq: 1, kind: 'move', moveX: 1, moveZ: 0 }])), /contiguous/)
})

test('replay fails closed when metadata claims an unimplemented world or mode', async () => {
  const base = defaultReplayHeader()
  await assert.rejects(runReplay(replay([], 1, { ...base, dimensionMode: '2.5d' })), /Dimension/)
  await assert.rejects(runReplay(replay([], 1, { ...base, levelVersion: 2 })), /Level/)
  await assert.rejects(runReplay(replay([], 1, { ...base, seed: 42 })), /seed/)
})

test('replay rejects malformed runtime event kinds', async () => {
  await assert.rejects(runReplay(replay([{ tick: 0, seq: 0, kind: 'teleport', x: 99 }])), /Unsupported input event kind/)
})
