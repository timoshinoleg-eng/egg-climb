import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  HeightTracker,
  Juice,
  SquashStretch,
  TraumaShake,
  detectContactEvents,
} from '../dist/render/juice.js'

let tick = 0
function snap(vy, y = 0) {
  tick += 1
  return {
    tick,
    position: { x: 0, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: 0, y: vy, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
  }
}

test('landing is detected from absorbed fall speed and scaled to [0, 1]', () => {
  const hit = detectContactEvents(snap(-8), snap(0.8))
  assert.ok(hit.landingImpact > 0.5 && hit.landingImpact <= 1)
  assert.equal(hit.jumped, false)
})

test('weak contacts below the absorb threshold stay silent', () => {
  const soft = detectContactEvents(snap(-1.6), snap(0.3))
  assert.equal(soft.landingImpact, 0)
  assert.equal(soft.jumped, false)
})

test('takeoff is detected without a false landing', () => {
  const jump = detectContactEvents(snap(0), snap(6))
  assert.equal(jump.jumped, true)
  assert.equal(jump.landingImpact, 0)
})

test('same-tick snapshot pairs never emit events', () => {
  const s = snap(-9)
  assert.deepEqual(detectContactEvents(s, s), { landingImpact: 0, jumped: false })
})

test('squash compresses on landing and settles back to rest', () => {
  const squash = new SquashStretch()
  squash.kick(1)
  const first = squash.update(1 / 60, 0)
  assert.ok(first.y < 0.9, `expected visible compression, got ${first.y}`)
  let scale = first
  for (let i = 0; i < 120; i += 1) scale = squash.update(1 / 60, 0)
  assert.ok(Math.abs(scale.y - 1) < 0.03, `expected settle near 1, got ${scale.y}`)
})

test('squash stays within clamps and preserves volume', () => {
  const squash = new SquashStretch()
  squash.kick(1)
  squash.kick(1)
  for (let i = 0; i < 30; i += 1) {
    const s = squash.update(1 / 60, 0)
    assert.ok(s.y >= 0.55 && s.y <= 1.35, `scale out of clamp: ${s.y}`)
    assert.ok(Math.abs(s.x * s.x * s.y - 1) < 0.35, 'volume roughly preserved')
  }
})

test('air stretch follows vertical speed in both directions', () => {
  const rising = new SquashStretch()
  let s = rising.update(1 / 60, 8)
  for (let i = 0; i < 60; i += 1) s = rising.update(1 / 60, 8)
  assert.ok(s.y > 1.08 && s.y < 1.25, `rising stretch, got ${s.y}`)

  const falling = new SquashStretch()
  for (let i = 0; i < 61; i += 1) s = falling.update(1 / 60, -10)
  assert.ok(s.y < 0.95 && s.y > 0.8, `falling stretch, got ${s.y}`)
})

test('trauma shake is silent at rest, reacts to trauma and fully decays', () => {
  const shake = new TraumaShake()
  assert.deepEqual(shake.update(1 / 60), { x: 0, y: 0, roll: 0 })
  shake.add(0.8)
  let peak = 0
  for (let i = 0; i < 10; i += 1) {
    const o = shake.update(1 / 60)
    peak = Math.max(peak, Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.roll))
  }
  assert.ok(peak > 0, 'shake must produce a visible offset')
  let rest = { x: 1, y: 1, roll: 1 }
  for (let i = 0; i < 300; i += 1) rest = shake.update(1 / 60)
  assert.deepEqual(rest, { x: 0, y: 0, roll: 0 })
})

test('trauma level is clamped regardless of the added amount', () => {
  const shake = new TraumaShake()
  shake.add(3)
  assert.ok(shake.level <= 1)
})

test('height records fire once per margin and respect reset', () => {
  const heights = new HeightTracker()
  heights.reset(0)
  assert.equal(heights.update(0.1), false)
  assert.equal(heights.update(0.31), true)
  assert.equal(heights.update(0.35), false)
  assert.equal(heights.update(0.6), true)
  heights.reset(5)
  assert.equal(heights.update(5.1), false)
})

test('Juice facade turns a fall-then-land sequence into squash, shake and a record', () => {
  const juice = new Juice()
  juice.reset(0)
  const fall = snap(-9, 2)
  const land = snap(0.5, 1.4)
  const frame = juice.update(1 / 60, fall, land)
  assert.ok(frame.events.landingImpact > 0.5)
  assert.equal(frame.events.jumped, false)
  assert.equal(frame.events.newHeightRecord, true)
  assert.ok(frame.squash.y < 0.95, `expected visible squash, got ${frame.squash.y}`)
  assert.ok(frame.maxHeight >= 1.4)
})

test('Juice reset starts a fresh attempt cleanly', () => {
  const juice = new Juice()
  juice.reset(0)
  juice.update(1 / 60, snap(-9, 2), snap(0.5, 1.4))
  juice.reset(10)
  const frame = juice.update(1 / 60, snap(0, 10), snap(0, 10.1))
  assert.equal(frame.events.newHeightRecord, false)
  assert.equal(frame.maxHeight, 10.1)
})

test('juice core has no render, DOM, clock or ambient-random dependencies', async () => {
  const source = await readFile('src/render/juice.ts', 'utf8')
  assert.doesNotMatch(source, /from\s+['"]three(?:\/|['"])/)
  assert.doesNotMatch(source, /\bwindow\b|\bdocument\b/)
  assert.doesNotMatch(source, /\brequestAnimationFrame\b|\bperformance\.now\b|\bDate\.now\b/)
  assert.doesNotMatch(source, /\bMath\.random\s*\(/)
})

test('juice demo page uses only pinned local modules, not a CDN', async () => {
  const html = await readFile('debug/juice-demo.html', 'utf8')
  assert.doesNotMatch(html, /https?:\/\//)
  assert.match(html, /\/node_modules\/three\/build\/three\.module\.js/)
  assert.match(html, /\/node_modules\/three\/examples\/jsm\//)
})
