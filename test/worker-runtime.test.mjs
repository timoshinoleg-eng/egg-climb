import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalSimulationHost, SimulationWorkerRuntime } from '../dist/host/index.js'
import {
  EGG_COLLIDER_HASH,
  EGG_COLLIDER_ID,
  FEEL_PRESETS,
  PHYSICS_PRESET_HASH,
  PHYSICS_PRESET_ID,
  PHYSICS_V1,
  WORKER_PROTOCOL_VERSION,
  physicsLabScenario,
} from '../dist/sim/index.js'
import { initPhysics, RAPIER } from '../dist/sim/rapier.js'

const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })
const request = (id, payload) => ({ ...payload, id, protocolVersion: WORKER_PROTOCOL_VERSION })

test('typed worker runtime is fail-closed and preserves queued ordering after command errors', async () => {
  await initPhysics()
  const runtime = new SimulationWorkerRuntime(RAPIER)
  const init = await runtime.enqueue(request(1, { type: 'init' }))
  assert.equal(init.type, 'initialized')
  assert.equal(init.runtimeInfo.runtime, 'worker')
  assert.equal(init.runtimeInfo.physicsPresetId, PHYSICS_PRESET_ID)
  assert.equal(init.runtimeInfo.physicsPresetHash, PHYSICS_PRESET_HASH)
  assert.equal(init.runtimeInfo.eggColliderId, EGG_COLLIDER_ID)
  assert.equal(init.runtimeInfo.eggColliderHash, EGG_COLLIDER_HASH)
  assert.equal(init.snapshot.tick, 0)

  assert.equal((await runtime.enqueue(request(2, { type: 'init' }))).type, 'error')
  assert.equal((await runtime.enqueue(request(3, { type: 'advance', inputs: [] }))).type, 'error')

  const badAdvance = runtime.enqueue(request(4, { type: 'advance', inputs: [{ ...NEUTRAL, moveX: 2 }] }))
  const fingerprintAfterError = runtime.enqueue(request(5, { type: 'fingerprint' }))
  assert.equal((await badAdvance).type, 'error')
  const afterError = await fingerprintAfterError
  assert.equal(afterError.type, 'fingerprint')
  assert.equal(afterError.tick, 0)

  const resetPromise = runtime.enqueue(request(6, { type: 'reset' }))
  const advancePromise = runtime.enqueue(request(7, { type: 'advance', inputs: [NEUTRAL] }))
  const [reset, advanced] = await Promise.all([resetPromise, advancePromise])
  assert.equal(reset.type, 'reset')
  assert.equal(reset.snapshot.tick, 0)
  assert.equal(advanced.type, 'advanced')
  assert.equal(advanced.frame.current.tick, 1)
  assert.deepEqual(advanced.frame.events, [])

  const wrongProtocol = await runtime.enqueue({ type: 'fingerprint', id: 8, protocolVersion: 999 })
  assert.equal(wrongProtocol.type, 'error')
  assert.match(wrongProtocol.message, /protocol version/)

  assert.equal((await runtime.enqueue(request(9, { type: 'free' }))).type, 'freed')
  assert.equal((await runtime.enqueue(request(10, { type: 'free' }))).type, 'freed')
  const afterFree = await runtime.enqueue(request(11, { type: 'fingerprint' }))
  assert.equal(afterFree.type, 'error')
  assert.match(afterFree.message, /closed/)
})

function eventPosition(event) {
  return [event.attemptId, event.tick, event.ordinal]
}

function compareEventPosition(a, b) {
  const left = eventPosition(a)
  const right = eventPosition(b)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

test('Local and Worker emit the same ordered multi-event stream without batch-edge loss', async () => {
  await initPhysics()
  const scenario = physicsLabScenario('jump-base')
  const options = {
    preset: PHYSICS_V1,
    feel: FEEL_PRESETS['3d-tap'],
    level: scenario.level,
    initialEgg: scenario.initialEgg,
  }
  const inputs = [
    NEUTRAL,
    { ...NEUTRAL, jumpDown: true },
    ...Array.from({ length: 70 }, () => NEUTRAL),
  ]
  const local = new LocalSimulationHost(options)
  const runtime = new SimulationWorkerRuntime(RAPIER, options)

  try {
    await local.init()
    const initialized = await runtime.enqueue(request(100, { type: 'init' }))
    assert.equal(initialized.type, 'initialized')

    const localFrame = await local.advance(inputs)
    const workerResponse = await runtime.enqueue(request(101, { type: 'advance', inputs }))
    assert.equal(workerResponse.type, 'advanced')
    assert.deepEqual(workerResponse.frame.current, localFrame.current)
    assert.deepEqual(workerResponse.frame.events, localFrame.events)
    assert.equal(workerResponse.frame.stepped, inputs.length)

    const kinds = localFrame.events.map(event => event.kind)
    assert.ok(kinds.includes('jump'), `expected jump in ${kinds.join(',')}`)
    assert.ok(kinds.some(kind => kind === 'land' || kind === 'hard-land'), `expected landing in ${kinds.join(',')}`)
    assert.ok(localFrame.events.length >= 2, 'multiple events must survive one transport batch')
    for (let i = 1; i < localFrame.events.length; i += 1) {
      assert.ok(compareEventPosition(localFrame.events[i - 1], localFrame.events[i]) < 0, 'events must be strictly ordered')
    }

    const localFingerprint = await local.fingerprint()
    const workerFingerprint = await runtime.enqueue(request(102, { type: 'fingerprint' }))
    assert.equal(workerFingerprint.type, 'fingerprint')
    assert.equal(workerFingerprint.fingerprint, localFingerprint)

    await local.reset()
    const workerReset = await runtime.enqueue(request(103, { type: 'reset' }))
    assert.equal(workerReset.type, 'reset')
    const localAfterReset = await local.advance(inputs)
    const workerAfterReset = await runtime.enqueue(request(104, { type: 'advance', inputs }))
    assert.equal(workerAfterReset.type, 'advanced')
    assert.deepEqual(workerAfterReset.frame.events, localAfterReset.events)
    assert.ok(localAfterReset.events.length >= 2)
    assert.ok(localAfterReset.events.every(event => event.attemptId === 1))
    assert.notEqual(localAfterReset.events[0].id, localFrame.events[0].id)
  } finally {
    await local.free()
    await runtime.enqueue(request(105, { type: 'free' }))
  }
})
