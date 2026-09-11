import assert from 'node:assert/strict'
import test from 'node:test'
import { ParticlePool, FloatingLabels, FrameMeter, canvasPixelRatio } from '../dist/render/arcade-effects.js'
import { SquashStretch } from '../dist/render/juice.js'

test('particle storms recycle a fixed pool and teardown clears every buffer', () => {
  const pool = new ParticlePool(64)
  for (let i = 0; i < 100; i++) pool.spawn(1, 2, ['shell','dust','spark'][i % 3], 1000)
  assert.equal(pool.activeCount, 64); assert.equal(pool.x.length, 64)
  for (let i = 0; i < 15; i++) pool.update(0.1)
  assert.equal(pool.activeCount, 0)
  pool.spawn(0, 0, 'shell', 50); pool.reset(); assert.equal(pool.activeCount, 0)
  for (const buffer of [pool.x,pool.y,pool.vx,pool.vy,pool.life,pool.duration,pool.rotation,pool.size,pool.kind]) assert.equal(buffer.every(value => value === 0), true)
})

test('invalid effect deltas and spawn counts do not create nonfinite geometry', () => {
  const pool = new ParticlePool()
  pool.spawn(0,0,'spark',NaN); pool.spawn(Infinity,0,'shell',10); assert.equal(pool.activeCount,0)
  pool.spawn(0,0,'dust',20); pool.update(NaN); pool.update(Infinity)
  assert.equal(pool.activeCount,20)
  for (const buffer of [pool.x,pool.y,pool.life]) assert.equal(buffer.every(Number.isFinite),true)
  assert.throws(() => new ParticlePool(0),/capacity/)
})

test('floating labels have six reusable slots, expire, and reset cleanly', () => {
  const labels=new FloatingLabels(),slots=[...labels.slots]
  for(let i=0;i<50;i++)labels.spawn(0,1,`+${i}`)
  assert.equal(labels.slots.length,6); assert.deepEqual(labels.slots,slots)
  for(let i=0;i<20;i++)labels.update(0.1)
  assert.equal(labels.slots.every(slot=>slot.life===0),true)
  labels.spawn(1,2,'GREAT!',true);labels.reset()
  assert.equal(labels.slots.every(slot=>slot.life===0&&slot.text===''),true)
})

test('frame metrics measure cadence, retain hitches, and keep bounded history', () => {
  const meter=new FrameMeter()
  for(let i=0;i<120;i++)meter.record(1000/60,1)
  assert.ok(Math.abs(meter.summary().fps-60)<0.01)
  for(let i=0;i<20;i++)meter.record(100,7)
  assert.equal(meter.summary().p95Ms,100);assert.equal(meter.summary().workP95Ms,7)
  for(let i=0;i<300;i++)meter.record(1000/60,1)
  assert.equal(meter.summary().frames,240)
  meter.reset();assert.deepEqual(meter.summary(),{fps:0,p95Ms:0,workP95Ms:0,frames:0})
})

test('retina ratio is bounded by measured quality, not multiplied each resize', () => {
  assert.equal(canvasPixelRatio(3,'high'),2);assert.equal(canvasPixelRatio(2,'medium'),1.5)
  assert.equal(canvasPixelRatio(2,'low'),1);assert.equal(canvasPixelRatio(1,'high'),1)
  assert.equal(canvasPixelRatio(NaN,'high'),1)
})

test('spring integration remains finite through slow frames and settles to its base scale', () => {
  const spring=new SquashStretch();spring.kick(1)
  for(let i=0;i<200;i++){const scale=spring.update(0.1,0);assert.ok(Number.isFinite(scale.y));assert.ok(scale.y>=0.55&&scale.y<=1.35)}
  assert.ok(Math.abs(spring.update(0.1,0).y-1)<1e-8)
  spring.stretchKick();spring.reset();assert.deepEqual(spring.update(0,0),{x:1,y:1,z:1})
})
