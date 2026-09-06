import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Juice } from '../dist/render/juice.js'

// Visual Preset v1 — three.js binding for the headless juice core.
// Consume-only view of simulation snapshots (ADR 0001 rule 8): this module
// never feeds anything back into the simulation. Bloom comes from the pinned
// three@0.185.1 examples/jsm chain, so no new dependency is introduced.

const BURST_COUNT = 4
const BURST_POINTS = 72
const BURST_LIFETIME = 0.85

class PointBurst {
  constructor(scene) {
    this.positions = new Float32Array(BURST_POINTS * 3)
    this.velocities = new Float32Array(BURST_POINTS * 3)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
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
    scene.add(this.points)
  }

  spawn(origin, { color = 0xffffff, speed = 3, up = 1.6, gravity = 6, size = 0.085 } = {}) {
    this.material.color.setHex(color)
    this.material.size = size
    this.gravity = gravity
    this.life = 1
    for (let i = 0; i < BURST_POINTS; i += 1) {
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
    if (this.life <= 0) return
    this.life = Math.max(0, this.life - dt / BURST_LIFETIME)
    for (let i = 0; i < BURST_POINTS; i += 1) {
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
}

export function createJuiceView({ renderer, scene, camera, body }) {
  const juice = new Juice()
  const bursts = Array.from({ length: BURST_COUNT }, () => new PointBurst(scene))
  let burstCursor = 0
  let frame = null

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.85)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  let bloomEnabled = true
  let bloomFlash = 0

  let quality = 'high' // high | medium | low
  let autoQuality = true
  let lowFpsSeconds = 0
  let highFpsSeconds = 0

  function spawnBurst(origin, options) {
    const burst = bursts[burstCursor]
    burstCursor = (burstCursor + 1) % bursts.length
    burst.spawn(origin, options)
  }

  function spawnForEvents(events, origin) {
    if (events.landingImpact > 0 && !(quality === 'low' && events.landingImpact < 0.4)) {
      spawnBurst(origin, {
        color: 0xd8c39a,
        speed: 1.6 + events.landingImpact * 3.4,
        up: 1.1,
        size: 0.075 + events.landingImpact * 0.05,
      })
    }
    if (events.jumped && quality !== 'low') {
      spawnBurst(origin, { color: 0xfff4d6, speed: 1.4, up: 0.7, gravity: 3.5, size: 0.06 })
    }
    if (events.newHeightRecord && quality === 'high') {
      spawnBurst(origin, { color: 0xfbbf24, speed: 2.6, up: 2.2, gravity: 2.5 })
      spawnBurst(origin, { color: 0x38bdf8, speed: 2.2, up: 1.8, gravity: 2.5 })
      bloomFlash = 1
    }
  }

  return {
    /**
     * Advance the juice state from a snapshot pair and fire event particles.
     * NOTE: with the current WorkerSimulationHost the UI thread receives only
     * batch-edge snapshots; use this for the first playtest integration and
     * switch to `updateWithEvents` once the worker reports per-tick events
     * (see docs/specs/2026-09-06-visual-preset-v1.md). Returns the JuiceFrame.
     */
    update(dt, prev, curr) {
      frame = juice.update(dt, prev, curr)
      spawnForEvents(frame.events, curr.position)
      return frame
    },

    /**
     * Advance with externally computed contact events — e.g. a worker batch
     * folded via `mergeContactEvents`. Squash/shake still integrate here at
     * the caller's dt; only event detection happens outside.
     */
    updateWithEvents(dt, events, curr) {
      frame = juice.updateWithEvents(dt, events, curr)
      spawnForEvents(frame.events, curr.position)
      return frame
    },

    /** Apply squash and camera shake. Call after the body transform and camera lookAt. */
    apply() {
      if (!frame) return
      body.scale.set(frame.squash.x, frame.squash.y, frame.squash.z)
      camera.translateX(frame.shake.x)
      camera.translateY(frame.shake.y)
      camera.rotateZ(frame.shake.roll)
    },

    /** Render the frame (with bloom on the high quality tier). */
    render(dt = 1 / 60) {
      for (const burst of bursts) burst.update(dt)
      bloomFlash = Math.max(0, bloomFlash - dt * 1.8)
      bloom.strength = 0.55 + bloomFlash * 0.7
      if (bloomEnabled && quality === 'high') composer.render()
      else renderer.render(scene, camera)
    },

    setSize(width, height) {
      composer.setSize(width, height)
    },

    toggleBloom() {
      bloomEnabled = !bloomEnabled
      return bloomEnabled
    },

    toggleAutoQuality() {
      autoQuality = !autoQuality
      if (!autoQuality) quality = 'high'
      return autoQuality
    },

    get quality() {
      return quality
    },

    get frame() {
      return frame
    },

    /**
     * Feed the render-FPS EMA. Tiers drop after 2 s below 45 fps and recover
     * after 8 s above 55 fps (hysteresis against flapping).
     */
    observeFps(fps, dt) {
      if (!autoQuality) return
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
        lowFpsSeconds = 0
        if (quality === 'high') quality = 'medium'
        else if (quality === 'medium') quality = 'low'
      }
      if (highFpsSeconds > 8 && quality !== 'high') {
        highFpsSeconds = 0
        quality = quality === 'low' ? 'medium' : 'high'
      }
    },

    /** Reset per-attempt state; pass the egg spawn height. */
    reset(spawnY) {
      juice.reset(spawnY)
      frame = null
    },
  }
}
