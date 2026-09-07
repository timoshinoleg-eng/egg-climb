import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { AttemptHeightTracker, Juice, SquashStretch, TraumaShake, VISUAL_QUALITY_PROFILES, composeVisualScale } from '../dist/render/juice.js'

function snapshot(y = 0, vy = 0) { return { position: { x: 0, y, z: 0 }, linearVelocity: { x: 0, y: vy, z: 0 } } }
function jumpEvent(tick = 1) { return { id: `0:${tick}:jump:0`, attemptId: 0, tick, ordinal: 0, kind: 'jump', source: 'support', strength: 3, position: { x: 0, y: 1, z: 0 } } }
function landEvent(tick = 2, impact = 0.8) { return { id: `0:${tick}:hard-land:0`, attemptId: 0, tick, ordinal: 0, kind: 'hard-land', impact, position: { x: 0, y: 0.6, z: 0 } } }

test('squash compresses on landing, preserves volume and settles back to rest', () => {
  const squash = new SquashStretch(); squash.kick(1)
  const first = squash.update(1 / 60, 0)
  assert.ok(first.y < 0.9, `expected visible compression, got ${first.y}`)
  assert.ok(Math.abs(first.x * first.x * first.y - 1) < 1e-9)
  let scale = first
  for (let i = 0; i < 120; i += 1) scale = squash.update(1 / 60, 0)
  assert.ok(Math.abs(scale.y - 1) < 0.03, `expected settle near 1, got ${scale.y}`)
})

test('squash stays within clamps and air stretch follows vertical speed', () => {
  const squash = new SquashStretch(); squash.kick(1); squash.kick(1)
  for (let i = 0; i < 30; i += 1) { const scale = squash.update(1 / 60, 0); assert.ok(scale.y >= 0.55 && scale.y <= 1.35) }
  squash.reset(); let rising
  for (let i = 0; i < 61; i += 1) rising = squash.update(1 / 60, 8)
  assert.ok(rising.y > 1.08 && rising.y < 1.25)
})

test('visual scale composes from immutable base instead of feeding back modified scale', () => {
  const base = Object.freeze({ x: 0.92, y: 1.18, z: 0.92 }); const effect = { x: 1.1, y: 0.8, z: 1.1 }
  assert.deepEqual(composeVisualScale(base, effect), composeVisualScale(base, effect))
  assert.deepEqual(base, { x: 0.92, y: 1.18, z: 0.92 })
  assert.deepEqual(composeVisualScale(base, { x: 1, y: 1, z: 1 }), base)
})

test('trauma shake is additive state, reacts, fully decays, and reset replays identically', () => {
  const shake = new TraumaShake(); assert.deepEqual(shake.update(1 / 60), { x: 0, y: 0, roll: 0 }); shake.add(0.8)
  let peak = 0
  for (let i = 0; i < 10; i += 1) { const offset = shake.update(1 / 60); peak = Math.max(peak, Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.roll)) }
  assert.ok(peak > 0)
  for (let i = 0; i < 300; i += 1) shake.update(1 / 60)
  assert.deepEqual(shake.update(1 / 60), { x: 0, y: 0, roll: 0 })
  const fresh = new TraumaShake(); shake.reset(); shake.add(0.5); fresh.add(0.5)
  for (let i = 0; i < 30; i += 1) assert.deepEqual(shake.update(1 / 60), fresh.update(1 / 60))
})

test('attempt height tracker is telemetry only and reset is exact', () => {
  const heights = new AttemptHeightTracker(); heights.reset(2); heights.update(2.1); heights.update(1); heights.update(3.2); assert.equal(heights.maxHeight, 3.2); heights.reset(10); assert.equal(heights.maxHeight, 10)
})

test('Juice consumes explicit ordered events once and never invents Personal Best', () => {
  const juice = new Juice(); juice.reset(0); const jump = jumpEvent(1)
  const first = juice.update(1 / 60, snapshot(1.2, 4), [jump]); assert.deepEqual(first.events, [jump]); assert.ok(first.squash.y > 1); assert.equal(first.attemptMaxHeight, 1.2); assert.equal('newHeightRecord' in first, false)
  assert.deepEqual(juice.update(1 / 60, snapshot(1.3, 3), [jump]).events, [])
  const land = landEvent(2); const landed = juice.update(1 / 60, snapshot(0.6, 0), [land]); assert.deepEqual(landed.events, [land]); assert.ok(landed.shake.x !== 0 || landed.shake.y !== 0 || landed.shake.roll !== 0)
})

test('Juice reset clears event cursor, spring, shake and attempt maximum', () => {
  const juice = new Juice(); juice.reset(0); juice.update(1 / 60, snapshot(4, 0), [landEvent(2)]); juice.reset(10)
  const frame = juice.update(1 / 60, snapshot(10, 0), []); assert.deepEqual(frame.events, []); assert.equal(frame.attemptMaxHeight, 10); assert.ok(Math.abs(frame.squash.y - 1) < 1e-12); assert.deepEqual(frame.shake, { x: 0, y: 0, roll: 0 })
})

test('low and medium tiers categorically disable bloom and reduce budgets', () => {
  assert.equal(VISUAL_QUALITY_PROFILES.low.bloom, false); assert.equal(VISUAL_QUALITY_PROFILES.medium.bloom, false); assert.equal(VISUAL_QUALITY_PROFILES.high.bloom, true)
  assert.ok(VISUAL_QUALITY_PROFILES.low.renderScale < VISUAL_QUALITY_PROFILES.medium.renderScale); assert.ok(VISUAL_QUALITY_PROFILES.medium.renderScale < VISUAL_QUALITY_PROFILES.high.renderScale); assert.ok(VISUAL_QUALITY_PROFILES.low.particlePoints < VISUAL_QUALITY_PROFILES.medium.particlePoints)
})

test('juice core has no render, DOM, clock or ambient-random dependencies', async () => {
  const source = await readFile('src/render/juice.ts', 'utf8'); assert.doesNotMatch(source, /from\s+['"]three(?:\/|['"])/); assert.doesNotMatch(source, /\bwindow\b|\bdocument\b/); assert.doesNotMatch(source, /\brequestAnimationFrame\b|\bperformance\.now\b|\bDate\.now\b/); assert.doesNotMatch(source, /\bMath\.random\s*\(/); assert.doesNotMatch(source, /detectContactEvents|mergeContactEvents/)
})

test('juice demo page uses only pinned local modules, not a CDN', async () => {
  const html = await readFile('debug/juice-demo.html', 'utf8'); assert.doesNotMatch(html, /https?:\/\//); assert.match(html, /\/node_modules\/three\/build\/three\.module\.js/); assert.match(html, /\/node_modules\/three\/examples\/jsm\//)
})
