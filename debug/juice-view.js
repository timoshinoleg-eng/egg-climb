import * as THREE from 'three'
import { Juice, VISUAL_QUALITY_PROFILES, composeVisualScale } from '../dist/render/juice.js'

const BURST_COUNT = 4
const BURST_POINTS = VISUAL_QUALITY_PROFILES.high.particlePoints
const BURST_LIFETIME = 0.85
const QUALITY_ORDER = ['low', 'medium', 'high']

let postProcessingModules = null
let postProcessingModulesPromise = null

function loadPostProcessingModules() {
  if (postProcessingModules) return Promise.resolve(postProcessingModules)
  if (!postProcessingModulesPromise) {
    postProcessingModulesPromise = Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]).then(([effectComposerModule, renderPassModule, bloomPassModule, outputPassModule]) => {
      postProcessingModules = {
        EffectComposer: effectComposerModule.EffectComposer,
        RenderPass: renderPassModule.RenderPass,
        UnrealBloomPass: bloomPassModule.UnrealBloomPass,
        OutputPass: outputPassModule.OutputPass,
      }
      return postProcessingModules
    }).catch(error => {
      postProcessingModulesPromise = null
      throw error
    })
  }
  return postProcessingModulesPromise
}

class PointBurst {
  constructor(scene) {
    this.scene = scene
    this.positions = new Float32Array(BURST_POINTS * 3)
    this.velocities = new Float32Array(BURST_POINTS * 3)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setDrawRange(0, 0)
    this.material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.085,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.visible = false
    this.points.frustumCulled = false
    this.life = 0
    this.gravity = 6
    this.activeCount = 0
    this.disposed = false
    scene.add(this.points)
  }

  spawn(origin, count, { color = 0xffffff, speed = 3, up = 1.6, gravity = 6, size = 0.085 } = {}) {
    if (this.disposed) return
    this.activeCount = Math.max(0, Math.min(BURST_POINTS, Math.floor(count)))
    if (this.activeCount === 0) return
    this.material.color.setHex(color)
    this.material.size = size
    this.material.opacity = 1
    this.gravity = gravity
    this.life = 1
    this.geometry.setDrawRange(0, this.activeCount)
    for (let i = 0; i < this.activeCount; i += 1) {
      const i3 = i * 3
      this.positions[i3] = origin.x
      this.positions[i3 + 1] = origin.y
      this.positions[i3 + 2] = origin.z
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random()
      this.velocities[i3] = Math.cos(angle) * radius * speed
      this.velocities[i3 + 1] = (Math.random() * 0.9 + 0.25) * up * speed * 0.55
      this.velocities[i3 + 2] = Math.sin(angle) * radius * speed
    }
    this.geometry.attributes.position.needsUpdate = true
    this.points.visible = true
  }

  update(dt) {
    if (this.disposed || this.life <= 0) return
    this.life = Math.max(0, this.life - dt / BURST_LIFETIME)
    for (let i = 0; i < this.activeCount; i += 1) {
      const i3 = i * 3
      this.velocities[i3 + 1] -= this.gravity * dt
      this.positions[i3] += this.velocities[i3] * dt
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt
    }
    this.geometry.attributes.position.needsUpdate = true
    this.material.opacity = this.life
    this.points.visible = this.life > 0
  }

