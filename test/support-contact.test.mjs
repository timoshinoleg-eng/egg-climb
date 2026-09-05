import assert from 'node:assert/strict'
import test from 'node:test'
import { initPhysics, RAPIER } from '../dist/sim/rapier.js'
import { findSupportContact, PHYSICS_V1, createEggColliderVertices, createEggColliderIndices, createSimulation, physicsLabScenario } from '../dist/sim/index.js'

const neutral = { moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false }
test('real Rapier manifolds support either egg collider side and reject a wall', async () => {
  await initPhysics()
  const seen = new Set()
  for (const eggFirst of [false, true]) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    let egg, collider
    const addEgg = () => { egg = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,0.61,0)); collider = world.createCollider(RAPIER.ColliderDesc.convexMesh(createEggColliderVertices(), createEggColliderIndices()), egg) }
    const addFloor = () => world.createCollider(RAPIER.ColliderDesc.cuboid(4,0.25,4).setTranslation(0,-0.25,0))
    try {
      if (eggFirst) addEgg()
      addFloor()
      if (!eggFirst) addEgg()
      world.step()
      world.contactPairsWith(collider, other => world.contactPair(collider, other, (_, flipped) => seen.add(flipped)))
      const contact = findSupportContact(world, collider, egg, PHYSICS_V1)
      assert.ok(contact)
      assert.ok(contact.contactT < 0.1)
      assert.ok(contact.normal.y > 0.9)
    } finally { world.free() }
  }
  assert.deepEqual([...seen].sort(), [false, true])
})

test('corner support is independent of floor/wall pair order', async () => {
  const scenario = physicsLabScenario('corner-multiple-contact')
  const snapshots = []
  for (const level of [scenario.level, [...scenario.level].reverse()]) {
    const sim = await createSimulation({ level, initialEgg: scenario.initialEgg })
    try { sim.step(neutral); snapshots.push(sim.snapshot()) } finally { sim.free() }
  }
  for (const s of snapshots) { assert.equal(s.physics.grounded, true); assert.ok(s.physics.supportNormal.y > 0.9); assert.ok(s.physics.contactT < 0.2) }
})

test('caller mutation cannot alter future ticks or host reset settings', async () => {
  const { LocalSimulationHost } = await import('../dist/host/index.js')
  const preset = { ...PHYSICS_V1, jump: { ...PHYSICS_V1.jump } }
  const host = new LocalSimulationHost({ preset })
  const control = new LocalSimulationHost()
  try {
    await host.init(); await control.init()
    preset.jump.tipImpulse = 999
    await host.reset()
    for (let t = 0; t < 60; t++) { const input = { ...neutral, jumpDown: t === 30 }; await host.advance([input]); await control.advance([input]) }
    assert.equal(await host.fingerprint(), await control.fingerprint())
  } finally { await host.free(); await control.free() }
})

test('cached post-jump manifold cannot grant a second impulse in the air', async () => {
  const scene = physicsLabScenario('jump-tip')
  const sim = await createSimulation({ level: scene.level, initialEgg: scene.initialEgg })
  try {
    sim.step(neutral)
    sim.step({ ...neutral, jumpDown: true })
    const first = sim.snapshot()
    assert.equal(first.physics.grounded, false)
    sim.step({ ...neutral, jumpDown: true })
    assert.ok(sim.snapshot().linearVelocity.y < first.linearVelocity.y)
  } finally { sim.free() }
})

test('multiple real supporting pairs choose deepest eligible contact deterministically', async () => {
  await initPhysics()
  for (const heights of [[-0.25, -0.255], [-0.255, -0.25]]) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    try {
      for (const y of heights) world.createCollider(RAPIER.ColliderDesc.cuboid(4,0.25,4).setTranslation(0,y,0))
      const egg = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,0.61,0))
      const collider = world.createCollider(RAPIER.ColliderDesc.convexMesh(createEggColliderVertices(), createEggColliderIndices()), egg)
      world.step()
      const depths = []
      world.contactPairsWith(collider, other => world.contactPair(collider, other, manifold => {
        for (let i = 0; i < manifold.numContacts(); i++) depths.push(manifold.contactDist(i))
      }))
      assert.ok(depths.length >= 2)
      const support = findSupportContact(world, collider, egg, PHYSICS_V1)
      assert.ok(support)
      assert.equal(support.distance, Math.min(...depths))
      assert.ok(support.contactT < 0.1)
    } finally { world.free() }
  }
})

test('tick-zero torque is applied with initialized explicit inertia', async () => {
  const sim = await createSimulation()
  try {
    sim.step({ ...neutral, moveX: 1 })
    assert.ok(sim.snapshot().angularVelocity.z < -0.1)
  } finally { sim.free() }
})
