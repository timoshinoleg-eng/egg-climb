import * as THREE from 'three'
import { FixedTickInputScheduler } from '../dist/host/fixed-tick-scheduler.js'
import { WorkerSimulationHost } from '../dist/host/worker-client.js'
import { EGG_COLLIDER_INDEX_DATA, EGG_COLLIDER_VERTEX_DATA } from '../dist/sim/egg-collider.js'
import { PHYSICS_V1 } from '../dist/sim/physics-presets.js'
import { FEEL_PRESETS } from '../dist/sim/feel-presets.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { KITCHEN_LEVEL, KITCHEN_LEVEL_DEFINITION, kinematicOffsetAtTick } from '../dist/sim/level.js'
import { interpolateSnapshots } from '../dist/render/interpolate.js'
import {
  KITCHEN_SECTION_ORDER,
  dampKitchenVec3,
  exponentialDampingAlpha,
  kitchenCameraTargets,
  kitchenSectionForX,
  kitchenSectionIndex,
} from '../dist/render/kitchen-presentation.js'
import { createJuiceView } from './juice-view.js'

const query = new URL(location.href).searchParams
const feelKey = query.get('feel') ?? '2d-tap-assist'
const feel = FEEL_PRESETS[feelKey]
if (!feel) throw new Error(`Unknown feel preset: ${feelKey}`)
const quality = ['low', 'medium', 'high'].includes(query.get('quality')) ? query.get('quality') : 'medium'

const canvas = document.querySelector('#kitchenViewport')
const status = document.querySelector('#status')
const sectionLabel = document.querySelector('#sectionLabel')
const runTimer = document.querySelector('#runTimer')
const heightLabel = document.querySelector('#heightLabel')
const progressNodes = [...document.querySelectorAll('#routeProgress i')]
const resultOverlay = document.querySelector('#resultOverlay')
const resultEyebrow = document.querySelector('#resultEyebrow')
const resultTitle = document.querySelector('#resultTitle')
const resultSummary = document.querySelector('#resultSummary')
const unsupported = document.querySelector('#unsupported')

const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' })
if (!context) {
  unsupported.hidden = false
  status.textContent = 'WebGL2 недоступен'
  throw new Error('WebGL2 is required for Kitchen Escape')
}

const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.03
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
renderer.setClearColor(0x171c2a, 1)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x252b3c)
scene.fog = new THREE.Fog(0x252b3c, 20, 48)
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100)
scene.add(camera)

scene.add(new THREE.HemisphereLight(0xfff2dc, 0x293447, 1.7))
const keyLight = new THREE.DirectionalLight(0xfff4dc, 2.1)
keyLight.position.set(13, 15, 8)
scene.add(keyLight)
const fillLight = new THREE.DirectionalLight(0x8ddfd5, 0.55)
fillLight.position.set(28, 9, 3)
scene.add(fillLight)

