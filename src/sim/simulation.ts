import { FOUNDATION_TORQUE_IMPULSE, PHYSICS_DT } from './config.js'
import type { SimulationSnapshot, TickInput } from './contracts.js'
import { fingerprintBytes } from './hash.js'
import { FOUNDATION_LEVEL } from './level.js'
import { initPhysics, RAPIER } from './rapier.js'

export interface Simulation {
  readonly tick: number
  step(input: TickInput): void
  snapshot(): SimulationSnapshot
  takePhysicsSnapshot(): Uint8Array
  fingerprint(): string
  free(): void
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-1, Math.min(1, value))
}

export async function createSimulation(): Promise<Simulation> {
  await initPhysics()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = PHYSICS_DT

  for (const box of FOUNDATION_LEVEL) {
    const [x, y, z] = box.center
    const [hx, hy, hz] = box.halfExtents
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(box.friction), body)
  }

  // PR-A fixture only. Correct egg collider/contact/COM belongs to the Physics Lab PR.
  const egg = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.2, 0).setLinearDamping(0.2).setAngularDamping(0.25).setCcdEnabled(true),
  )
  world.createCollider(RAPIER.ColliderDesc.ball(0.5).setMass(1.1).setFriction(1).setRestitution(0.04), egg)

  let tick = 0
  return {
    get tick() { return tick },
    step(input) {
      const moveX = clampAxis(input.moveX)
      const moveZ = clampAxis(input.moveZ)
      if (moveX !== 0 || moveZ !== 0) {
        egg.applyTorqueImpulse({ x: moveZ * FOUNDATION_TORQUE_IMPULSE, y: 0, z: -moveX * FOUNDATION_TORQUE_IMPULSE }, true)
      }
      world.step()
      tick += 1
    },
    snapshot() {
      const p = egg.translation(); const r = egg.rotation(); const lv = egg.linvel(); const av = egg.angvel()
      return {
        tick,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
        linearVelocity: { x: lv.x, y: lv.y, z: lv.z },
        angularVelocity: { x: av.x, y: av.y, z: av.z },
      }
    },
    takePhysicsSnapshot() { return world.takeSnapshot() },
    fingerprint() { return fingerprintBytes(world.takeSnapshot()) },
    free() { world.free() },
  }
}
