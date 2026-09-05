import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FEEL_PRESETS,
  PHYSICS_V1,
  createSimulation,
  physicsLabScenario,
} from '../dist/sim/index.js'

const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })
const FEEL_KEYS = Object.keys(FEEL_PRESETS).sort()

async function runFeel(key, inputs, initialEgg) {
  const scenario = physicsLabScenario('jump-base')
  const simulation = await createSimulation({
    preset: PHYSICS_V1,
    feel: FEEL_PRESETS[key],
    level: scenario.level,
    initialEgg: initialEgg ?? scenario.initialEgg,
  })
  try {
    for (const input of inputs) simulation.step(input)
    return { snapshot: simulation.snapshot(), fingerprint: simulation.fingerprint() }
  } finally {
    simulation.free()
  }
}

test('all eight feel presets execute through the real simulation and expose identity', async () => {
  assert.deepEqual(FEEL_KEYS, [
    '2d-hold', '2d-hold-assist', '2d-tap', '2d-tap-assist',
    '3d-hold', '3d-hold-assist', '3d-tap', '3d-tap-assist',
  ])
  for (const key of FEEL_KEYS) {
    const { snapshot, fingerprint } = await runFeel(key, Array.from({ length: 30 }, () => NEUTRAL))
    assert.equal(typeof fingerprint, 'string')
    assert.equal(snapshot.identity.feelPresetId, FEEL_PRESETS[key].id)
    assert.equal(snapshot.identity.feelPresetVersion, FEEL_PRESETS[key].version)
    assert.equal(typeof snapshot.identity.feelPresetHash, 'string')
  }
})

test('2.5d constrains Z translation and X/Y rotation while 3d retains them', async () => {
  const initialEgg = {
    position: [0, 0.9, 0.25],
    rotation: [0.12, 0.2, 0, 0.96],
    linearVelocity: [0, 0, 1],
    angularVelocity: [0.5, 0.4, 0],
  }
  const inputs = Array.from({ length: 20 }, () => ({ ...NEUTRAL, moveZ: 1 }))
  const planar = await runFeel('2d-tap', inputs, initialEgg)
  const spatial = await runFeel('3d-tap', inputs, initialEgg)
  assert.ok(Math.abs(planar.snapshot.position.z - initialEgg.position[2]) < 1e-9)
  assert.ok(Math.abs(planar.snapshot.rotation.x) < 1e-9)
  assert.ok(Math.abs(planar.snapshot.rotation.y) < 1e-9)
  assert.ok(Math.abs(spatial.snapshot.position.z - initialEgg.position[2]) > 1e-6)
  assert.ok(Math.abs(spatial.snapshot.rotation.x) > 1e-6 || Math.abs(spatial.snapshot.rotation.y) > 1e-6)
})

test('hold release produces distinct short and long real jump apexes', async () => {
  const scenario = physicsLabScenario('jump-base')
  async function apex(inputs) {
    const simulation = await createSimulation({ preset: PHYSICS_V1, feel: FEEL_PRESETS['3d-hold'], level: scenario.level, initialEgg: scenario.initialEgg })
    try {
      simulation.step(NEUTRAL)
      const start = simulation.snapshot()
      assert.equal(start.physics.grounded, true)
      let maxY = start.position.y
      let jumped = false
      for (const input of inputs) {
        simulation.step(input)
        const snapshot = simulation.snapshot()
        maxY = Math.max(maxY, snapshot.position.y)
        jumped ||= snapshot.feel.lastJumpTick >= 0
      }
      assert.equal(jumped, true)
      return maxY - start.position.y
    } finally { simulation.free() }
  }
  const short = await apex([{ ...NEUTRAL, jumpDown: true, jumpUp: true }, ...Array.from({ length: 180 }, () => NEUTRAL)])
  const long = await apex([{ ...NEUTRAL, jumpDown: true }, ...Array.from({ length: 29 }, () => NEUTRAL), { ...NEUTRAL, jumpUp: true }, ...Array.from({ length: 180 }, () => NEUTRAL)])
  assert.ok(long > short + 0.05, `short=${short} long=${long}`)
})

test('hold cancellation does not launch or leave a held charge', async () => {
  const scenario = physicsLabScenario('jump-base')
  const simulation = await createSimulation({ preset: PHYSICS_V1, feel: FEEL_PRESETS['3d-hold'], level: scenario.level, initialEgg: scenario.initialEgg })
  try {
    simulation.step({ ...NEUTRAL, jumpDown: true })
    for (let i = 0; i < 10; i += 1) simulation.step(NEUTRAL)
    simulation.step({ ...NEUTRAL, jumpCancel: true })
    const after = simulation.snapshot()
    for (let i = 0; i < 8; i += 1) simulation.step(NEUTRAL)
    assert.equal(simulation.snapshot().physics.grounded, true)
    assert.ok(Math.abs(after.linearVelocity.y) < 0.25)
  } finally { simulation.free() }
})