const disposables = new Set()
function material(options) {
  const value = new THREE.MeshStandardMaterial(options)
  disposables.add(value)
  return value
}
function basicMaterial(options) {
  const value = new THREE.MeshBasicMaterial(options)
  disposables.add(value)
  return value
}
function geometry(value) { disposables.add(value); return value }
function meshBox(size, mat, position, parent = scene) {
  const mesh = new THREE.Mesh(geometry(new THREE.BoxGeometry(...size)), mat)
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}
function roundedShadow(radius = 0.65) {
  const mesh = new THREE.Mesh(
    geometry(new THREE.CircleGeometry(radius, 28)),
    basicMaterial({ color: 0x121620, transparent: true, opacity: 0.28, depthWrite: false }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  scene.add(mesh)
  return mesh
}

const palette = {
  wood: material({ color: 0xa96f48, roughness: 0.88, metalness: 0 }),
  board: material({ color: 0xe2bd82, roughness: 0.82, metalness: 0 }),
  cream: material({ color: 0xdad7c9, roughness: 0.74, metalness: 0 }),
  mint: material({ color: 0x78a89c, roughness: 0.72, metalness: 0 }),
  dark: material({ color: 0x343946, roughness: 0.55, metalness: 0.18 }),
  steel: material({ color: 0x8d949b, roughness: 0.38, metalness: 0.55 }),
  coral: material({ color: 0xc96f56, roughness: 0.62, metalness: 0.05, emissive: 0x2b0b05, emissiveIntensity: 0.2 }),
  cyan: material({ color: 0x5cc8b2, roughness: 0.5, metalness: 0.08, emissive: 0x123a36, emissiveIntensity: 0.65 }),
  top: material({ color: 0xf0e9d7, roughness: 0.82, metalness: 0 }),
}

function surfaceVisual(definition, mat, zDepth = 4.2) {
  const [hx, hy, hz] = definition.halfExtents
  const mesh = meshBox([hx * 2, hy * 2, Math.min(hz * 2, zDepth)], mat, definition.center)
  mesh.userData.surfaceId = definition.id
  return mesh
}

const defs = Object.fromEntries(KITCHEN_LEVEL_DEFINITION.staticBoxes.map(definition => [definition.id, definition]))
const tableSurface = surfaceVisual(defs.table, palette.wood)
const boardSurface = surfaceVisual(defs['cutting-board'], palette.board)
const counterSurface = surfaceVisual(defs.counter, palette.top)
const toasterSurface = surfaceVisual(defs.toaster, palette.coral, 3.4)
const fridgeSurface = surfaceVisual(defs.fridge, palette.cream, 4.0)
const hoodSurface = surfaceVisual(defs.hood, palette.steel, 4.2)
const ventSurface = surfaceVisual(defs.vent, palette.cyan, 3.5)
void tableSurface; void boardSurface; void counterSurface; void toasterSurface; void fridgeSurface; void hoodSurface; void ventSurface

// Open dollhouse shell: the camera-side wall is intentionally absent.
meshBox([31, 0.3, 13], palette.cream, [18.5, -0.65, -4.2])
meshBox([31, 11, 0.25], palette.cream, [18.5, 4.3, -9.15])
meshBox([0.25, 11, 13], palette.mint, [6.8, 4.3, -4.2])

// Table legs make the tiny-egg scale readable immediately.
for (const x of [8.1, 11.8]) for (const z of [-7.2, -1.2]) meshBox([0.42, 4.8, 0.42], palette.wood, [x, -0.75, z])
// Counter cabinets and handles.
for (const x of [14.5, 16.2]) {
  meshBox([1.55, 3.35, 3.7], palette.mint, [x, 0.95, -5.05])
  meshBox([0.55, 0.1, 0.12], palette.dark, [x, 1.35, -3.15])
}
// Giant refrigerator body underneath its authoritative top surface.
meshBox([2.8, 7.55, 4.0], palette.cream, [20.5, -0.025, -5.0])
meshBox([0.12, 2.2, 0.18], palette.dark, [19.72, 1.2, -2.92])
// Hood chimney and back splash.
meshBox([2.2, 4.2, 2.4], palette.steel, [24.7, 7.45, -6.0])
meshBox([5.4, 3.2, 0.15], palette.dark, [24.5, 3.9, -8.98])

// Hero toaster: visually local even though the 2.5D authoritative lane is wider.
const toasterBody = meshBox([2.35, 0.82, 2.7], palette.coral, [18, 3.0, -4])
const toasterSlotMat = basicMaterial({ color: 0x161922 })
meshBox([1.42, 0.035, 0.20], toasterSlotMat, [18, 3.425, -4.38])
meshBox([1.42, 0.035, 0.20], toasterSlotMat, [18, 3.425, -3.72])
const toasterGlow = new THREE.PointLight(0xffa44f, 0, 5)
toasterGlow.position.set(18, 4.0, -4)
scene.add(toasterGlow)

// Coffee mug and deterministic-looking presentation steam.
const mug = new THREE.Group()
const mugMat = palette.dark
const mugBody = new THREE.Mesh(geometry(new THREE.CylinderGeometry(0.72, 0.65, 1.35, 18)), mugMat)
mugBody.position.set(19.4, 4.35, -4.5)
mug.add(mugBody)
const mugHandle = new THREE.Mesh(geometry(new THREE.TorusGeometry(0.48, 0.12, 8, 18, Math.PI * 1.55)), mugMat)
mugHandle.rotation.y = Math.PI / 2
mugHandle.position.set(20.03, 4.38, -4.5)
mug.add(mugHandle)
scene.add(mug)
const steamMat = basicMaterial({ color: 0xeafdf8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
const steamWisps = []
for (let i = 0; i < 10; i += 1) {
  const wisp = new THREE.Mesh(geometry(new THREE.PlaneGeometry(0.34 + (i % 3) * 0.08, 2.1)), steamMat.clone())
  disposables.add(wisp.material)
  wisp.position.set(19.0 + (i % 5) * 0.25, 5.5 + Math.floor(i / 5) * 1.0, -4.6 + (i % 2) * 0.2)
  wisp.rotation.y = (i % 4) * Math.PI / 4
  scene.add(wisp)
  steamWisps.push(wisp)
}

// Moving cabinet presentation follows the canonical kinematic definition/tick.
const cabinetDef = KITCHEN_LEVEL_DEFINITION.kinematicBoxes[0]
const cabinetGroup = new THREE.Group()
const cabinetShelf = meshBox([cabinetDef.halfExtents[0] * 2, cabinetDef.halfExtents[1] * 2, 4.0], palette.mint, [0, 0, 0], cabinetGroup)
meshBox([2.35, 1.3, 0.25], palette.mint, [0, -0.74, 1.87], cabinetGroup)
meshBox([0.72, 0.10, 0.12], palette.dark, [0, -0.72, 2.03], cabinetGroup)
scene.add(cabinetGroup)
void cabinetShelf

// Vent frame + slats make the goal visible from the previous camera region.
const ventFrame = new THREE.Group()
ventFrame.position.set(27, 6.55, -5.7)
for (const y of [-0.72, 0.72]) meshBox([2.0, 0.16, 0.22], palette.cyan, [0, y, 0], ventFrame)
for (const x of [-0.92, 0.92]) meshBox([0.16, 1.6, 0.22], palette.cyan, [x, 0, 0], ventFrame)
for (let i = -2; i <= 2; i += 1) meshBox([1.55, 0.10, 0.14], palette.dark, [0, i * 0.27, 0.08], ventFrame)
scene.add(ventFrame)
const ventLight = new THREE.PointLight(0x6ce9d1, 1.5, 6)
ventLight.position.set(27, 6.5, -4.5)
scene.add(ventLight)

// Scale anchors: crumbs and an oversized spoon. They are visual only.
const crumbMat = material({ color: 0xc99055, roughness: 1, metalness: 0 })
for (let i = 0; i < 7; i += 1) {
  const crumb = new THREE.Mesh(geometry(new THREE.DodecahedronGeometry(0.09 + (i % 3) * 0.035, 0)), crumbMat)
  crumb.position.set(10.2 + i * 0.36, 2.08, -3.2 - (i % 2) * 0.35)
  crumb.rotation.set(i * 0.31, i * 0.17, i * 0.23)
  scene.add(crumb)
}
const spoon = new THREE.Group()
const spoonBowl = new THREE.Mesh(geometry(new THREE.SphereGeometry(0.42, 14, 10)), palette.steel)
spoonBowl.scale.set(1, 0.18, 1.45)
spoonBowl.position.set(13.2, 2.55, -6.1)
spoon.add(spoonBowl)
meshBox([0.18, 0.10, 2.4], palette.steel, [13.2, 2.56, -7.35], spoon)
scene.add(spoon)

const eggGeometry = new THREE.BufferGeometry()
eggGeometry.setAttribute('position', new THREE.Float32BufferAttribute(EGG_COLLIDER_VERTEX_DATA, 3))
eggGeometry.setIndex(EGG_COLLIDER_INDEX_DATA)
eggGeometry.computeVertexNormals()
disposables.add(eggGeometry)
const eggMaterial = material({ color: 0xfff2cf, roughness: 0.48, metalness: 0, emissive: 0x1a1207, emissiveIntensity: 0.08 })
const egg = new THREE.Group()
const eggMesh = new THREE.Mesh(eggGeometry, eggMaterial)
egg.add(eggMesh)
scene.add(egg)
const blobShadow = roundedShadow(0.66)

const workerUrl = new URL('./sim-worker.js', import.meta.url)
workerUrl.searchParams.set('feel', feelKey)
const simulation = new WorkerSimulationHost(workerUrl, PHYSICS_V1, feel, KITCHEN_LEVEL)
let previous = await simulation.init()
let current = previous
let scheduler = new FixedTickInputScheduler()
const juiceView = createJuiceView({ renderer, scene, camera, body: egg })
juiceView.setQuality(quality)

let advancePending = false
let paused = document.hidden
let resetting = false
let ended = false
let lastTime = performance.now()
let elapsedPresentation = 0
let pendingEvents = []
let launchFlash = 0
let finishFlash = 0
let attemptNumber = 1
let retryCount = 0
let maxHeight = current.position.y - KITCHEN_LEVEL.origin[1]
let currentSection = kitchenSectionForX(current.position.x)
let furthestSectionIndex = kitchenSectionIndex(currentSection)
let attemptStartTick = current.tick
let endReason = null
let cameraState = kitchenCameraTargets(current.position)
let cameraPosition = { ...cameraState.position }
let cameraLookAt = { ...cameraState.lookAt }
const attemptHistory = []

const pressed = new Set()
let jumpHeld = false
let pendingJumpDown = false
let pendingJumpUp = false
let pendingJumpCancel = false

function clearInput(cancelJump = true) {
  pressed.clear()
  if (jumpHeld && cancelJump) pendingJumpCancel = true
  jumpHeld = false
}

function setMove(code, down) {
  if (down) pressed.add(code)
  else pressed.delete(code)
}
function setJump(down, cancelled = false) {
  if (down && !jumpHeld) { jumpHeld = true; pendingJumpDown = true }
  if (!down && jumpHeld) {
    jumpHeld = false
    if (cancelled) pendingJumpCancel = true
    else pendingJumpUp = true
  }
}

window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD', 'KeyR'].includes(event.code)) event.preventDefault()
  if (event.code === 'KeyR') { void restartAttempt(); return }
  if (event.code === 'Space') { setJump(true); return }
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') setMove('left', true)
  if (event.code === 'ArrowRight' || event.code === 'KeyD') setMove('right', true)
})
window.addEventListener('keyup', event => {
  if (event.code === 'Space') { setJump(false); return }
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') setMove('left', false)
  if (event.code === 'ArrowRight' || event.code === 'KeyD') setMove('right', false)
})
window.addEventListener('blur', () => clearInput(true))
document.addEventListener('visibilitychange', () => {
  paused = document.hidden
  if (paused) clearInput(true)
  scheduler.resetTiming()
  lastTime = performance.now()
})

function bindHoldButton(id, code) {
  const button = document.querySelector(id)
  const release = () => { setMove(code, false); button.classList.remove('pressed') }
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); setMove(code, true); button.classList.add('pressed') })
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', release)
}
bindHoldButton('#leftButton', 'left')
bindHoldButton('#rightButton', 'right')
const jumpButton = document.querySelector('#jumpButton')
const releaseJump = cancelled => { setJump(false, cancelled); jumpButton.classList.remove('pressed') }
jumpButton.addEventListener('pointerdown', event => { event.preventDefault(); jumpButton.setPointerCapture(event.pointerId); setJump(true); jumpButton.classList.add('pressed') })
jumpButton.addEventListener('pointerup', () => releaseJump(false))
jumpButton.addEventListener('pointercancel', () => releaseJump(true))
jumpButton.addEventListener('lostpointercapture', () => releaseJump(true))

