import * as THREE from 'three'
import { FixedTickInputScheduler } from '../dist/host/fixed-tick-scheduler.js'
import { WorkerSimulationHost } from '../dist/host/worker-client.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { FOUNDATION_LEVEL } from '../dist/sim/level.js'
import { interpolateSnapshots } from '../dist/render/interpolate.js'

const canvas = document.querySelector('#viewport')
const status = document.querySelector('#status')
const telemetry = document.querySelector('#telemetry')
const unsupported = document.querySelector('#unsupported')

const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' })
if (!context) {
  unsupported.hidden = false
  status.textContent = 'WebGL2 unavailable'
  throw new Error('WebGL2 is required for the debug renderer')
}

const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
renderer.setClearColor(0x0b1120, 1)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x0b1120, 12, 30)
const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 100)
camera.position.set(0, 3.5, 8)

scene.add(new THREE.HemisphereLight(0xffffff, 0x1f2937, 1.2))
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
keyLight.position.set(5, 10, 7)
scene.add(keyLight)
scene.add(new THREE.GridHelper(12, 24, 0x475569, 0x1f2937))
scene.add(new THREE.AxesHelper(1.5))

const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, metalness: 0 })
for (const box of FOUNDATION_LEVEL) {
  const [hx, hy, hz] = box.halfExtents
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), platformMaterial)
  mesh.position.set(...box.center)
  scene.add(mesh)
}

const bodyGroup = new THREE.Group()
const bodyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xfff1cf, roughness: 0.55, metalness: 0 }),
)
bodyGroup.add(bodyMesh)
const tipMarker = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.8, 0xf59e0b, 0.18, 0.1)
bodyGroup.add(tipMarker)
scene.add(bodyGroup)

const pressed = new Set()
window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
  pressed.add(event.code)
})
window.addEventListener('keyup', (event) => pressed.delete(event.code))
window.addEventListener('blur', () => pressed.clear())

function sampleInput() {
  const right = pressed.has('ArrowRight') || pressed.has('KeyD') ? 1 : 0
  const left = pressed.has('ArrowLeft') || pressed.has('KeyA') ? 1 : 0
  const backward = pressed.has('ArrowDown') || pressed.has('KeyS') ? 1 : 0
  const forward = pressed.has('ArrowUp') || pressed.has('KeyW') ? 1 : 0
  return { ...NEUTRAL_INPUT, moveX: right - left, moveZ: backward - forward }
}

function resize() {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

const simulation = new WorkerSimulationHost(new URL('./sim-worker.js', import.meta.url))
let previous = await simulation.init()
let current = previous
const scheduler = new FixedTickInputScheduler()
let lastTime = performance.now()
let telemetryTimer = 0
let advancePending = false
let lastStepped = 0
let paused = document.hidden
status.textContent = 'running — physics worker is authoritative'

function dispatchNextBatch() {
  if (advancePending || scheduler.pendingCount === 0) return
  const inputs = scheduler.takeBatch()
  if (inputs.length === 0) return
  advancePending = true
  simulation.advance(inputs).then((result) => {
    previous = result.previous
    current = result.current
    lastStepped = result.stepped
  }).catch((error) => {
    status.textContent = `worker error: ${error instanceof Error ? error.message : String(error)}`
  }).finally(() => {
    advancePending = false
    dispatchNextBatch()
  })
}

function frame(now) {
  const frameDelta = (now - lastTime) / 1000
  lastTime = now
  if (!paused) {
    scheduler.sampleFrame(frameDelta, sampleInput)
    dispatchNextBatch()
  }

  const alpha = scheduler.alpha
  const transform = interpolateSnapshots(previous, current, alpha)
  bodyGroup.position.set(transform.position.x, transform.position.y, transform.position.z)
  bodyGroup.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)

  const follow = 1 - Math.exp(-7 * Math.min(Math.max(frameDelta, 0), 0.1))
  const desired = new THREE.Vector3(transform.position.x, transform.position.y + 2.8, transform.position.z + 7.2)
  camera.position.lerp(desired, follow)
  camera.lookAt(transform.position.x, transform.position.y + 0.3, transform.position.z)

  telemetryTimer += Math.min(Math.max(frameDelta, 0), 0.1)
  if (telemetryTimer >= 0.2) {
    telemetryTimer = 0
    telemetry.textContent = `tick ${current.tick} · α ${alpha.toFixed(2)} · worker steps ${lastStepped} · queued ${scheduler.pendingCount} · overload ${scheduler.overloadCount} · pos ${current.position.x.toFixed(2)}, ${current.position.y.toFixed(2)}, ${current.position.z.toFixed(2)}`
  }

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.addEventListener('visibilitychange', () => {
  paused = document.hidden
  if (paused) pressed.clear()
  scheduler.resetTiming()
  lastTime = performance.now()
})
window.addEventListener('pagehide', () => { void simulation.free() }, { once: true })
