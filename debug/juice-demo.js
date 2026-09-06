import * as THREE from 'three'
import { createJuiceView } from './juice-view.js'

const canvas = document.querySelector('#viewport')
const hud = document.querySelector('#hud')
const toast = document.querySelector('#toast')
const bloomToggle = document.querySelector('#bloomToggle')
const qualityToggle = document.querySelector('#qualityToggle')
const pbTrigger = document.querySelector('#pbTrigger')
const pauseToggle = document.querySelector('#pauseToggle')

const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' })
if (!context) {
  hud.textContent = 'WebGL2 недоступен — как и основной debug-рендер, демо требует WebGL2.'
  throw new Error('WebGL2 is required for the juice demo')
}

const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.setClearColor(0x0b1120, 1)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x0b1120, 14, 38)
const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 120)
scene.add(new THREE.HemisphereLight(0xfff7e0, 0x1f2937, 1.15))
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6)
keyLight.position.set(5, 10, 7)
scene.add(keyLight)

const bodyGroup = new THREE.Group()
const eggGeometry = new THREE.SphereGeometry(0.5, 32, 24)
const eggMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1cf, roughness: 0.45, metalness: 0, emissive: 0x332200, emissiveIntensity: 0.35 })
const eggMesh = new THREE.Mesh(eggGeometry, eggMaterial)
eggMesh.scale.set(0.92, 1.18, 0.92)
bodyGroup.add(eggMesh)
scene.add(bodyGroup)

const PLATFORM_GAP = 1.25
const platformGeometry = new THREE.BoxGeometry(7, 0.4, 5)
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0 })
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6d1d, roughness: 0.6, emissive: 0x2a1f00, emissiveIntensity: 0.7 })
const platforms = []
for (let i = 0; i < 64; i += 1) {
  const mesh = new THREE.Mesh(platformGeometry, i % 5 === 4 ? accentMaterial : platformMaterial)
  const top = i * PLATFORM_GAP
  mesh.position.set(0, top - 0.2, 0)
  scene.add(mesh)
  platforms.push({ top, mesh })
}

const STEP = 1 / 60
const GRAVITY = -16
const REST_OFFSET = 0.59
const JUMP_PATTERN = [8.1, 8.6, 5.4, 9.3, 8.4, 5.4, 8.9]
const GROUND_WAIT_TICKS = 10
const HARD_LAND_IMPACT_THRESHOLD = 0.65
const LANDING_FULL_IMPACT_SPEED = 12
let attemptId = 0
let tick = 0
let posX = 0
let posY = platforms[0].top + REST_OFFSET
let velY = 0
let platformIndex = 0
let targetIndex = 0
let grounded = true
let waitTicks = 0
let jumpIndex = 0
let metaSequence = 0

function makeSnapshot(snapshotTick, x, y, vy) {
  return { tick: snapshotTick, position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, linearVelocity: { x: 0, y: vy, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } }
}

function makeEvent(kind, ordinal, payload = {}) {
  return { id: `${attemptId}:${tick}:${kind}:${ordinal}`, attemptId, tick, ordinal, kind, position: { x: posX, y: posY, z: 0 }, ...payload }
}

function subStep() {
  tick += 1
  posX = Math.sin(tick * 0.011) * 1.4
  const events = []
  if (grounded) {
    waitTicks += 1
    if (waitTicks >= GROUND_WAIT_TICKS && targetIndex < platforms.length - 1) {
      waitTicks = 0
      const strength = JUMP_PATTERN[jumpIndex % JUMP_PATTERN.length]
      jumpIndex += 1
      const apex = (strength * strength) / (2 * -GRAVITY)
      targetIndex = apex > PLATFORM_GAP * 1.05 ? platformIndex + 1 : platformIndex
      velY = strength
      grounded = false
      events.push(makeEvent('jump', events.length, { source: 'support', strength }))
    }
    return events
  }
  velY += GRAVITY * STEP
  posY += velY * STEP
  const landingTop = platforms[targetIndex].top + REST_OFFSET
  if (velY < 0 && posY <= landingTop) {
    const fallSpeed = -velY
    posY = landingTop
    velY = 0
    grounded = true
    platformIndex = targetIndex
    const impact = Math.min(1, fallSpeed / LANDING_FULL_IMPACT_SPEED)
    const kind = impact >= HARD_LAND_IMPACT_THRESHOLD ? 'hard-land' : 'land'
    events.push(makeEvent(kind, events.length, { impact }))
  }
  return events
}