document.querySelector('#restartButton').addEventListener('click', () => void restartAttempt())
document.querySelector('#retryButton').addEventListener('click', () => void restartAttempt())
document.querySelector('#metricsButton').addEventListener('click', () => downloadMetrics())

function sampleInput() {
  const moveX = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0)
  const input = {
    ...NEUTRAL_INPUT,
    moveX,
    moveZ: 0,
    jumpDown: pendingJumpDown,
    jumpUp: pendingJumpUp,
    jumpCancel: pendingJumpCancel,
  }
  pendingJumpDown = false
  pendingJumpUp = false
  pendingJumpCancel = false
  return input
}

function dispatchNextBatch() {
  if (advancePending || resetting || ended || scheduler.pendingCount === 0) return
  const inputs = scheduler.takeBatch()
  if (inputs.length === 0) return
  advancePending = true
  simulation.advance(inputs).then(frame => {
    previous = frame.previous
    current = frame.current
    pendingEvents.push(...frame.events)
    observeAuthoritativeState(frame.events)
  }).catch(error => {
    status.textContent = `Ошибка Worker: ${error instanceof Error ? error.message : String(error)}`
    ended = true
  }).finally(() => {
    advancePending = false
    dispatchNextBatch()
  })
}

function observeAuthoritativeState(events) {
  maxHeight = Math.max(maxHeight, current.position.y - KITCHEN_LEVEL.origin[1])
  const nextSection = kitchenSectionForX(current.position.x)
  const nextIndex = kitchenSectionIndex(nextSection)
  if (nextIndex > furthestSectionIndex) furthestSectionIndex = nextIndex
  currentSection = nextSection
  for (const event of events) {
    if (event.kind === 'launch' && event.zoneId === 'toaster-launch') launchFlash = 1
    if (event.kind === 'finish') finishFlash = 1
  }
  if (!ended && current.gameplay.completionTick !== null) endAttempt('finish')
  else if (!ended && current.position.y < -2.3) endAttempt('fall')
}

