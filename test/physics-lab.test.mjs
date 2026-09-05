import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EGG_COLLIDER_HASH,
  EGG_COLLIDER_IDENTITY,
  PHYSICS_PRESET_HASH,
  PHYSICS_V1,
  computeEggColliderHash,
  computePhysicsPresetHash,
  createSimulation,
  physicsLabScenario,
} from '../dist/sim/index.js'

const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })
const JUMP = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: true, jumpUp: false })

async function withScenario(id, fn, preset = PHYSICS_V1) {
  const scenario = physicsLabScenario(id)
  const simulation = await createSimulation({ preset, level: scenario.level, initialEgg: scenario.initialEgg })
  try { return await fn(simulation) } finally { simulation.free() }
}

async function settledContact(id, maxTicks = 12) {
  return withScenario(id, simulation => {
    let snapshot = simulation.snapshot()
    for (let i = 0; i < maxTicks && !snapshot.physics.grounded; i += 1) {
      simulation.step(NEUTRAL)
      snapshot = simulation.snapshot()
    }
    return snapshot
  })
}

async function jumpMetric(id, preset = PHYSICS_V1) {
  return withScenario(id, simulation => {
    simulation.step(NEUTRAL)
    const before = simulation.snapshot()
    assert.equal(before.physics.grounded, true, `${id} must begin with a support contact`)
    assert.notEqual(before.physics.contactT, null)
    const startY = before.position.y
    simulation.step(JUMP)
    let apex = simulation.snapshot().position.y
    for (let i = 0; i < 180; i += 1) {
      simulation.step(NEUTRAL)
      apex = Math.max(apex, simulation.snapshot().position.y)
    }
    return { contactT: before.physics.contactT, startY, apex, rise: apex - startY }
  }, preset)
}

function variant(id, centerOfMassY, baseImpulse, tipImpulse, worldUpWeight, contactNormalWeight) {
  return {
    ...PHYSICS_V1,
    id,
    egg: { ...PHYSICS_V1.egg, centerOfMassY },
    jump: { ...PHYSICS_V1.jump, baseImpulse, tipImpulse, worldUpWeight, contactNormalWeight },
  }
}

function localUpY(snapshot) {
  const { x, z } = snapshot.rotation
  return 1 - 2 * (x * x + z * z)
}

test('committed collider and physics preset identities match their canonical hashes', () => {
  assert.equal(EGG_COLLIDER_IDENTITY.id, 'egg-convex-v1')
  assert.equal(EGG_COLLIDER_IDENTITY.vertexCount, 62)
  assert.equal(EGG_COLLIDER_IDENTITY.triangleCount, 120)
  assert.equal(computeEggColliderHash(), EGG_COLLIDER_HASH)
  assert.equal(computePhysicsPresetHash(PHYSICS_V1), PHYSICS_PRESET_HASH)
})

test('support contact classification comes from egg-local manifold points', async () => {
  const base = await settledContact('broad-base-rest')
  const side = await settledContact('side-rest')
  const tip = await settledContact('tip-biased-contact')
  assert.equal(base.physics.grounded, true)
  assert.equal(side.physics.grounded, true)
  assert.equal(tip.physics.grounded, true)
  assert.ok(base.physics.contactT < 0.2, `base contactT=${base.physics.contactT}`)
  assert.ok(side.physics.contactT > 0.25 && side.physics.contactT < 0.75, `side contactT=${side.physics.contactT}`)
  assert.ok(tip.physics.contactT > 0.8, `tip contactT=${tip.physics.contactT}`)
  assert.ok(base.physics.contactT < side.physics.contactT)
  assert.ok(side.physics.contactT < tip.physics.contactT)
})

test('airborne and wall-only contacts do not create grounded support', async () => {
  const airborne = await withScenario('falling-airborne', simulation => {
    simulation.step(NEUTRAL)
    return simulation.snapshot()
  })
  const wall = await withScenario('wall-only-contact', simulation => {
    simulation.step(NEUTRAL)
    return simulation.snapshot()
  })
  assert.equal(airborne.physics.grounded, false)
  assert.equal(wall.physics.grounded, false)
})

