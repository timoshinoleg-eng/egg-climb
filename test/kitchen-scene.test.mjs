import assert from 'node:assert/strict'
import test from 'node:test'
import { KitchenScene, kinematicRenderCenter, projectKitchenPoint, writeBoxCorners } from '../dist/render/kitchen-scene.js'
import { KITCHEN_LEVEL, KITCHEN_LEVEL_DEFINITION as LEVEL } from '../dist/sim/level.js'
import { LocalSimulationHost } from '../dist/host/local-host.js'
import { KITCHEN_OPTIONS } from '../dist/game/kitchen-run.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { ParticlePool } from '../dist/render/arcade-effects.js'
import { Juice } from '../dist/render/juice.js'

const snapshot=(tick,gameplay={})=>({tick,identity:{levelId:KITCHEN_LEVEL.id,levelVersion:KITCHEN_LEVEL.version,levelFormatVersion:KITCHEN_LEVEL.formatVersion,levelHash:KITCHEN_LEVEL.hash},
  gameplay:{completionTick:null,activeContinuousForceZoneIds:[],activatedLaunchZoneIds:[],launchZoneInside:[false],...gameplay}})

test('moving cabinet rendering interpolates authored tick positions, including reversals and reset',()=>{
  const box=LEVEL.kinematicBoxes[0]
  assert.equal(kinematicRenderCenter(box,0,0,1).y,4.15)
  assert.equal(kinematicRenderCenter(box,60,60,1).y,4.775)
  assert.equal(kinematicRenderCenter(box,119,120,1).y,5.4)
  assert.equal(kinematicRenderCenter(box,239,240,1).y,4.15)
  const halfway=kinematicRenderCenter(box,0,120,.5)
  assert.equal(halfway.y,4.775);assert.equal(halfway.x,22.5);assert.equal(halfway.z,-4)
  assert.equal(kinematicRenderCenter(box,0,120,NaN).y,4.15)
})

test('projection keeps all three world axes visible without mutating input values',()=>{
  const camera={x:0,y:0,z:0,scale:10},point=Object.freeze({x:0,y:0,z:0})
  const base=projectKitchenPoint(point,camera,400,600)
  const right=projectKitchenPoint({x:1,y:0,z:0},camera,400,600)
  const up=projectKitchenPoint({x:0,y:1,z:0},camera,400,600)
  const front=projectKitchenPoint({x:0,y:0,z:1},camera,400,600)
  assert.equal(right.x-base.x,10);assert.equal(up.y-base.y,-10)
  assert.ok(front.x<base.x);assert.ok(front.y>base.y);assert.ok(front.depth>base.depth)
})

test('rendered boxes use all eight canonical corners and respect authored rotation',()=>{
  const corners=new Float64Array(24),box={halfExtents:[1,2,3],rotation:[0,0,0,1]}
  writeBoxCorners(corners,box,{x:4,y:5,z:6})
  assert.deepEqual([...corners.slice(0,3)],[3,3,3]);assert.deepEqual([...corners.slice(21)],[5,7,9])
  writeBoxCorners(corners,{...box,rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},{x:0,y:0,z:0})
  assert.ok(Math.abs(corners[0]-2)<1e-12);assert.ok(Math.abs(corners[1]+1)<1e-12)
  assert.throws(()=>writeBoxCorners(new Float64Array(3),box,{x:0,y:0,z:0}),/eight/)
})

test('Kitchen view observes steam and Finish markers instead of guessing from egg velocity',()=>{
  const scene=new KitchenScene()
  scene.update(snapshot(0),snapshot(1,{activeContinuousForceZoneIds:['coffee-steam']}),1)
  assert.equal(scene.steamActive,true);assert.equal(scene.completionTick,null)
  scene.update(snapshot(1),snapshot(2,{completionTick:2}),1)
  assert.equal(scene.steamActive,false);assert.equal(scene.completionTick,2)
  scene.update(snapshot(0),snapshot(0),1)
  assert.equal(scene.cabinetY,4.15);assert.equal(scene.completionTick,null)
})

test('all level-identity fields must match before Kitchen geometry is rendered',()=>{
  for(const field of ['levelId','levelVersion','levelFormatVersion','levelHash']){
    const current=snapshot(1);current.identity[field]='wrong'
    assert.throws(()=>new KitchenScene().update(snapshot(0),current,1),/canonical Kitchen snapshot/)
  }
})

test('renderer state updates cannot alter canonical definitions or simulation fingerprints',async()=>{
  const definition=JSON.stringify(LEVEL),host=new LocalSimulationHost(KITCHEN_OPTIONS),scene=new KitchenScene()
  let previous=await host.init()
  try{
    const frame=await host.advance(Array.from({length:60},()=>NEUTRAL_INPUT)),hash=await host.fingerprint()
    for(let i=0;i<100;i++)scene.update(previous,frame.current,i/100)
    assert.equal(await host.fingerprint(),hash);assert.equal(JSON.stringify(LEVEL),definition)
    assert.equal(scene.boxes.length,LEVEL.staticBoxes.length+LEVEL.kinematicBoxes.length)
  }finally{await host.free()}
})

test('3D steam remains a bounded presentation pool and reset clears depth state',()=>{
  const particles=new ParticlePool(160)
  particles.spawn(19.5,5,'steam',1000,-4)
  assert.equal(particles.activeCount,160)
  const y=particles.y[0];particles.update(.1);assert.ok(particles.y[0]>y)
  assert.ok(particles.z.every(Number.isFinite))
  particles.reset();assert.ok(particles.z.every(value=>value===0));assert.ok(particles.vz.every(value=>value===0))
  assert.equal(particles.activeCount,0)
})

test('a canonical launch cue stretches once without becoming a simulated jump',()=>{
  const juice=new Juice(),current={position:{x:18,y:4,z:-4},linearVelocity:{x:0,y:0,z:0}}
  const event={id:'0:1:launch:0',attemptId:0,tick:1,ordinal:0,kind:'launch',zoneId:'toaster-launch',position:current.position}
  const first=juice.update(1/60,current,[event]),repeat=juice.update(0,current,[event])
  assert.equal(first.events.length,1);assert.ok(first.squash.y>1);assert.equal(repeat.events.length,0)
  assert.deepEqual(repeat.squash,first.squash)
})