const sectionNames = {
  table: 'СТОЛ',
  'cutting-board': 'ДОСКА',
  counter: 'СТОЛЕШНИЦА',
  toaster: 'ТОСТЕР',
  steam: 'ПАР',
  fridge: 'ХОЛОДИЛЬНИК',
  'moving-cabinet': 'ШКАФ',
  hood: 'ВЫТЯЖКА',
  vent: 'ВЕНТИЛЯЦИЯ',
}

function updateHud() {
  const ticks = Math.max(0, current.tick - attemptStartTick)
  const seconds = ticks / 60
  runTimer.textContent = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  heightLabel.textContent = `+${Math.max(0, maxHeight).toFixed(1)} м`
  sectionLabel.textContent = sectionNames[currentSection] ?? currentSection.toUpperCase()
  const activeIndex = kitchenSectionIndex(currentSection)
  progressNodes.forEach((node, index) => {
    node.classList.toggle('reached', index <= furthestSectionIndex)
    node.classList.toggle('active', index === activeIndex)
  })
}

function endAttempt(reason) {
  if (ended) return
  ended = true
  endReason = reason
  clearInput(false)
  const completionTick = current.gameplay.completionTick
  const durationTicks = Math.max(0, current.tick - attemptStartTick)
  const record = {
    schema: 'egg-climb-kitchen-playtest-v1',
    attempt: attemptNumber,
    reason,
    levelId: KITCHEN_LEVEL.id,
    levelHash: KITCHEN_LEVEL.hash,
    feel: feel.id,
    quality,
    durationTicks,
    durationSeconds: durationTicks / 60,
    maxHeight,
    furthestSection: KITCHEN_SECTION_ORDER[furthestSectionIndex],
    completionTick,
    retriesBeforeAttempt: retryCount,
    recordedAt: new Date().toISOString(),
  }
  attemptHistory.push(record)
  persistAttempt(record)
  resultOverlay.hidden = false
  if (reason === 'finish') {
    resultEyebrow.textContent = 'ПОБЕГ УДАЛСЯ'
    resultTitle.textContent = 'СВОБОДА!'
    resultSummary.textContent = `Вентиляция достигнута за ${(durationTicks / 60).toFixed(1)} с · высота +${maxHeight.toFixed(1)} м.`
  } else {
    resultEyebrow.textContent = 'ЯЙЦО СОРВАЛОСЬ'
    resultTitle.textContent = 'ЕЩЁ РАЗ?'
    resultSummary.textContent = `Лучший участок: ${sectionNames[KITCHEN_SECTION_ORDER[furthestSectionIndex]]} · высота +${Math.max(0, maxHeight).toFixed(1)} м.`
  }
}

