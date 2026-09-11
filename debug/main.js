import { SafeStorage } from '../dist/game/storage.js'
import { InputState } from '../dist/game/input-state.js'
import { bindGameInput } from '../dist/game/browser-input.js'
import { installMaxPlaytest, showMaxExport } from './max-playtest.js'
import * as THREE from 'three'
import { FixedTickInputScheduler } from '../dist/host/fixed-tick-scheduler.js'
import { WorkerSimulationHost } from '../dist/host/worker-client.js'
import { EGG_COLLIDER_INDEX_DATA, EGG_COLLIDER_VERTEX_DATA } from '../dist/sim/egg-collider.js'
import { PHYSICS_LAB_PRESETS, PHYSICS_V1 } from '../dist/sim/physics-presets.js'
import { FEEL_PRESETS, DEFAULT_FEEL } from '../dist/sim/feel-presets.js'
import { physicsLabScenario } from '../dist/sim/physics-lab-fixtures.js'
import { FOUNDATION_LEVEL } from '../dist/sim/level.js'
import { interpolateSnapshots } from '../dist/render/interpolate.js'

const canvas = document.querySelector('#viewport')
const status = document.querySelector('#status')
const telemetry = document.querySelector('#telemetry')
const feelReadout = document.querySelector('#feelReadout')
const chargeMeter = document.querySelector('#chargeMeter i')
const feelSelect = document.querySelector('#feelSelect')
const scenarioSelect = document.querySelector('#scenarioSelect')
const visualSelect = document.querySelector('#visualSelect')
const attemptCard = document.querySelector('#attemptCard')
const actionStatus = document.querySelector('#actionStatus')
const unsupported = document.querySelector('#unsupported')
const query = new URL(window.location.href).searchParams
const physicsKey = query.get('physics') ?? 'physics-v1'
const scenarioKey = query.get('scenario') ?? 'jump-base'
const scenario = physicsLabScenario(scenarioKey)
const feelKey = query.get('feel') ?? '3d-tap'
const visualKey = query.get('visual') === 'feedback' ? 'feedback' : 'plain'
const expectedPreset = physicsKey === 'physics-v1' ? PHYSICS_V1 : PHYSICS_LAB_PRESETS[physicsKey]
if (!expectedPreset) throw new Error(`Unknown Physics Lab preset: ${physicsKey}`)
const expectedFeel = FEEL_PRESETS[feelKey] ?? DEFAULT_FEEL

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
for (const box of scenario?.level ?? FOUNDATION_LEVEL.definition.staticBoxes) {
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

const contactMarker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false }))
contactMarker.visible = false
contactMarker.renderOrder = 11
scene.add(contactMarker)
const supportNormalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.7, 0x22d3ee, 0.14, 0.08)
supportNormalArrow.visible = false
for (const part of [supportNormalArrow.line, supportNormalArrow.cone]) {
  part.material.depthTest = false
  part.material.depthWrite = false
  part.renderOrder = 11
}
scene.add(supportNormalArrow)

const inputState = new InputState()
function sampleInput() {
  const input = inputState.sample(expectedFeel.dimensionMode !== '3d')
  session.samples.push({ tick: nextSampleTick++, ...input })
  return input
}