test('slope, corner, landing and high-angular-impact fixtures stay physically meaningful', async () => {
  const slope = await withScenario('slope-contact', simulation => {
    let snapshot = simulation.snapshot()
    for (let i = 0; i < 120 && !snapshot.physics.grounded; i += 1) { simulation.step(NEUTRAL); snapshot = simulation.snapshot() }
    return snapshot
  })
  assert.equal(slope.physics.grounded, true)
  assert.ok(Math.abs(slope.physics.supportNormal.x) > 0.15)
  assert.ok(slope.physics.supportNormal.y > 0.7)

  const corner = await settledContact('corner-multiple-contact', 20)
  assert.equal(corner.physics.grounded, true)
  assert.ok(corner.physics.supportNormal.y > 0.45)

  const landing = await withScenario('landing', simulation => {
    let landed = false
    for (let i = 0; i < 180; i += 1) {
      simulation.step(NEUTRAL)
      if (simulation.snapshot().physics.grounded) { landed = true; break }
    }
    return landed
  })
  assert.equal(landing, true)

  await withScenario('high-angular-impact', simulation => {
    for (let i = 0; i < 180; i += 1) simulation.step(NEUTRAL)
    const snapshot = simulation.snapshot()
    for (const value of [snapshot.position.x, snapshot.position.y, snapshot.position.z, snapshot.linearVelocity.y, snapshot.angularVelocity.z]) assert.equal(Number.isFinite(value), true)
  })
})

test('physics-v1 produces actual trajectory ordering tip > side > base', async () => {
  const base = await jumpMetric('jump-base')
  const side = await jumpMetric('jump-side')
  const tip = await jumpMetric('jump-tip')
  console.log('[physics-v1-apex]', JSON.stringify({ base, side, tip }))
  assert.ok(side.rise > base.rise + 0.1, `base=${base.rise} side=${side.rise}`)
  assert.ok(tip.rise > side.rise + 0.15, `side=${side.rise} tip=${tip.rise}`)
})

test('broad-base 5-degree perturbation is stable while tip-biased perturbation falls away', async () => {
  async function runTilt(id, position, rotation) {
    const scenario = physicsLabScenario(id)
    const initialEgg = { ...scenario.initialEgg, position, rotation }
    const simulation = await createSimulation({ level: scenario.level, initialEgg })
    try {
      const initialUpY = localUpY(simulation.snapshot())
      let maxAngular = 0
      let snapshot = simulation.snapshot()
      for (let i = 0; i < 60; i += 1) {
        simulation.step(NEUTRAL)
        snapshot = simulation.snapshot()
        const av = snapshot.angularVelocity
        maxAngular = Math.max(maxAngular, Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z))
      }
      return { initialUpY, finalUpY: localUpY(snapshot), maxAngular }
    } finally {
      simulation.free()
    }
  }

  const base = await runTilt('broad-base-rest', [0, 0.64, 0], [0, 0, 0.0436193874, 0.9990482216])
  const tip = await runTilt('tip-biased-contact', [0, 0.82, 0], [0, 0, 0.9990482216, -0.0436193874])
  console.log('[physics-v1-stability]', JSON.stringify({ base, tip }))
  assert.ok(base.finalUpY > 0.9, `base final upY=${base.finalUpY}`)
  assert.ok(tip.finalUpY > -0.9, `tip final upY=${tip.finalUpY}`)
  assert.ok(tip.maxAngular > base.maxAngular * 1.25, `base=${base.maxAngular} tip=${tip.maxAngular}`)
})

test('small Physics Lab candidate matrix documents why physics-v1 is the balanced choice', async () => {
  const candidates = [
    variant('physics-lab-a', -0.08, 2.5, 4.8, 0.9, 0.1),
    PHYSICS_V1,
    variant('physics-lab-c', -0.16, 2.7, 5.6, 0.8, 0.2),
  ]
  const rows = []
  for (const preset of candidates) {
    const base = await jumpMetric('jump-base', preset)
    const side = await jumpMetric('jump-side', preset)
    const tip = await jumpMetric('jump-tip', preset)
    assert.ok(base.rise < side.rise && side.rise < tip.rise, preset.id)
    rows.push({ id: preset.id, centerOfMassY: preset.egg.centerOfMassY, baseRise: base.rise, sideRise: side.rise, tipRise: tip.rise, worldUpWeight: preset.jump.worldUpWeight })
  }
  console.log('[physics-lab-matrix]', JSON.stringify(rows))
  assert.equal(rows[1].id, 'physics-v1')
  assert.ok(rows[1].tipRise / rows[1].baseRise > 2)
})

test('repeated Physics Lab runs produce the same final fingerprint', async () => {
  async function run() {
    return withScenario('high-angular-impact', simulation => {
      for (let i = 0; i < 240; i += 1) simulation.step(i === 30 ? JUMP : NEUTRAL)
      return simulation.fingerprint()
    })
  }
  assert.equal(await run(), await run())
})