  reset() {
    if (this.disposed) return
    this.life = 0
    this.activeCount = 0
    this.material.opacity = 0
    this.points.visible = false
    this.geometry.setDrawRange(0, 0)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.scene.remove(this.points)
    this.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * Owns only temporary additive camera transforms. The camera's base/local
 * transform is never changed by shake, and the rig is cleared after render.
 */
export function createCameraShakeLayer({ scene, camera }) {
  const originalParent = camera.parent
  const host = originalParent ?? scene
  const rig = new THREE.Group()
  rig.name = 'egg-climb-camera-shake'
  host.add(rig)
  rig.attach(camera)
  let disposed = false

  function clear() {
    if (disposed) return
    rig.position.set(0, 0, 0)
    rig.quaternion.identity()
    rig.scale.set(1, 1, 1)
  }

  function apply(offset) {
    if (disposed) return
    clear()
    rig.position.set(offset.x, offset.y, 0)
    rig.rotation.set(0, 0, offset.roll)
  }

  function dispose() {
    if (disposed) return
    clear()
    if (originalParent) {
      originalParent.attach(camera)
    } else {
      camera.updateWorldMatrix(true, false)
      const worldPosition = new THREE.Vector3()
      const worldQuaternion = new THREE.Quaternion()
      const worldScale = new THREE.Vector3()
      camera.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale)
      rig.remove(camera)
      camera.position.copy(worldPosition)
      camera.quaternion.copy(worldQuaternion)
      camera.scale.copy(worldScale)
    }
    host.remove(rig)
    disposed = true
  }

  return { apply, clear, dispose, get rig() { return rig } }
}

export function createJuiceView({ renderer, scene, camera, body }) {
  const juice = new Juice()
  const bursts = Array.from({ length: BURST_COUNT }, () => new PointBurst(scene))
  const shakeLayer = createCameraShakeLayer({ scene, camera })
  const baseBodyScale = { x: body.scale.x, y: body.scale.y, z: body.scale.z }
  let burstCursor = 0
  let frame = null
  let quality = 'medium'
  let autoQuality = true
  let bloomEnabled = true
  let bloomFlash = 0
  let lowFpsSeconds = 0
  let highFpsSeconds = 0
  let logicalWidth = 1
  let logicalHeight = 1
  let composer = null
  let renderPass = null
  let bloomPass = null
  let outputPass = null
  let postProcessingUnavailable = false
  let contextLost = false
  let disposed = false
  const seenMetaIds = new Set()

  function profile() {
    return VISUAL_QUALITY_PROFILES[quality]
  }

  function resetBodyScale() {
    body.scale.set(baseBodyScale.x, baseBodyScale.y, baseBodyScale.z)
  }

  function disposeComposer() {
    if (!composer) return
    bloomPass?.dispose?.()
    renderPass?.dispose?.()
    outputPass?.dispose?.()
    composer.dispose?.()
    composer = null
    renderPass = null
    bloomPass = null
    outputPass = null
  }

  function preloadPostProcessing() {
    if (disposed || postProcessingModules || postProcessingUnavailable || quality !== 'high' || !bloomEnabled) return
    void loadPostProcessingModules().catch(() => {
      if (!disposed) postProcessingUnavailable = true
    })
  }

  function ensureComposer() {
    if (composer || disposed || contextLost || quality !== 'high' || !bloomEnabled || bloomFlash <= 0) return
    if (!postProcessingModules) {
      preloadPostProcessing()
      return
    }
    const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = postProcessingModules
    composer = new EffectComposer(renderer)
    renderPass = new RenderPass(scene, camera)
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.85)
    outputPass = new OutputPass()
    composer.addPass(renderPass)
    composer.addPass(bloomPass)
    composer.addPass(outputPass)
    applySize()
  }

  function applySize() {
    if (disposed) return
    const scale = profile().renderScale
    const width = Math.max(1, Math.round(logicalWidth * scale))
    const height = Math.max(1, Math.round(logicalHeight * scale))
    renderer.setSize(width, height, false)
    composer?.setSize(width, height)
  }

  function setQuality(next) {
    if (!Object.hasOwn(VISUAL_QUALITY_PROFILES, next)) throw new Error(`Unknown visual quality tier: ${next}`)
    if (quality === next) return quality
    quality = next
    lowFpsSeconds = 0
    highFpsSeconds = 0
    if (!profile().bloom) {
      bloomFlash = 0
      disposeComposer()
    } else {
      preloadPostProcessing()
    }
    applySize()
    return quality
  }

  function spawnBurst(origin, options) {
    const burst = bursts[burstCursor]
    burstCursor = (burstCursor + 1) % bursts.length
    burst.spawn(origin, profile().particlePoints, options)
  }

  function triggerBloom() {
    if (quality === 'high' && profile().bloom && bloomEnabled) {
      bloomFlash = 1
      preloadPostProcessing()
    }
  }

  function spawnForEvents(events) {
    for (const event of events) {
      if (event.kind === 'land' || event.kind === 'hard-land') {
        if (quality === 'low' && event.impact < 0.3) continue
        spawnBurst(event.position, {
          color: 0xd8c39a,
          speed: 1.6 + event.impact * 3.4,
          up: 1.1,
          size: 0.075 + event.impact * 0.05,
        })
      } else if (event.kind === 'jump' && quality !== 'low') {
        spawnBurst(event.position, { color: 0xfff4d6, speed: 1.4, up: 0.7, gravity: 3.5, size: 0.06 })
      } else if (event.kind === 'finish' && quality === 'high') {
        spawnBurst(event.position, { color: 0xfbbf24, speed: 2.6, up: 2.2, gravity: 2.5 })
        spawnBurst(event.position, { color: 0x38bdf8, speed: 2.2, up: 1.8, gravity: 2.5 })
        triggerBloom()
      }
    }
  }

