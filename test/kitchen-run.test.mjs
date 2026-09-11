import assert from 'node:assert/strict'
import test from 'node:test'
import { KitchenRun, KITCHEN_OPTIONS, KITCHEN_ROUND_RULES, isOutsideKitchenBounds, KITCHEN_BEST_SCORE_KEY } from '../dist/game/kitchen-run.js'
import { LocalSimulationHost } from '../dist/host/local-host.js'
import { KITCHEN_LEVEL, KITCHEN_LEVEL_DEFINITION } from '../dist/sim/level.js'
import { PHYSICS_V1 } from '../dist/sim/physics-presets.js'
import { DEFAULT_FEEL } from '../dist/sim/feel-presets.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'
import { BEST_SCORE_KEY } from '../dist/game/storage.js'
import { kitchenWitnessInputs, kitchenSteamInputs } from './support/kitchen-inputs.mjs'
import { gameMode } from '../play/modes.js'

async function step(game,input=NEUTRAL_INPUT){game.tick(1/60,()=>input);await game.settled()}

test('Kitchen play mode selects canonical content, full 3D controls and a separate local best',()=>{
  assert.equal(KITCHEN_OPTIONS.level,KITCHEN_LEVEL)
  assert.equal(KITCHEN_OPTIONS.preset,PHYSICS_V1)
  assert.equal(KITCHEN_OPTIONS.feel,DEFAULT_FEEL)
  assert.equal(KITCHEN_OPTIONS.fixtureStaticBoxes,undefined)
  assert.equal(KITCHEN_OPTIONS.initialEgg,undefined)
  assert.notEqual(KITCHEN_BEST_SCORE_KEY,BEST_SCORE_KEY)
  const mode=gameMode('kitchen')
  assert.equal(mode.level,KITCHEN_LEVEL);assert.equal(mode.planar,false);assert.equal(mode.Run,KitchenRun)
  assert.equal(gameMode('untrusted/path').id,'garden')
})

test('standing on the Kitchen spawn table cannot farm score or a landing bonus',async()=>{
  const game=new KitchenRun(new LocalSimulationHost(KITCHEN_OPTIONS));await game.init();game.start()
  try{
    for(let i=0;i<80;i++)await step(game)
    assert.equal(game.phase,'playing');assert.equal(game.current.physics.grounded,true)
    assert.equal(game.score.points,0);assert.equal(game.score.combo,0);assert.equal(game.score.bonus,0)
  }finally{await game.dispose()}
})

test('the Kitchen win rule requires a valid authoritative completion latch, not height or overlap',()=>{
  const snapshot={tick:12,position:{x:27,y:6.4,z:-4},physics:{grounded:true},gameplay:{completionTick:null}}
  assert.equal(KITCHEN_ROUND_RULES.completion(snapshot),null)
  for(const invalid of [0,-1,13,NaN,Infinity])assert.equal(KITCHEN_ROUND_RULES.completion({...snapshot,gameplay:{completionTick:invalid}}),null)
  assert.equal(KITCHEN_ROUND_RULES.completion({...snapshot,gameplay:{completionTick:11}}),'finish')
})

test('Kitchen bounds include the entire 3D route and do not reuse garden planar limits',()=>{
  for(const box of [...KITCHEN_LEVEL_DEFINITION.staticBoxes,...KITCHEN_LEVEL_DEFINITION.kinematicBoxes]){
    assert.equal(isOutsideKitchenBounds({position:{x:box.center[0],y:box.center[1]+1,z:box.center[2]}}),false)
  }
  assert.equal(isOutsideKitchenBounds({position:{x:27,y:10,z:-8}}),false)
  assert.equal(isOutsideKitchenBounds({position:{x:10,y:-2,z:-4}}),true)
  for(const axis of ['x','y','z']){const position={x:10,y:3,z:-4};position[axis]=NaN;assert.equal(isOutsideKitchenBounds({position}),true)}
})

test('KitchenRun observes the witness Finish at tick 1167 and preserves exact canonical physics',async()=>{
  const host=new LocalSimulationHost(KITCHEN_OPTIONS),reference=new LocalSimulationHost(KITCHEN_OPTIONS)
  const game=new KitchenRun(host)
  await game.init();await reference.init();game.start()
  const inputs=kitchenWitnessInputs()
  try{
    let expected
    for(const input of inputs){
      await step(game,input);expected=(await reference.advance([input])).current
      if(game.phase==='over')break
    }
    assert.equal(game.reason,'finish');assert.equal(game.current.tick,1167)
    assert.equal(game.current.gameplay.completionTick,1167)
    assert.deepEqual(game.current,expected)
    assert.equal(await host.fingerprint(),await reference.fingerprint())
    assert.equal(game.pendingCount,0)
    const tick=game.current.tick;await step(game,{...NEUTRAL_INPUT,moveX:1});assert.equal(game.current.tick,tick)
  }finally{await game.dispose();await reference.free()}
})

test('keyboard-only pulse controls reach the same canonical Kitchen Finish without a test-only input API',async()=>{
  const inputs=kitchenWitnessInputs(true)
  assert.ok(inputs.every(input=>[-1,0,1].includes(input.moveX)&&[-1,0,1].includes(input.moveZ)))
  const game=new KitchenRun(new LocalSimulationHost(KITCHEN_OPTIONS));await game.init();game.start()
  try{
    for(const input of inputs){await step(game,input);if(game.phase==='over')break}
    assert.equal(game.reason,'finish');assert.equal(game.current.gameplay.completionTick,1167)
  }finally{await game.dispose()}
})

test('Kitchen restart clears Finish, launch membership, route score and physics state',async()=>{
  const host=new LocalSimulationHost(KITCHEN_OPTIONS),game=new KitchenRun(host)
  await game.init();const initial=game.current,hash=await host.fingerprint();game.start()
  try{
    for(const input of kitchenWitnessInputs()){await step(game,input);if(game.phase==='over')break}
    assert.equal(game.reason,'finish')
    await Promise.all([game.restart(),game.restart()])
    assert.equal(game.phase,'ready');assert.deepEqual(game.current,initial)
    assert.equal(await host.fingerprint(),hash)
    assert.equal(game.score.points,0);assert.equal(game.score.bonus,0);assert.equal(game.score.highestLandingMm,2000)
    assert.equal(game.reason,null);assert.equal(game.current.gameplay.completionTick,null)
    assert.deepEqual(game.current.gameplay.launchZoneInside,[false])
  }finally{await game.dispose()}
})


test('the lower keyboard route genuinely enters steam without changing the canonical world',async()=>{
  const game=new KitchenRun(new LocalSimulationHost(KITCHEN_OPTIONS));await game.init();game.start()
  let launched=false,firstSteam=null
  try{
    for(const input of kitchenSteamInputs()){
      await step(game,input)
      launched ||= game.current.gameplay.activatedLaunchZoneIds.length>0
      if(game.current.gameplay.activeContinuousForceZoneIds.length)firstSteam??=game.current.tick
    }
    assert.equal(firstSteam,901);assert.equal(launched,true)
    assert.deepEqual(game.current.gameplay.activeContinuousForceZoneIds,['coffee-steam'])
    assert.equal(game.phase,'playing');assert.equal(game.current.identity.levelHash,KITCHEN_LEVEL.hash)
  }finally{await game.dispose()}
})