function installPointerControls() {
  const controls = [
    ['←', 'left'], ['→', 'right'], ...(expectedFeel.dimensionMode === '3d' ? [['↑', 'forward'], ['↓', 'backward']] : []),
  ]
  controls.forEach(([label, action], index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pointer-control'
    button.dataset.gameAction = action
    button.textContent = label
    button.style.cssText = `position:fixed;left:${16 + index * 48}px;bottom:18px;z-index:2;opacity:.78;padding:10px 14px;`
    document.body.append(button)
  })
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'pointer-control'
  button.dataset.gameAction = 'jump'
  button.textContent = 'JUMP'
  button.style.cssText = 'position:fixed;right:20px;bottom:18px;z-index:2;opacity:.85;padding:14px 18px;'
  document.body.append(button)
}
installPointerControls()
installMaxPlaytest()

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
workerUrl.searchParams.set('feel', feelKey)
if (scenarioKey !== 'default') workerUrl.searchParams.set('scenario', scenarioKey)
const simulation = new WorkerSimulationHost(workerUrl, expectedPreset, expectedFeel)
let previous = await simulation.init()
let current = previous
const scheduler = new FixedTickInputScheduler()
const historyKey = 'egg-climb-game-feel-history-v1'
const storage = new SafeStorage()
const readHistory = () => storage.read(historyKey, [], Array.isArray, 4_194_304).slice(-24)
const requestedOrder = Number(query.get('order') ?? 0)
const sessionOrder = Number.isInteger(requestedOrder) && requestedOrder >= 0 && requestedOrder < 8 ? requestedOrder : 0
const plannedFeelOrder = Object.keys(FEEL_PRESETS)
const balancedFeelOrder = [0, 1, 7, 2, 6, 3, 5, 4].map(index => plannedFeelOrder[(index + sessionOrder) % Math.max(1, plannedFeelOrder.length)]).filter(Boolean)
const session = { schema: 'egg-climb-playtest-v1', startedAt: new Date().toISOString(), config: { feel: feelKey, visual: visualKey, physics: physicsKey, scenario: scenarioKey, feelPreset: expectedFeel, plannedOrder: balancedFeelOrder, orderRow: sessionOrder }, samples: [], attempts: [], ratings: [], batchSampledTelemetry: true }
let nextSampleTick = 0
let attempt = { index: session.attempts.length + 1, launchTick: null, apexTick: null, landingTick: null, apexY: current.position.y }
let activeJumpTick = null
let lastObservedJumpTick = -1
let exportBusy = false
feelReadout.textContent = `${feelKey} · ${expectedFeel.dimensionMode} · ${expectedFeel.controlMode} · visual ${visualKey}`
attemptCard.textContent = `Attempt 1/3 · ${scenarioKey}`
for (const key of Object.keys(FEEL_PRESETS)) { const option = document.createElement('option'); option.value = key; option.textContent = key; feelSelect.append(option) }
feelSelect.value = feelKey; visualSelect.value = visualKey; scenarioSelect.value = scenarioKey
const reloadWith = changes => { const next = new URL(location.href); Object.entries(changes).forEach(([key, value]) => next.searchParams.set(key, value)); location.href = next.toString() }
const archiveAndReload = async changes => { if (exportBusy) return; try { const record = await finalizeCurrentRun(); if (!record) return; appendHistory(record); reloadWith(changes) } catch { actionStatus.textContent = 'Worker unavailable; reload to retry.' } }
feelSelect.addEventListener('change', () => archiveAndReload({ feel: feelSelect.value }))
scenarioSelect.addEventListener('change', () => archiveAndReload({ scenario: scenarioSelect.value }))
visualSelect.addEventListener('change', () => archiveAndReload({ visual: visualSelect.value }))
document.querySelector('#resetButton').addEventListener('click', () => workerFailure ? reloadWith({}) : archiveAndReload({}))
document.querySelector('#saveRating').addEventListener('click', () => { const values = ['clarity', 'control', 'fun'].map(key => Number(document.querySelector(`#${key}Rating`).value)); if (!values.every(value => Number.isInteger(value) && value >= 1 && value <= 5)) { actionStatus.textContent = 'Ratings must be integers 1–5'; return } session.ratings.push({ attempt: attempt.index, clarity: values[0], control: values[1], fun: values[2], notes: document.querySelector('#notes').value, tick: current.tick }); actionStatus.textContent = `Rating saved · attempt ${attempt.index}` })
document.querySelector('#exportButton').addEventListener('click', async () => {
  if (exportBusy) return
  actionStatus.textContent = 'Finishing queued ticks…'
  try {
    const payload = await finalizeCurrentRun()
    if (!payload) return
    payload.history = readHistory()
    if (showMaxExport(payload)) { actionStatus.textContent = `Exported through tick ${payload.finishTick}`; return }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `egg-playtest-${feelKey}-${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href)
    actionStatus.textContent = `Exported through tick ${payload.finishTick}`
  } catch (error) { actionStatus.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}` }
  finally { exportBusy = false }
})
let lastTime = performance.now()
let telemetryTimer = 0
let advancePending = false
let advanceTask = Promise.resolve()
let workerFailure = null
let disposed = false
let rafId = 0
let pulseUntil = 0
let lastStepped = 0
let paused = document.hidden
function appendHistory(record) {
  const history = readHistory()
  history.push(record)
  if (!storage.write(historyKey, history.slice(-24))) actionStatus.textContent = 'Storage unavailable; this session can still be exported.'
}
async function finalizeCurrentRun() {
  if (exportBusy) return null
  exportBusy = true
  try {
    while (scheduler.pendingCount > 0 || advancePending) {
      if (workerFailure || disposed) throw workerFailure ?? new Error('Playtest closed')
      dispatchNextBatch()
      await advanceTask
    }
    if (workerFailure || disposed) throw workerFailure ?? new Error('Playtest closed')
    const fingerprint = await simulation.fingerprint()
    const finishTick = current.tick
    return { ...session, finishTick, fingerprint, identity: current.identity, samples: session.samples.filter(sample => sample.tick >= 0 && sample.tick < finishTick) }
  } finally { scheduler.resetTiming(); lastTime = performance.now(); exportBusy = false }
}
document.querySelector('#nextVariant').addEventListener('click', () => {
  const nextFeel = balancedFeelOrder[(balancedFeelOrder.indexOf(feelKey) + 1) % Math.max(1, balancedFeelOrder.length)] ?? feelKey
  void archiveAndReload({ order: sessionOrder, feel: nextFeel })
})
status.textContent = `running — ${expectedPreset.id} · ${scenarioKey} · worker physics · arrows/WASD torque · Space jump`

