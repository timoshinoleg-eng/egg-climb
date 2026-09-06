import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as THREE from 'three'
import { createCameraShakeLayer, createJuiceView } from '../debug/juice-view.js'

class FakeCanvas {
  constructor() { this.listeners = new Map() }
  addEventListener(type, listener) { const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners) }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  count(type) { return this.listeners.get(type)?.size ?? 0 }
}
function fakeRenderer() { const domElement = new FakeCanvas(); return { domElement, sizes: [], renders: 0, setSize(width, height, updateStyle) { this.sizes.push([width, height, updateStyle]) }, render() { this.renders += 1 } } }
function jumpEvent() { return { id: '0:1:jump:0', attemptId: 0, tick: 1, ordinal: 0, kind: 'jump', source: 'support', strength: 3, position: { x: 0, y: 1, z: 0 } } }
const snapshot = { position: { x: 0, y: 1, z: 0 }, linearVelocity: { x: 0, y: 4, z: 0 } }

test('camera shake rig never feeds temporary offsets back into base camera transform', () => {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); camera.position.set(1, 2, 3); camera.rotation.set(0.2, -0.1, 0.05); scene.add(camera)
  const basePosition = camera.position.clone(); const baseQuaternion = camera.quaternion.clone(); const layer = createCameraShakeLayer({ scene, camera })
  for (let i = 0; i < 100; i += 1) { layer.apply({ x: i * 0.001, y: -i * 0.001, roll: i * 0.0002 }); layer.clear(); assert.ok(camera.position.distanceTo(basePosition) < 1e-12); assert.ok(1 - Math.abs(camera.quaternion.dot(baseQuaternion)) < 1e-12); assert.deepEqual(layer.rig.position.toArray(), [0, 0, 0]) }
  layer.dispose(); assert.equal(camera.parent, scene); assert.ok(camera.position.distanceTo(basePosition) < 1e-12)
})

test('view applies squash relative to captured base scale and reset restores it exactly', () => {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); scene.add(camera); const body = new THREE.Group(); body.scale.set(0.92, 1.18, 0.92); scene.add(body); const renderer = fakeRenderer(); const view = createJuiceView({ renderer, scene, camera, body })
  view.update(1 / 60, snapshot, [jumpEvent()]); view.apply(); assert.notDeepEqual(body.scale.toArray(), [0.92, 1.18, 0.92]); view.render(1 / 60); view.reset(1); assert.deepEqual(body.scale.toArray(), [0.92, 1.18, 0.92]); view.dispose(); view.dispose(); assert.deepEqual(body.scale.toArray(), [0.92, 1.18, 0.92]); assert.equal(camera.parent, scene)
})

test('medium/low render path never constructs or runs post-processing', () => {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); scene.add(camera); const body = new THREE.Group(); scene.add(body); const renderer = fakeRenderer(); const view = createJuiceView({ renderer, scene, camera, body })
  assert.equal(view.quality, 'medium'); assert.equal(view.postProcessingCreated, false); view.setSize(1000, 500); assert.deepEqual(renderer.sizes.at(-1), [850, 425, false]); view.render(1 / 60); assert.equal(view.postProcessingCreated, false); assert.equal(renderer.renders, 1)
  view.setQuality('low'); view.emitMeta({ id: 'pb-low', kind: 'personal-best', value: 12 }); view.render(1 / 60); assert.equal(view.postProcessingCreated, false); assert.deepEqual(renderer.sizes.at(-1), [700, 350, false]); assert.equal(renderer.renders, 2); view.dispose()
})

test('post-processing addons stay behind dynamic high-tier imports', async () => {
  const source = await readFile(new URL('../debug/juice-view.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /^import .*postprocessing\//m)
  assert.match(source, /import\('three\/addons\/postprocessing\/EffectComposer\.js'\)/)
  assert.match(source, /import\('three\/addons\/postprocessing\/UnrealBloomPass\.js'\)/)
})

test('context loss prevents rendering, restore provides a recovery path, dispose removes listeners', () => {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); scene.add(camera); const body = new THREE.Group(); scene.add(body); const renderer = fakeRenderer(); const view = createJuiceView({ renderer, scene, camera, body }); let prevented = false
  assert.equal(renderer.domElement.count('webglcontextlost'), 1); assert.equal(renderer.domElement.count('webglcontextrestored'), 1); renderer.domElement.dispatch('webglcontextlost', { preventDefault() { prevented = true } }); assert.equal(prevented, true); assert.equal(view.isContextLost, true); view.render(1 / 60); assert.equal(renderer.renders, 0)
  renderer.domElement.dispatch('webglcontextrestored'); assert.equal(view.isContextLost, false); view.render(1 / 60); assert.equal(renderer.renders, 1); view.dispose(); view.dispose(); assert.equal(renderer.domElement.count('webglcontextlost'), 0); assert.equal(renderer.domElement.count('webglcontextrestored'), 0)
})