const juiceView = createJuiceView({ renderer, scene, camera, body: bodyGroup })
juiceView.reset(posY)
let currSnap = makeSnapshot(0, posX, posY, 0)
let accumulator = 0
let lastTime = performance.now()
let paused = false
let fpsEma = 60
let hudTimer = 0
let toastTimer
let rafId = 0
let disposed = false
camera.position.set(0, posY + 2.6, 7.4)

function showToast(text) {
  toast.textContent = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.textContent = '' }, 1400)
}

function frame(now) {
  if (disposed) return
  const frameDelta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1)
  lastTime = now
  if (frameDelta > 0) fpsEma += (1 / Math.max(frameDelta, 1e-4) - fpsEma) * 0.05
  if (!paused) {
    accumulator += frameDelta
    let guard = 0
    while (accumulator >= STEP && guard < 8) {
      const events = subStep()
      currSnap = makeSnapshot(tick, posX, posY, velY)
      juiceView.update(STEP, currSnap, events)
      accumulator -= STEP
      guard += 1
    }
    eggMesh.rotation.x -= frameDelta * 1.4
  }
  bodyGroup.position.set(currSnap.position.x, currSnap.position.y, 0)
  const follow = 1 - Math.exp(-6 * frameDelta)
  camera.position.x += (currSnap.position.x * 0.5 - camera.position.x) * follow
  camera.position.y += (currSnap.position.y + 2.6 - camera.position.y) * follow
  camera.position.z += (7.4 - camera.position.z) * follow
  camera.lookAt(currSnap.position.x * 0.5, currSnap.position.y + 0.2, 0)
  juiceView.apply()
  juiceView.observeFps(fpsEma, frameDelta)
  juiceView.render(frameDelta)
  hudTimer += frameDelta
  if (hudTimer >= 0.2) {
    hudTimer = 0
    hud.textContent = `fps ~${fpsEma.toFixed(0)} · качество ${juiceView.quality} · scale ${juiceView.renderScale.toFixed(2)} · высота попытки ${currSnap.position.y.toFixed(1)} м · пробел/тап — прыжок сейчас`
  }
  rafId = requestAnimationFrame(frame)
}

function resize() {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  juiceView.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
function onBloomToggle() { bloomToggle.setAttribute('aria-pressed', String(juiceView.toggleBloom())) }
function onQualityToggle() { qualityToggle.setAttribute('aria-pressed', String(juiceView.toggleAutoQuality())) }
function onPauseToggle() { paused = !paused; pauseToggle.setAttribute('aria-pressed', String(paused)); pauseToggle.textContent = paused ? 'Продолжить' : 'Пауза' }
function onPersonalBest() {
  metaSequence += 1
  const accepted = juiceView.emitMeta({ id: `demo-pb-${metaSequence}`, kind: 'personal-best', value: currSnap.position.y }, currSnap.position)
  if (accepted) showToast('External Personal Best event')
}
function jumpNow() { waitTicks = GROUND_WAIT_TICKS }
function onKeyDown(event) { if (event.code === 'Space') { event.preventDefault(); jumpNow() } }
function disposeDemo() {
  if (disposed) return
  disposed = true
  cancelAnimationFrame(rafId)
  clearTimeout(toastTimer)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pagehide', disposeDemo)
  canvas.removeEventListener('pointerdown', jumpNow)
  bloomToggle.removeEventListener('click', onBloomToggle)
  qualityToggle.removeEventListener('click', onQualityToggle)
  pbTrigger.removeEventListener('click', onPersonalBest)
  pauseToggle.removeEventListener('click', onPauseToggle)
  juiceView.dispose()
  eggGeometry.dispose()
  eggMaterial.dispose()
  platformGeometry.dispose()
  platformMaterial.dispose()
  accentMaterial.dispose()
  renderer.dispose()
}
window.addEventListener('resize', resize)
window.addEventListener('keydown', onKeyDown)
window.addEventListener('pagehide', disposeDemo)
canvas.addEventListener('pointerdown', jumpNow)
bloomToggle.addEventListener('click', onBloomToggle)
qualityToggle.addEventListener('click', onQualityToggle)
pbTrigger.addEventListener('click', onPersonalBest)
pauseToggle.addEventListener('click', onPauseToggle)
resize()
rafId = requestAnimationFrame(frame)