let apex = current.position.y
let launchY = current.position.y
let wasGrounded = current.physics.grounded
const trail = []
const trailGeometry = new THREE.BufferGeometry()
scene.add(new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xa78bfa })))

function dispatchNextBatch() {
  if (disposed || workerFailure || (paused && !exportBusy) || advancePending || scheduler.pendingCount === 0) return
  const inputs = scheduler.takeBatch()
  if (inputs.length === 0) return
  advancePending = true
  advanceTask = simulation.advance(inputs).then((result) => {
    if (disposed) return
    previous = result.previous
    current = result.current
    lastStepped = result.stepped
    const previousGrounded = wasGrounded
    const currentJumpTick = current.feel?.lastJumpTick ?? -1
    const jumpChanged = currentJumpTick >= 0 && currentJumpTick !== lastObservedJumpTick
    if (jumpChanged) { activeJumpTick = currentJumpTick; attempt.launchTick = currentJumpTick; attempt.apexY = current.position.y; attempt.apexTick = current.tick; lastObservedJumpTick = currentJumpTick }
    if (visualKey === 'feedback' && (previousGrounded !== current.physics.grounded || jumpChanged)) { document.body.classList.add('feel-pulse'); pulseUntil = performance.now() + 120 }
    if (wasGrounded && !current.physics.grounded) { launchY = previous.position.y; apex = current.position.y; trail.length = 0 }
    wasGrounded = current.physics.grounded
    if (activeJumpTick !== null && current.position.y > attempt.apexY) { attempt.apexY = current.position.y; attempt.apexTick = current.tick }
    if (activeJumpTick !== null && !previousGrounded && current.physics.grounded) {
      if (session.attempts.length < 3) { attempt.landingTick = current.tick; session.attempts.push({ ...attempt, landing: { ...current.position }, jumpSource: current.feel?.lastJumpSource ?? null, jumpStrength: current.feel?.lastJumpStrength ?? null, batchSampled: true }) }
      activeJumpTick = null
      attempt = { index: session.attempts.length + 1, launchTick: null, apexTick: null, landingTick: null, apexY: current.position.y }
      attemptCard.textContent = session.attempts.length >= 3 ? '3/3 complete' : `Attempt ${attempt.index}/3 · ${scenarioKey}`
    }
    apex = Math.max(apex, current.position.y)
    trail.push(new THREE.Vector3(current.position.x, current.position.y, current.position.z))
    if (trail.length > 240) trail.shift()
    trailGeometry.setFromPoints(trail)
  }).catch((error) => {
    if (disposed) return
    workerFailure = error
    scheduler.reset()
    inputState.reset()
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
  if (disposed) return
  if (pulseUntil > 0 && now >= pulseUntil) { pulseUntil = 0; document.body.classList.remove('feel-pulse') }
  const frameDelta = (now - lastTime) / 1000
  lastTime = now
  if (!paused && !exportBusy && !workerFailure) {
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
  const desired = expectedFeel.dimensionMode === '3d'
    ? new THREE.Vector3(transform.position.x, transform.position.y + 2.8, transform.position.z + 7.2)
    : new THREE.Vector3(transform.position.x, transform.position.y + 2.4, 8.2)
  camera.position.lerp(desired, follow)
  camera.lookAt(transform.position.x, transform.position.y + 0.3, expectedFeel.dimensionMode === '3d' ? transform.position.z : 0)

  const feelDebug = current.feel ?? current.debug?.feel
  const chargeTicks = feelDebug?.chargeTicks ?? (inputState.held('jump') ? Math.max(0, current.tick - (attempt.launchTick ?? current.tick)) : 0)
  chargeMeter.style.width = `${Math.min(100, (chargeTicks / Math.max(1, expectedFeel.chargeTicks ?? 1)) * 100)}%`

  telemetryTimer += Math.min(Math.max(frameDelta, 0), 0.1)
  if (telemetryTimer >= 0.2) {
    telemetryTimer = 0
    const p = current.physics
    const contactT = p.contactT === null ? '—' : p.contactT.toFixed(3)
    const strength = p.jumpStrength === null ? '—' : p.jumpStrength.toFixed(2)
    telemetry.textContent = `tick ${current.tick} · grounded ${p.grounded} · contactT ${contactT} · jump ${strength} · pos ${current.position.x.toFixed(2)}, ${current.position.y.toFixed(2)}, ${current.position.z.toFixed(2)} · vel ${current.linearVelocity.x.toFixed(2)}, ${current.linearVelocity.y.toFixed(2)}, ${current.linearVelocity.z.toFixed(2)} · COM Y ${expectedPreset.egg.centerOfMassY} · apex ${apex.toFixed(3)} / rise ${(apex - launchY).toFixed(3)} · quality ${p.contactT === null ? "AIR" : p.contactT > 0.85 ? "PERFECT" : p.contactT > 0.65 ? "GOOD" : p.contactT > 0.25 ? "SIDE" : "BASE"} · worker ${lastStepped} · queued ${scheduler.pendingCount}`
  }

  renderer.render(scene, camera)
  rafId = requestAnimationFrame(frame)
}
rafId = requestAnimationFrame(frame)

function discardUnsentInput() {
  const dropped = scheduler.discardPending()
  session.samples.splice(Math.max(0, session.samples.length - dropped), dropped)
  nextSampleTick -= dropped
  lastTime = performance.now()
}
const disposeInput = bindGameInput(inputState, {
  active: () => !paused && !disposed && !workerFailure,
  onCancel: () => { paused = true; discardUnsentInput() },
})
function resumeLab() {
  if (disposed) return
  paused = document.hidden
  scheduler.resetTiming()
  lastTime = performance.now()
}
window.addEventListener('focus', resumeLab)
document.addEventListener('visibilitychange', resumeLab)
function disposeLab() {
  if (disposed) return
  disposed = true
  cancelAnimationFrame(rafId)
  pulseUntil = 0
  document.body.classList.remove('feel-pulse')
  scheduler.reset()
  disposeInput()
  simulation.terminate()
  window.removeEventListener('resize', resize)
  window.removeEventListener('focus', resumeLab)
  document.removeEventListener('visibilitychange', resumeLab)
  const geometries = new Set()
  const materials = new Set()
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material)
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  renderer.dispose()
}
window.addEventListener('pagehide', disposeLab, { once: true })
window.addEventListener('pageshow', event => { if (event.persisted && disposed) location.reload() })
