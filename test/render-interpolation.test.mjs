import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { interpolateSnapshots } from '../dist/render/interpolate.js'

function snapshot(position, rotation) {
  return { tick: 0, position, rotation, linearVelocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } }
}

const a = snapshot({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 })
const b = snapshot({ x: 10, y: 4, z: -2 }, { x: 0, y: 0, z: 0, w: -1 })

test('render interpolation is clamped and uses the shortest quaternion representation', () => {
  const mid = interpolateSnapshots(a, b, 0.5)
  assert.deepEqual(mid.position, { x: 5, y: 2, z: -1 })
  assert.deepEqual(mid.rotation, { x: 0, y: 0, z: 0, w: 1 })
  assert.deepEqual(interpolateSnapshots(a, b, -9).position, a.position)
  assert.deepEqual(interpolateSnapshots(a, b, 9).position, b.position)
})

test('debug renderer references pinned local module entries, not a CDN', async () => {
  await access('node_modules/three/build/three.module.js')
  await access('node_modules/@dimforge/rapier3d-deterministic-compat/rapier.mjs')
  const html = await readFile('debug/index.html', 'utf8')
  assert.match(html, /\/node_modules\/three\/build\/three\.module\.js/)
  assert.match(html, /rapier3d-deterministic-compat\/rapier\.mjs/)
  assert.doesNotMatch(html, /https?:\/\//)
})
