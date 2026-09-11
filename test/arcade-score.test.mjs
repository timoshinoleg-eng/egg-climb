import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_ARCADE_SCORE, updateArcadeScore, isOutsideArcadeBounds } from '../dist/game/arcade-score.js'
import { ARCADE_OPTIONS, ARCADE_LEVEL, ARCADE_PHYSICS } from '../dist/game/arcade-level.js'
import { LocalSimulationHost } from '../dist/host/local-host.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { computePhysicsPresetHash, immutablePhysicsPreset, PHYSICS_V1, PHYSICS_V1_IDENTITY } from '../dist/sim/physics-presets.js'

const snapshot = (y, top = 0) => ({
  position: { x: 0, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
  physics: { grounded: true, supportContactWorld: { x: 0, y: top, z: 0 } },
})

test('arcade points quantize maximum COM climb and cannot be farmed by repeated hops', () => {
  let score = updateArcadeScore(EMPTY_ARCADE_SCORE, snapshot(0.72), 0.6, -0.12, false)
  assert.equal(score.points, 0)
  score = updateArcadeScore(score, snapshot(0.92), 0.6, -0.12, false)
  assert.equal(score.heightMm, 200); assert.equal(score.points, 20)
  score = updateArcadeScore(score, snapshot(2.225), 0.6, -0.12, false)
  assert.equal(score.heightMm, 1505); assert.equal(score.points, 150)
  for (let i = 0; i < 40; i++) score = updateArcadeScore(score, snapshot(i % 2 ? 2 : 0.5), 0.6, -0.12, true)
  assert.equal(score.points, 150); assert.equal(score.combo, 0)
  assert.deepEqual(EMPTY_ARCADE_SCORE, { heightMm: 0, points: 0, combo: 0, bonus: 0, highestLandingMm: 0 })
})

test('only genuinely higher supporting landings earn the capped combo bonus', () => {
  let score = EMPTY_ARCADE_SCORE
  for (let step = 1; step <= 8; step++) {
    const before = score
    score = updateArcadeScore(score, snapshot(step + 0.72, step), 0.6, -0.12, true)
    assert.equal(score.combo, Math.min(step, 5))
    assert.equal(score.bonus - before.bonus, Math.min(step, 5) * 10)
    const repeated = updateArcadeScore(score, snapshot(step + 0.72, step), 0.6, -0.12, true)
    assert.deepEqual(repeated, score)
  }
  const notLanded = updateArcadeScore(score, snapshot(20, 15), 0.6, -0.12, false)
  assert.equal(notLanded.bonus, score.bonus)
  const lower = updateArcadeScore(score, snapshot(1.7, 1), 0.6, -0.12, true)
  assert.equal(lower.combo, 5); assert.equal(lower.bonus, score.bonus)
})

test('fall bounds reject nonfinite positions and give a seven metre recovery window', () => {
  assert.equal(isOutsideArcadeBounds(snapshot(-2.9), 1), false)
  assert.equal(isOutsideArcadeBounds(snapshot(-3.01), 1), true)
  assert.equal(isOutsideArcadeBounds(snapshot(8), 15), false)
  assert.equal(isOutsideArcadeBounds(snapshot(7.9), 15), true)
  for (const axis of ['x', 'y', 'z']) for (const value of [NaN, Infinity, -Infinity]) {
    const s = snapshot(1); s.position[axis] = value
    assert.equal(isOutsideArcadeBounds(s, 1), true)
  }
})

test('opt-in fixed-tick drive enters identity without changing any legacy preset hash', () => {
  assert.equal(computePhysicsPresetHash(PHYSICS_V1), PHYSICS_V1_IDENTITY.hash)
  assert.notEqual(computePhysicsPresetHash(ARCADE_PHYSICS), computePhysicsPresetHash({ ...ARCADE_PHYSICS, controls: { ...ARCADE_PHYSICS.controls, driveImpulse: 0.01 } }))
  for (const driveImpulse of [-1, NaN, Infinity, 1.01]) assert.throws(() => immutablePhysicsPreset({ ...PHYSICS_V1, controls: { torqueImpulse: 0.01, driveImpulse } }), /drive impulse/)
})

test('live Rapier collision and steering can climb the first leaf, without teleporting', async () => {
  const host = new LocalSimulationHost(ARCADE_OPTIONS)
  try {
    let current = await host.init()
    let highestLanding = 0
    let jumped = false
    for (let tick = 0; tick < 220; tick++) {
      const moveX = tick < 30 ? 0 : Math.max(-1, Math.min(1, (2.8 - current.position.x) * 1.4 - current.linearVelocity.x * 0.6))
      const frame = await host.advance([{ ...NEUTRAL_INPUT, moveX, jumpDown: tick === 50 }])
      current = frame.current
      jumped ||= frame.events.some(event => event.kind === 'jump')
      if (current.physics.grounded) highestLanding = Math.max(highestLanding, current.physics.supportContactWorld?.y ?? 0)
    }
    assert.equal(jumped, true)
    assert.ok(highestLanding >= 1.65, `highest contact ${highestLanding}`)
    assert.ok(Math.abs(current.position.x - 2.8) < 0.4)
    assert.equal(current.position.z, 0)
  } finally { await host.free() }
})

test('garden platform clearance avoids a standing-egg wedge between consecutive ledges', () => {
  for (let i = 2; i < ARCADE_LEVEL.staticBoxes.length; i++) {
    const below = ARCADE_LEVEL.staticBoxes[i - 1], above = ARCADE_LEVEL.staticBoxes[i]
    assert.ok(above.center[1] - above.halfExtents[1] - (below.center[1] + below.halfExtents[1]) > 1.2)
  }
})
