import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, RapierRigidBody, RigidBody, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useInput } from '../input/useInput'
import { useGame } from '../store/useGame'
import { getJumpProfile, getTipAlignment } from './eggPhysics'

const START = { x: 0, y: 1.2, z: 0 }
const cameraTarget = new THREE.Vector3()
const desiredCameraPosition = new THREE.Vector3()

function eggScaleAt(normalizedY: number) {
  return 1 - 0.2 * normalizedY - 0.08 * normalizedY * normalizedY
}

function createEggGeometry() {
  const geometry = new THREE.SphereGeometry(0.5, 24, 18)
  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    const normalizedY = y / 0.5
    const width = eggScaleAt(normalizedY)
    positions.setXYZ(i, x * width, y * 1.28, z * width)
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function createColliderPoints() {
  const points: number[] = []
  const latSegments = 8
  const lonSegments = 12
  for (let lat = 0; lat <= latSegments; lat += 1) {
    const theta = (lat / latSegments) * Math.PI
    const y = Math.cos(theta) * 0.5
    const ring = Math.sin(theta) * 0.5
    const width = eggScaleAt(y / 0.5)
    for (let lon = 0; lon < lonSegments; lon += 1) {
      const phi = (lon / lonSegments) * Math.PI * 2
      points.push(Math.cos(phi) * ring * width, y * 1.28, Math.sin(phi) * ring * width)
    }
  }
  return new Float32Array(points)
}

export function Egg() {
  const body = useRef<RapierRigidBody>(null)
  const geometry = useMemo(createEggGeometry, [])
  const colliderPoints = useMemo(createColliderPoints, [])
  const { world, rapier } = useRapier()
  const runId = useGame((state) => state.runId)
  const start = useGame((state) => state.start)
  const restart = useGame((state) => state.restart)
  const updateHeight = useGame((state) => state.updateHeight)
  const setJumpQuality = useGame((state) => state.setJumpQuality)
  const jumpNonce = useInput((state) => state.jumpNonce)
  const lastJumpNonce = useRef(jumpNonce)
  const grounded = useRef(false)

  useEffect(() => {
    if (!body.current) return
    body.current.setTranslation(START, true)
    body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  }, [runId])

  useFrame((state, dt) => {
    const rigidBody = body.current
    if (!rigidBody) return

    const input = useInput.getState()
    const position = rigidBody.translation()
    const rotation = rigidBody.rotation()

    const ray = new rapier.Ray(
      { x: position.x, y: position.y, z: position.z },
      { x: 0, y: -1, z: 0 },
    )
    const hit = world.castRay(ray, 0.78, true, undefined, undefined, undefined, rigidBody)
    grounded.current = hit !== null

    const moveMagnitude = Math.hypot(input.x, input.y)
    if (moveMagnitude > 0.02) {
      start()
      const step = Math.min(dt, 0.05)
      rigidBody.applyTorqueImpulse(
        { x: input.y * 1.45 * step, y: 0, z: -input.x * 1.45 * step },
        true,
      )
      rigidBody.applyImpulse(
        { x: input.x * 0.12 * step, y: 0, z: -input.y * 0.12 * step },
        true,
      )
    }

    if (jumpNonce !== lastJumpNonce.current) {
      lastJumpNonce.current = jumpNonce
      if (grounded.current) {
        start()
        const alignment = getTipAlignment(rotation)
        const profile = getJumpProfile(alignment)
        setJumpQuality(profile.quality)
        rigidBody.applyImpulse(
          { x: input.x * profile.assist, y: profile.impulse, z: -input.y * profile.assist },
          true,
        )
      }
    }

    updateHeight(Math.max(0, position.y - START.y))
    if (position.y < -4) restart()

    desiredCameraPosition.set(position.x, position.y + 2.2, position.z + 6.2)
    cameraTarget.set(position.x, position.y + 0.3, position.z)
    state.camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-5 * dt))
    state.camera.lookAt(cameraTarget)
  })

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={[START.x, START.y, START.z]}
      mass={1.1}
      linearDamping={0.35}
      angularDamping={0.3}
      canSleep={false}
      ccd
    >
      <ConvexHullCollider args={[colliderPoints]} friction={1.1} restitution={0.06} />
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#f6efe0" roughness={0.72} />
      </mesh>
      <mesh position={[-0.12, 0.15, 0.47]}>
        <sphereGeometry args={[0.045, 12, 8]} />
        <meshStandardMaterial color="#232323" />
      </mesh>
      <mesh position={[0.12, 0.15, 0.47]}>
        <sphereGeometry args={[0.045, 12, 8]} />
        <meshStandardMaterial color="#232323" />
      </mesh>
    </RigidBody>
  )
}
