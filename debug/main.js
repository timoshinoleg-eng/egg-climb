import * as THREE from 'three'
import { FixedTickInputScheduler } from '../dist/host/fixed-tick-scheduler.js'
import { WorkerSimulationHost } from '../dist/host/worker-client.js'
import { EGG_COLLIDER_INDEX_DATA, EGG_COLLIDER_VERTEX_DATA } from '../dist/sim/egg-collider.js'
import { PHYSICS_LAB_PRESETS, PHYSICS_V1 } from '../dist/sim/physics-presets.js'
import { physicsLabScenario } from '../dist/sim/physics-lab-fixtures.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { FOUNDATION_LEVEL } from '../dist/sim/level.js'
import { interpolateSnapshots } from '../dist/render/interpolate.js'

const params = new URLSearchParams(location.search)
const scenario = params.has('scenario') ? physicsLabScenario(params.get('scenario')) : null
const canvas = document.querySelector('#viewport')
const status = document.querySelector('#status')
const telemetry = document.querySelector('#telemetry')
const unsupported = document.querySelector('#unsupported')
const query = new URL(window.location.href).searchParams
const physicsKey = query.get('physics') ?? 'physics-v1'
const scenarioKey = query.get('scenario') ?? 'default'
const expectedPreset = physicsKey === 'physics-v1' ? PHYSICS_V1 : PHYSICS_LAB_PRESETS[physicsKey]
if (!expectedPreset) throw new Error(`Unknown Physics Lab preset: ${physicsKey}`)

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
for (const box of scenario?.level ?? FOUNDATION_LEVEL) {
  const [hx, hy, hz] = box.halfExtents
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), platformMaterial)
  mesh.position.set(...box.center)
  if (box.rotation) mesh.quaternion.set(...box.rotation)
  scene.add(mesh)
}

const bodyGroup = new THREE.Group()
const eggGeometry = new THREE.BufferGeometry()
eggGeometry.setAttribute('position', new THREE.Float32BufferAttribute(EGG_COLLIDER_VERTEX_DATA, 3))
eggGeometry.setIndex(EGG_COLLIDER_INDEX_DATA)
eggGeometry.computeVertexNormals()
const bodyMesh = new THREE.Mesh(
  eggGeometry,
  new THREE.MeshStandardMaterial({ color: 0xfff1cf, roughness: 0.55, metalness: 0, flatShading: false }),
)
bodyGroup.add(bodyMesh)
const tipMarker = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.95, 0xf59e0b, 0.18, 0.1)
bodyGroup.add(tipMarker)
// Keep the COM marker outside the egg hierarchy and disable depth testing: its
// purpose is to expose the authoritative mass property even when it is inside
// the rendered hull.
const comMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false }),
)
comMarker.renderOrder = 10
scene.add(comMarker)
scene.add(bodyGroup)

const contactMarker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }))
contactMarker.visible = false
scene.add(contactMarker)
const supportNormalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.7, 0x22d3ee, 0.14, 0.08)
supportNormalArrow.visible = false
scene.add(supportNormalArrow)

const pressed = new Set()
let jumpHeld = false
let pendingJumpDown = false
let pendingJumpUp = false
window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
  if (event.code === 'Space') {
    if (!jumpHeld) { jumpHeld = true; pendingJumpDown = true }
    return
  }
  pressed.add(event.code)
})
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    if (jumpHeld) { jumpHeld = false; pendingJumpUp = true }
    return
  }
  pressed.delete(event.code)
})
window.addEventListener('blur', () => {
  pressed.clear()
  if (jumpHeld) pendingJumpUp = true
  jumpHeld = false
})

