import assert from 'node:assert/strict'
import test from 'node:test'
import { SimulationWorkerRuntime } from '../dist/host/index.js'
import { WORKER_PROTOCOL_VERSION } from '../dist/sim/index.js'
import { initPhysics, RAPIER } from '../dist/sim/rapier.js'

const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })
const request = (id, payload) => ({ ...payload, id, protocolVersion: WORKER_PROTOCOL_VERSION })

test('typed worker runtime is fail-closed and preserves queued ordering after command errors', async () => {
  await initPhysics()
  const runtime = new SimulationWorkerRuntime(RAPIER)
  const init = await runtime.enqueue(request(1, { type: 'init' }))
  assert.equal(init.type, 'initialized')
  assert.equal(init.runtimeInfo.runtime, 'worker')
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

  const wrongProtocol = await runtime.enqueue({ type: 'fingerprint', id: 8, protocolVersion: 999 })
  assert.equal(wrongProtocol.type, 'error')
  assert.match(wrongProtocol.message, /protocol version/)

  assert.equal((await runtime.enqueue(request(9, { type: 'free' }))).type, 'freed')
  assert.equal((await runtime.enqueue(request(10, { type: 'free' }))).type, 'freed')
  const afterFree = await runtime.enqueue(request(11, { type: 'fingerprint' }))
  assert.equal(afterFree.type, 'error')
  assert.match(afterFree.message, /closed/)
})
