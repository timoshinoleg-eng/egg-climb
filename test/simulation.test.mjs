import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultReplayHeader, runReplay } from '../dist/sim/index.js'

const GOLDEN_REPLAY_FINGERPRINT = 'ec643eb8'

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
  console.log(`[golden-fingerprint] ${a.fingerprint}`)
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

test('replay fails closed for every simulation-affecting metadata mismatch', async () => {
  const base = defaultReplayHeader()
  const cases = [
    ['protocolVersion', base.protocolVersion + 1, /protocol/],
    ['simulationVersion', 'other-sim', /Simulation version/],
    ['rapierPackage', 'other-rapier', /Rapier version/],
    ['rapierVersion', '9.9.9', /Rapier version/],
    ['fingerprintVersion', base.fingerprintVersion + 1, /Fingerprint version/],
    ['physicsPresetId', 'other-preset', /Physics preset/],
    ['physicsPresetVersion', base.physicsPresetVersion + 1, /Physics preset/],
    ['physicsPresetHash', '00000000', /Physics preset/],
    ['eggColliderId', 'other-collider', /Egg collider/],
    ['eggColliderVersion', base.eggColliderVersion + 1, /Egg collider/],
    ['eggColliderHash', '00000000', /Egg collider/],
    ['tickRate', 30, /Tick rate/],
    ['levelId', 'other-level', /Level version/],
    ['levelVersion', base.levelVersion + 1, /Level version/],
    ['seed', 42, /seed/],
    ['dimensionMode', '2.5d', /Dimension/],
    ['controlMode', 'hold-release', /Control/],
    ['assistPresetId', 'other-assist', /Assist/],
  ]
  for (const [field, value, pattern] of cases) {
    await assert.rejects(runReplay(replay([], 1, { ...base, [field]: value })), pattern, field)
  }
})

test('replay rejects malformed runtime event kinds', async () => {
  await assert.rejects(runReplay(replay([{ tick: 0, seq: 0, kind: 'teleport', x: 99 }])), /Unsupported input event kind/)
})
