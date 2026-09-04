import * as THREE from 'three'
import { FOUNDATION_LEVEL, NEUTRAL_INPUT, PHYSICS_DT, createSimulation } from '../dist/sim/index.js'
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

const simulation = await createSimulation()
let previous = simulation.snapshot()
let current = previous
let accumulator = 0
let lastTime = performance.now()
let telemetryTimer = 0
status.textContent = 'running — render is non-authoritative'

function frame(now) {
  const frameDelta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1)
  lastTime = now
  accumulator += frameDelta
  let steps = 0
  while (accumulator >= PHYSICS_DT && steps < 8) {
    previous = current
    simulation.step(sampleInput())
    current = simulation.snapshot()
    accumulator -= PHYSICS_DT
    steps += 1
  }

  const transform = interpolateSnapshots(previous, current, accumulator / PHYSICS_DT)
  bodyGroup.position.set(transform.position.x, transform.position.y, transform.position.z)
  bodyGroup.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)

  const follow = 1 - Math.exp(-7 * frameDelta)
  const desired = new THREE.Vector3(transform.position.x, transform.position.y + 2.8, transform.position.z + 7.2)
  camera.position.lerp(desired, follow)
  camera.lookAt(transform.position.x, transform.position.y + 0.3, transform.position.z)

  telemetryTimer += frameDelta
  if (telemetryTimer >= 0.2) {
    telemetryTimer = 0
    telemetry.textContent = `tick ${current.tick} · α ${(accumulator / PHYSICS_DT).toFixed(2)} · steps ${steps} · pos ${current.position.x.toFixed(2)}, ${current.position.y.toFixed(2)}, ${current.position.z.toFixed(2)}`
  }

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.addEventListener('pagehide', () => simulation.free(), { once: true })
