import assert from 'node:assert/strict'
import test from 'node:test'
import RAPIER from '@dimforge/rapier3d-deterministic-compat'
import {
  EGG_COLLIDER_INDEX_DATA,
  EGG_COLLIDER_VERTEX_DATA,
  PHYSICS_V1,
  createEggColliderIndices,
  createEggColliderVertices,
  createSimulation,
  physicsLabScenario,
} from '../dist/sim/index.js'

const EPSILON = 1e-5

function vertex(index) {
  const offset = index * 3
  return EGG_COLLIDER_VERTEX_DATA.slice(offset, offset + 3)
}

function edgeKey(a, b) {
  return `${a}:${b}`
}

function undirectedEdgeKey(a, b) {
  return a < b ? edgeKey(a, b) : edgeKey(b, a)
}

function cross(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

test('pre-baked egg mesh is closed, coherently wound, and convex', () => {
  assert.equal(EGG_COLLIDER_VERTEX_DATA.length % 3, 0)
  assert.equal(EGG_COLLIDER_INDEX_DATA.length % 3, 0)
  const vertexCount = EGG_COLLIDER_VERTEX_DATA.length / 3
  const undirected = new Map()
  const directed = new Map()

  for (let offset = 0; offset < EGG_COLLIDER_INDEX_DATA.length; offset += 3) {
    const [a, b, c] = EGG_COLLIDER_INDEX_DATA.slice(offset, offset + 3)
    assert.ok(a >= 0 && a < vertexCount)
    assert.ok(b >= 0 && b < vertexCount)
    assert.ok(c >= 0 && c < vertexCount)
    assert.notEqual(a, b)
    assert.notEqual(b, c)
    assert.notEqual(c, a)
    const normal = cross(vertex(a), vertex(b), vertex(c))
    assert.ok(dot(normal, normal) > EPSILON, `degenerate triangle at ${offset / 3}`)

    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = undirectedEdgeKey(from, to)
      undirected.set(key, (undirected.get(key) ?? 0) + 1)
      const directedKey = edgeKey(from, to)
      directed.set(directedKey, (directed.get(directedKey) ?? 0) + 1)
    }

    // Every supporting plane must leave all vertices on its inner side.
    const origin = vertex(a)
    const distances = []
    for (let index = 0; index < vertexCount; index += 1) {
      distances.push(dot(normal, [
        vertex(index)[0] - origin[0],
        vertex(index)[1] - origin[1],
        vertex(index)[2] - origin[2],
      ]))
    }
    const maxDistance = Math.max(...distances)
    const minDistance = Math.min(...distances)
    assert.ok(maxDistance <= EPSILON || minDistance >= -EPSILON, `non-convex face at ${offset / 3}`)
  }

  for (const count of undirected.values()) assert.equal(count, 2)
  for (const [key, count] of directed) {
    const [from, to] = key.split(':').map(Number)
    assert.equal(count, 1)
    assert.equal(directed.get(edgeKey(to, from)), 1, `edge winding is not coherent: ${key}`)
  }
})

test('Rapier accepts the committed hull and explicit mass properties are independent of density', async () => {
  await RAPIER.init()
  const hull = RAPIER.ColliderDesc.convexMesh(createEggColliderVertices(), createEggColliderIndices())
  assert.ok(hull, 'convex hull must be accepted by Rapier')
  const scenario = physicsLabScenario('broad-base-rest')
  const simulation = await createSimulation({ preset: PHYSICS_V1, level: scenario.level, initialEgg: scenario.initialEgg })
  try {
    simulation.step({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })
    const world = RAPIER.World.restoreSnapshot(simulation.takePhysicsSnapshot())
    const body = world.bodies.getAll().find(candidate => candidate.isDynamic())
    assert.ok(body, 'snapshot must contain the dynamic egg body')
    const collider = world.colliders.getAll().find(candidate => candidate.parent()?.handle === body.handle)
    assert.ok(collider, 'snapshot must contain the egg collider')
    assert.equal(collider.density(), 0)
    assert.ok(Math.abs(body.mass() - PHYSICS_V1.egg.mass) < 1e-6)
    assert.ok(Math.abs(body.invMass() - 1 / PHYSICS_V1.egg.mass) < 1e-6)
    assert.ok(Math.abs(body.localCom().y - PHYSICS_V1.egg.centerOfMassY) < 1e-6)
    const inertia = body.principalInertia()
    assert.ok(Math.abs(inertia.x - PHYSICS_V1.egg.principalInertia[0]) < 1e-6)
    assert.ok(Math.abs(inertia.y - PHYSICS_V1.egg.principalInertia[1]) < 1e-6)
    assert.ok(Math.abs(inertia.z - PHYSICS_V1.egg.principalInertia[2]) < 1e-6)
    world.free()
  } finally {
    simulation.free()
  }
})
