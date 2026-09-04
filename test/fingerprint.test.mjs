import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeFingerprintEnvelope, fingerprintSimulationState } from '../dist/sim/index.js'

const PHYSICS = Uint8Array.from([1, 2, 3, 4])

test('fingerprint envelope binds tick and authoritative app-state', () => {
  const base = fingerprintSimulationState({ tick: 10, authoritativeState: new Uint8Array(0), physicsSnapshot: PHYSICS })
  const differentTick = fingerprintSimulationState({ tick: 11, authoritativeState: new Uint8Array(0), physicsSnapshot: PHYSICS })
  const differentAppState = fingerprintSimulationState({ tick: 10, authoritativeState: Uint8Array.from([1]), physicsSnapshot: PHYSICS })
  assert.notEqual(base, differentTick)
  assert.notEqual(base, differentAppState)
  assert.equal(base, fingerprintSimulationState({ tick: 10, authoritativeState: new Uint8Array(0), physicsSnapshot: PHYSICS }))
})

test('fingerprint envelope is canonical and rejects invalid ticks', () => {
  const a = encodeFingerprintEnvelope({ tick: 123, authoritativeState: Uint8Array.from([9, 8]), physicsSnapshot: PHYSICS })
  const b = encodeFingerprintEnvelope({ tick: 123, authoritativeState: Uint8Array.from([9, 8]), physicsSnapshot: PHYSICS })
  assert.deepEqual(a, b)
  assert.throws(() => encodeFingerprintEnvelope({ tick: Number.NaN, authoritativeState: new Uint8Array(0), physicsSnapshot: PHYSICS }), /safe integer/)
  assert.throws(() => encodeFingerprintEnvelope({ tick: -1, authoritativeState: new Uint8Array(0), physicsSnapshot: PHYSICS }), /safe integer/)
})