function persistAttempt(record) {
  try {
    const key = 'egg-climb-kitchen-playtest-v1'
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    const history = Array.isArray(existing) ? existing.slice(-23) : []
    history.push(record)
    localStorage.setItem(key, JSON.stringify(history))
  } catch { /* playtest persistence is best-effort */ }
}

function downloadMetrics() {
  let persisted = []
  try { const value = JSON.parse(localStorage.getItem('egg-climb-kitchen-playtest-v1') || '[]'); if (Array.isArray(value)) persisted = value } catch {}
  const payload = { schema: 'egg-climb-kitchen-playtest-export-v1', exportedAt: new Date().toISOString(), currentSession: attemptHistory, persisted }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `egg-kitchen-playtest-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function waitForAdvance() {
  while (advancePending) await new Promise(resolve => setTimeout(resolve, 0))
}

async function restartAttempt() {
  if (resetting) return
  resetting = true
  resultOverlay.hidden = true
  await waitForAdvance()
  scheduler = new FixedTickInputScheduler()
  clearInput(false)
  pendingJumpDown = false; pendingJumpUp = false; pendingJumpCancel = false
  const snapshot = await simulation.reset()
  previous = snapshot
  current = snapshot
  pendingEvents.length = 0
  juiceView.reset(snapshot.position.y)
  attemptNumber += 1
  retryCount += 1
  maxHeight = snapshot.position.y - KITCHEN_LEVEL.origin[1]
  currentSection = kitchenSectionForX(snapshot.position.x)
  furthestSectionIndex = kitchenSectionIndex(currentSection)
  attemptStartTick = snapshot.tick
  endReason = null
  ended = false
  launchFlash = 0
  finishFlash = 0
  cameraState = kitchenCameraTargets(snapshot.position)
  cameraPosition = { ...cameraState.position }
  cameraLookAt = { ...cameraState.lookAt }
  status.textContent = `Попытка ${attemptNumber} · ${feel.id} · ${quality}`
  lastTime = performance.now()
  resetting = false
}

function updateKinematic(alpha) {
  const previousOffset = kinematicOffsetAtTick(cabinetDef, previous.tick)
  const currentOffset = kinematicOffsetAtTick(cabinetDef, current.tick)
  cabinetGroup.position.set(
    cabinetDef.center[0] + previousOffset[0] + (currentOffset[0] - previousOffset[0]) * alpha,
    cabinetDef.center[1] + previousOffset[1] + (currentOffset[1] - previousOffset[1]) * alpha,
    cabinetDef.center[2] + previousOffset[2] + (currentOffset[2] - previousOffset[2]) * alpha,
  )
}

function updateSteam(dt) {
  elapsedPresentation += dt
  const active = current.gameplay.activeContinuousForceZoneIds.includes('coffee-steam')
  for (let i = 0; i < steamWisps.length; i += 1) {
    const wisp = steamWisps[i]
    const phase = elapsedPresentation * (0.8 + (i % 3) * 0.08) + i * 0.73
    wisp.position.x += Math.sin(phase) * 0.0018
    wisp.scale.y = 0.8 + ((phase * 0.18) % 0.35)
    wisp.material.opacity = (active ? 0.24 : 0.13) + Math.sin(phase * 1.7) * 0.035
  }
}

function surfaceTopBelow(position) {
  let best = -Infinity
  for (const box of KITCHEN_LEVEL_DEFINITION.staticBoxes) {
    if (Math.abs(position.x - box.center[0]) <= box.halfExtents[0] && Math.abs(position.z - box.center[2]) <= box.halfExtents[2]) {
      const top = box.center[1] + box.halfExtents[1]
      if (top <= position.y + 0.3 && top > best) best = top
    }
  }
  const offset = kinematicOffsetAtTick(cabinetDef, current.tick)
  const center = [cabinetDef.center[0] + offset[0], cabinetDef.center[1] + offset[1], cabinetDef.center[2] + offset[2]]
  if (Math.abs(position.x - center[0]) <= cabinetDef.halfExtents[0] && Math.abs(position.z - center[2]) <= cabinetDef.halfExtents[2]) {
    const top = center[1] + cabinetDef.halfExtents[1]
    if (top <= position.y + 0.3 && top > best) best = top
  }
  return Number.isFinite(best) ? best : position.y - 0.72
}

function resize() {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  juiceView.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

status.textContent = `Работает · ${feel.id} · ${quality}`

function frame(now) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1)
  lastTime = now
  if (!paused && !resetting && !ended) {
    scheduler.sampleFrame(dt, sampleInput)
    dispatchNextBatch()
  }

  const alpha = scheduler.alpha
  const transform = interpolateSnapshots(previous, current, alpha)
  egg.position.set(transform.position.x, transform.position.y, transform.position.z)
  egg.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)
  updateKinematic(alpha)
  updateSteam(dt)

  const desired = kitchenCameraTargets(transform.position)
  cameraPosition = dampKitchenVec3(cameraPosition, desired.position, exponentialDampingAlpha(dt, 0.22))
  cameraLookAt = dampKitchenVec3(cameraLookAt, desired.lookAt, exponentialDampingAlpha(dt, 0.15))
  camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z)
  camera.lookAt(cameraLookAt.x, cameraLookAt.y, cameraLookAt.z)

  const shadowTop = surfaceTopBelow(transform.position)
  blobShadow.position.set(transform.position.x, shadowTop + 0.018, transform.position.z)
  const shadowDistance = Math.max(0, transform.position.y - shadowTop)
  const shadowScale = THREE.MathUtils.clamp(1.1 - shadowDistance * 0.09, 0.55, 1.05)
  blobShadow.scale.setScalar(shadowScale)
  blobShadow.material.opacity = THREE.MathUtils.clamp(0.31 - shadowDistance * 0.025, 0.08, 0.31)

  launchFlash = Math.max(0, launchFlash - dt * 2.7)
  finishFlash = Math.max(0, finishFlash - dt * 0.8)
  toasterGlow.intensity = launchFlash * 5.5
  palette.coral.emissiveIntensity = 0.2 + launchFlash * 1.8
  ventLight.intensity = 1.5 + finishFlash * 5.0
  palette.cyan.emissiveIntensity = 0.65 + finishFlash * 1.7

  const events = pendingEvents.splice(0)
  juiceView.update(dt, current, events)
  juiceView.apply()
  juiceView.observeFps(dt > 0 ? 1 / dt : 60, dt)
  juiceView.render(dt || 1 / 60)
  updateHud()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.__eggKitchenPlaytest = {
  getState() {
    return {
      levelId: KITCHEN_LEVEL.id,
      levelHash: KITCHEN_LEVEL.hash,
      tick: current.tick,
      position: { ...current.position },
      section: currentSection,
      furthestSection: KITCHEN_SECTION_ORDER[furthestSectionIndex],
      maxHeight,
      completionTick: current.gameplay.completionTick,
      ended,
      endReason,
      attemptNumber,
      retryCount,
      feel: feel.id,
      quality: juiceView.quality,
      cameraRegion: kitchenCameraTargets(current.position).region.id,
      activeForceZones: [...current.gameplay.activeContinuousForceZoneIds],
    }
  },
  restart: restartAttempt,
}

window.addEventListener('pagehide', () => {
  juiceView.dispose()
  for (const value of disposables) value.dispose?.()
  renderer.dispose()
  void simulation.free()
}, { once: true })