  function emitMeta(event, origin = body.position) {
    if (disposed || seenMetaIds.has(event.id)) return false
    seenMetaIds.add(event.id)
    if (event.kind === 'personal-best') {
      if (quality !== 'low') spawnBurst(origin, { color: 0xfbbf24, speed: 2.6, up: 2.2, gravity: 2.5 })
      if (quality === 'high') {
        spawnBurst(origin, { color: 0x38bdf8, speed: 2.2, up: 1.8, gravity: 2.5 })
        triggerBloom()
      }
    } else if (event.kind === 'milestone' && quality !== 'low') {
      spawnBurst(origin, { color: 0x38bdf8, speed: 1.8, up: 1.4, gravity: 3.5, size: 0.07 })
    }
    return true
  }

  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
    bloomFlash = 0
    disposeComposer()
    shakeLayer.clear()
  }

  function onContextRestored() {
    if (disposed) return
    contextLost = false
    applySize()
    if (quality === 'high') preloadPostProcessing()
  }

  renderer.domElement?.addEventListener?.('webglcontextlost', onContextLost, false)
  renderer.domElement?.addEventListener?.('webglcontextrestored', onContextRestored, false)

  return {
    update(dt, current, events = []) {
      if (disposed) return frame
      frame = juice.update(dt, current, events)
      spawnForEvents(frame.events)
      return frame
    },

    apply() {
      if (disposed || !frame) return
      const scale = composeVisualScale(baseBodyScale, frame.squash)
      body.scale.set(scale.x, scale.y, scale.z)
      shakeLayer.apply(frame.shake)
    },

    render(dt = 1 / 60) {
      if (disposed) return
      if (contextLost) {
        shakeLayer.clear()
        return
      }
      try {
        for (const burst of bursts) burst.update(dt)
        if (bloomFlash > 0 && quality === 'high' && profile().bloom && bloomEnabled) {
          ensureComposer()
          if (bloomPass) bloomPass.strength = 0.55 + bloomFlash * 0.7
          if (composer) composer.render()
          else renderer.render(scene, camera)
        } else {
          renderer.render(scene, camera)
        }
        bloomFlash = Math.max(0, bloomFlash - dt * 1.8)
        if (bloomFlash === 0) disposeComposer()
      } finally {
        shakeLayer.clear()
      }
    },

    setSize(width, height) {
      logicalWidth = Math.max(1, width)
      logicalHeight = Math.max(1, height)
      applySize()
    },

    setQuality,

    toggleBloom() {
      bloomEnabled = !bloomEnabled
      if (!bloomEnabled) {
        bloomFlash = 0
        disposeComposer()
      } else if (quality === 'high') {
        postProcessingUnavailable = false
        preloadPostProcessing()
      }
      return bloomEnabled
    },

    toggleAutoQuality() {
      autoQuality = !autoQuality
      return autoQuality
    },

    emitMeta,

    get quality() { return quality },
    get renderScale() { return profile().renderScale },
    get postProcessingCreated() { return composer !== null },
    get isContextLost() { return contextLost },
    get frame() { return frame },

    observeFps(fps, dt) {
      if (!autoQuality || disposed) return
      if (fps < 45) {
        lowFpsSeconds += dt
        highFpsSeconds = 0
      } else if (fps > 55) {
        highFpsSeconds += dt
        lowFpsSeconds = 0
      } else {
        lowFpsSeconds = 0
        highFpsSeconds = 0
      }
      if (lowFpsSeconds > 2) {
        const index = QUALITY_ORDER.indexOf(quality)
        if (index > 0) setQuality(QUALITY_ORDER[index - 1])
        else lowFpsSeconds = 0
      }
      if (highFpsSeconds > 8) {
        const index = QUALITY_ORDER.indexOf(quality)
        if (index >= 0 && index < QUALITY_ORDER.length - 1) setQuality(QUALITY_ORDER[index + 1])
        else highFpsSeconds = 0
      }
    },

    reset(spawnY) {
      if (disposed) return
      juice.reset(spawnY)
      frame = null
      bloomFlash = 0
      disposeComposer()
      resetBodyScale()
      shakeLayer.clear()
      seenMetaIds.clear()
      for (const burst of bursts) burst.reset()
    },

    dispose() {
      if (disposed) return
      renderer.domElement?.removeEventListener?.('webglcontextlost', onContextLost, false)
      renderer.domElement?.removeEventListener?.('webglcontextrestored', onContextRestored, false)
      bloomFlash = 0
      disposeComposer()
      for (const burst of bursts) burst.dispose()
      resetBodyScale()
      shakeLayer.dispose()
      seenMetaIds.clear()
      frame = null
      disposed = true
    },
  }
}
