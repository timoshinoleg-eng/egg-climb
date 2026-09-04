import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useGame } from '../store/useGame'

const platforms: Array<[number, number, number, number, number, number]> = [
  [0, 0, 0, 4.2, 0.4, 4.2],
  [-1.5, 1.5, -0.6, 2.4, 0.35, 2.1],
  [1.2, 2.8, -0.2, 2.0, 0.32, 1.8],
  [0.1, 4.1, -1.5, 1.7, 0.3, 1.6],
  [-1.5, 5.45, -1.1, 1.5, 0.3, 1.5],
  [1.0, 6.8, -0.4, 1.4, 0.3, 1.4],
  [1.7, 8.15, -1.8, 1.3, 0.3, 1.3],
  [-0.3, 9.55, -1.4, 1.35, 0.3, 1.35],
  [-1.6, 10.95, -0.1, 1.25, 0.3, 1.25],
  [0.5, 12.4, 0.2, 1.2, 0.3, 1.2],
  [0, 15.2, -0.3, 3.4, 0.35, 3.4],
]

function StaticPlatform({ data, index }: { data: (typeof platforms)[number]; index: number }) {
  const [x, y, z, sx, sy, sz] = data
  return (
    <RigidBody type="fixed" colliders={false} position={[x, y, z]}>
      <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} friction={1.15} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial color={index === platforms.length - 1 ? '#d4af37' : index % 2 ? '#576574' : '#485460'} />
      </mesh>
    </RigidBody>
  )
}

function MovingPlatform() {
  const ref = useRef<RapierRigidBody>(null)
  useFrame(({ clock }) => {
    const body = ref.current
    if (!body) return
    body.setNextKinematicTranslation({
      x: Math.sin(clock.elapsedTime * 0.85) * 1.35,
      y: 13.85,
      z: -1.0,
    })
  })

  return (
    <RigidBody ref={ref} type="kinematicPosition" colliders={false} position={[0, 13.85, -1]}>
      <CuboidCollider args={[0.75, 0.16, 0.75]} friction={1.2} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.32, 1.5]} />
        <meshStandardMaterial color="#10ac84" />
      </mesh>
    </RigidBody>
  )
}

function FinishSensor() {
  const win = useGame((state) => state.win)
  return (
    <RigidBody type="fixed" colliders={false} position={[0, 15.9, -0.3]}>
      <CuboidCollider args={[1.4, 0.35, 1.4]} sensor onIntersectionEnter={win} />
      <mesh position={[0, 0.45, 0]}>
        <torusGeometry args={[0.55, 0.08, 12, 32]} />
        <meshStandardMaterial color="#ffdd59" emissive="#7d6500" emissiveIntensity={0.4} />
      </mesh>
    </RigidBody>
  )
}

export function Level() {
  return (
    <>
      {platforms.map((platform, index) => (
        <StaticPlatform key={`${platform[1]}-${index}`} data={platform} index={index} />
      ))}
      <MovingPlatform />
      <FinishSensor />
    </>
  )
}
