import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Egg } from './game/Egg'
import { Level } from './game/Level'
import { TouchControls } from './input/TouchControls'
import { useGame } from './store/useGame'

function Hud() {
  const phase = useGame((state) => state.phase)
  const height = useGame((state) => state.height)
  const bestHeight = useGame((state) => state.bestHeight)
  const jumpQuality = useGame((state) => state.jumpQuality)
  const restart = useGame((state) => state.restart)

  return (
    <div className="hud">
      <div className="stats-panel">
        <strong>{height.toFixed(1)} m</strong>
        <span>best {bestHeight.toFixed(1)} m</span>
        <span className={`quality quality-${jumpQuality.toLowerCase()}`}>{jumpQuality}</span>
      </div>
      {phase === 'ready' && (
        <div className="message-card">
          <strong>ROLL. AIM. JUMP.</strong>
          <span>The sharper the egg points upward, the higher it jumps.</span>
        </div>
      )}
      {phase === 'won' && (
        <div className="message-card victory">
          <strong>TOP REACHED</strong>
          <button type="button" onClick={restart}>Run again</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <main className="app-shell">
      <Canvas shadows camera={{ position: [0, 3.2, 6.2], fov: 46 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#111827']} />
        <fog attach="fog" args={['#111827', 13, 28]} />
        <ambientLight intensity={1.25} />
        <directionalLight
          castShadow
          intensity={2.3}
          position={[4, 10, 6]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <Level />
          <Egg />
        </Physics>
      </Canvas>
      <Hud />
      <TouchControls />
    </main>
  )
}