function sampleInput() {
  const right = pressed.has('ArrowRight') || pressed.has('KeyD') ? 1 : 0
  const left = pressed.has('ArrowLeft') || pressed.has('KeyA') ? 1 : 0
  const backward = pressed.has('ArrowDown') || pressed.has('KeyS') ? 1 : 0
  const forward = pressed.has('ArrowUp') || pressed.has('KeyW') ? 1 : 0
  const jumpDown = pendingJumpDown
  const jumpUp = pendingJumpUp
  pendingJumpDown = false
  pendingJumpUp = false
  return { ...NEUTRAL_INPUT, moveX: right - left, moveZ: backward - forward, jumpDown, jumpUp }
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

const workerUrl = new URL('./sim-worker.js', import.meta.url)
workerUrl.searchParams.set('physics', physicsKey)
if (scenarioKey !== 'default') workerUrl.searchParams.set('scenario', scenarioKey)
const simulation = new WorkerSimulationHost(workerUrl, expectedPreset)
let previous = await simulation.init()
let current = previous
const scheduler = new FixedTickInputScheduler()
let lastTime = performance.now()
let telemetryTimer = 0
let advancePending = false
let lastStepped = 0
let paused = document.hidden
status.textContent = `running — ${expectedPreset.id} · ${scenarioKey} · worker physics · arrows/WASD torque · Space jump`

let apex = current.position.y
let launchY = current.position.y
let wasGrounded = current.physics.grounded
const trail = []
const trailGeometry = new THREE.BufferGeometry()
scene.add(new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xa78bfa })))

function dispatchNextBatch() {
  if (advancePending || scheduler.pendingCount === 0) return
  const inputs = scheduler.takeBatch()
  if (inputs.length === 0) return
  advancePending = true
  simulation.advance(inputs).then((result) => {
    previous = result.previous
    current = result.current
    lastStepped = result.stepped
    if (wasGrounded && !current.physics.grounded) { launchY = previous.position.y; apex = current.position.y; trail.length = 0 }
    wasGrounded = current.physics.grounded
    apex = Math.max(apex, current.position.y)
    trail.push(new THREE.Vector3(current.position.x, current.position.y, current.position.z))
    if (trail.length > 240) trail.shift()
    trailGeometry.setFromPoints(trail)
  }).catch((error) => {
    status.textContent = `worker error: ${error instanceof Error ? error.message : String(error)}`
  }).finally(() => {
    advancePending = false
    dispatchNextBatch()
  })
}

function updateContactDebug() {
  const physics = current.physics
  if (!physics.grounded || !physics.supportContactWorld || !physics.supportNormal) {
    contactMarker.visible = false
    supportNormalArrow.visible = false
    return
  }
  const point = physics.supportContactWorld
  const normal = physics.supportNormal
  contactMarker.position.set(point.x, point.y, point.z)
  contactMarker.visible = true
  supportNormalArrow.position.set(point.x, point.y, point.z)
  supportNormalArrow.setDirection(new THREE.Vector3(normal.x, normal.y, normal.z).normalize())
  supportNormalArrow.visible = true
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
  comMarker.position.set(0, expectedPreset.egg.centerOfMassY, 0)
  comMarker.position.applyQuaternion(bodyGroup.quaternion).add(bodyGroup.position)
  updateContactDebug()

  const follow = 1 - Math.exp(-7 * Math.min(Math.max(frameDelta, 0), 0.1))
  const desired = new THREE.Vector3(transform.position.x, transform.position.y + 2.8, transform.position.z + 7.2)
  camera.position.lerp(desired, follow)
  camera.lookAt(transform.position.x, transform.position.y + 0.3, transform.position.z)

  telemetryTimer += Math.min(Math.max(frameDelta, 0), 0.1)
  if (telemetryTimer >= 0.2) {
    telemetryTimer = 0
    const p = current.physics
    const contactT = p.contactT === null ? '—' : p.contactT.toFixed(3)
    const strength = p.jumpStrength === null ? '—' : p.jumpStrength.toFixed(2)
    telemetry.textContent = `tick ${current.tick} · grounded ${p.grounded} · contactT ${contactT} · jump ${strength} · pos ${current.position.x.toFixed(2)}, ${current.position.y.toFixed(2)}, ${current.position.z.toFixed(2)} · vel ${current.linearVelocity.x.toFixed(2)}, ${current.linearVelocity.y.toFixed(2)}, ${current.linearVelocity.z.toFixed(2)} · COM Y ${expectedPreset.egg.centerOfMassY} · apex ${apex.toFixed(3)} / rise ${(apex - launchY).toFixed(3)} · quality ${p.contactT === null ? "AIR" : p.contactT > 0.85 ? "PERFECT" : p.contactT > 0.65 ? "GOOD" : p.contactT > 0.25 ? "SIDE" : "BASE"} · worker ${lastStepped} · queued ${scheduler.pendingCount}`
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
