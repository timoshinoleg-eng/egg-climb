import assert from 'node:assert/strict'
import test from 'node:test'
import { ArcadeRun } from '../dist/game/arcade-run.js'
import { LocalSimulationHost } from '../dist/host/local-host.js'
import { ARCADE_OPTIONS, ARCADE_LEVEL } from '../dist/game/arcade-level.js'
import { NEUTRAL_INPUT } from '../dist/sim/contracts.js'

const initial = () => ({ tick:0,position:{x:0,y:0.72,z:0},rotation:{x:0,y:0,z:0,w:1},linearVelocity:{x:0,y:0,z:0},angularVelocity:{x:0,y:0,z:0},physics:{grounded:true,supportContactWorld:{x:0,y:0,z:0}} })
class DeferredHost {
  calls=0; resets=0; frees=0; requests=[]
  async init(){return initial()}
  advance(inputs){this.calls++;assert.equal(inputs.length,1);return new Promise((resolve,reject)=>this.requests.push({resolve,reject}))}
  respond(overrides={}){const current={...initial(),tick:1,...overrides};this.requests.shift().resolve({previous:initial(),current,stepped:1,events:[]})}
  async reset(){this.resets++;return initial()}
  async free(){this.frees++}
}

test('pause drops unsent controls and accepts at most the one already-issued tick', async () => {
  const host=new DeferredHost(),game=new ArcadeRun(host)
  await game.init();game.start();game.tick(0.1,()=>NEUTRAL_INPUT)
  assert.equal(host.calls,1);assert.ok(game.pendingCount>0)
  game.pause();assert.equal(game.pendingCount,0)
  game.tick(1,()=>{throw new Error('paused input must not be sampled')})
  host.respond();await game.settled()
  assert.equal(game.phase,'paused');assert.equal(game.current.tick,1);assert.equal(host.calls,1)
  game.resume();game.tick(1/60,()=>NEUTRAL_INPUT);assert.equal(host.calls,2)
  host.respond({tick:2});await game.settled();await game.dispose()
})

test('restart fences stale high-scoring responses and coalesces double clicks', async () => {
  const host=new DeferredHost(),frames=[],game=new ArcadeRun(host,{onFrame:frame=>frames.push(frame)})
  await game.init();game.start();game.tick(0.1,()=>NEUTRAL_INPUT)
  const first=game.restart(),second=game.restart()
  assert.equal(first,second);assert.equal(game.phase,'resetting');assert.equal(game.pendingCount,0)
  host.respond({tick:200,position:{x:0,y:100,z:0}});await first
  assert.equal(host.resets,1);assert.equal(host.calls,1);assert.equal(frames.length,0)
  assert.deepEqual(game.current,initial());assert.equal(game.score.points,0);assert.equal(game.reason,null)
  assert.equal(game.overloadCount,0);assert.equal(game.phase,'ready');await game.dispose()
})

test('a worker failure stops dispatch instead of endlessly polling a dead host', async () => {
  const host=new DeferredHost(),game=new ArcadeRun(host)
  await game.init();game.start();game.tick(0.1,()=>NEUTRAL_INPUT)
  host.requests.shift().reject(new Error('worker failed'));await game.settled()
  assert.equal(game.phase,'error');assert.match(game.error.message,/worker failed/);assert.equal(game.pendingCount,0)
  game.tick(0.1,()=>NEUTRAL_INPUT);assert.equal(host.calls,1)
  await game.restart();assert.equal(game.phase,'ready');assert.equal(game.error,null);await game.dispose()
})

test('dispose is idempotent and a late response cannot revive the round', async () => {
  const host=new DeferredHost(),game=new ArcadeRun(host)
  await game.init();game.start();game.tick(1/60,()=>NEUTRAL_INPUT)
  await game.dispose();await game.dispose();host.respond({tick:100});await game.settled()
  assert.equal(game.phase,'disposed');assert.equal(host.frees,1);assert.equal(game.current.tick,0)
  await game.restart();game.start();game.tick(1,()=>NEUTRAL_INPUT)
  assert.equal(host.calls,1);assert.equal(game.pendingCount,0)
})

test('initialization resolving after disposal cannot reopen the UI', async () => {
  const host=new DeferredHost();let resolveInit
  host.init=()=>new Promise(resolve=>{resolveInit=resolve})
  const game=new ArcadeRun(host),pending=game.init()
  await game.dispose();resolveInit(initial());await pending
  assert.equal(game.phase,'disposed');assert.equal(game.current,undefined)
})

test('local timeout and supported summit stop physics and queued inputs', async () => {
  for(const [reason,overrides] of [
    ['timeout',{tick:60*180}],
    ['summit',{position:{x:3,y:15.6,z:0},physics:{grounded:true,supportContactWorld:{x:3,y:15,z:0}}}],
    ['fall',{position:{x:0,y:-3.1,z:0}}],
  ]){
    const host=new DeferredHost(),game=new ArcadeRun(host)
    await game.init();game.start();game.tick(0.1,()=>NEUTRAL_INPUT);host.respond(overrides);await game.settled()
    assert.equal(game.phase,'over');assert.equal(game.reason,reason);assert.equal(game.pendingCount,0)
    game.tick(0.1,()=>NEUTRAL_INPUT);assert.equal(host.calls,1);await game.dispose()
  }
})

test('exact per-tick scoring does not lose an apex in a delayed transport batch', async () => {
  const host=new DeferredHost(),game=new ArcadeRun(host)
  await game.init();game.start();game.tick(0.05,()=>NEUTRAL_INPUT)
  host.respond({position:{x:0,y:3,z:0}})
  await new Promise(resolve=>setImmediate(resolve))
  host.respond({tick:2,position:{x:0,y:2,z:0}})
  await new Promise(resolve=>setImmediate(resolve))
  host.respond({tick:3,position:{x:0,y:1,z:0}})
  await game.settled();assert.equal(game.score.heightMm,2280);await game.dispose()
})

test('real gameplay and repeated resets restore pose, velocities, feel, score and fingerprint', async () => {
  const host=new LocalSimulationHost(ARCADE_OPTIONS),game=new ArcadeRun(host)
  await game.init();const spawn=game.current,hash=await host.fingerprint()
  try{
    for(let round=0;round<3;round++){
      game.start()
      for(let t=0;t<40;t++){game.tick(1/60,()=>NEUTRAL_INPUT);await game.settled()}
      game.tick(1/60,()=>({...NEUTRAL_INPUT,jumpDown:true}));await game.settled()
      for(let t=0;t<80;t++){game.tick(1/60,()=>NEUTRAL_INPUT);await game.settled()}
      assert.ok(game.score.points>0)
      for(let t=0;t<600&&game.phase==='playing';t++){game.tick(1/60,()=>({...NEUTRAL_INPUT,moveX:-1}));await game.settled()}
      assert.equal(game.phase,'over');assert.equal(game.reason,'fall')
      await game.restart();assert.deepEqual(game.current,spawn);assert.deepEqual(game.previous,spawn)
      assert.equal(await host.fingerprint(),hash);assert.equal(game.score.points,0);assert.equal(game.score.combo,0)
    }
  }finally{await game.dispose()}
})


test('100 queued-input and simultaneous restart cycles restore the exact initial run', async () => {
  const host = new LocalSimulationHost(ARCADE_OPTIONS)
  const game = new ArcadeRun(host)
  await game.init()
  const spawn = game.current
  const fingerprint = await host.fingerprint()
  try {
    for (let round = 0; round < 100; round++) {
      game.start()
      game.tick(0.1, () => ({ ...NEUTRAL_INPUT, moveX: round % 2 ? 1 : -1, jumpDown: true }))
      await Promise.all([game.restart(), game.restart()])
      assert.equal(game.phase, 'ready')
      assert.equal(game.pendingCount, 0)
      assert.equal(game.score.points, 0)
      assert.equal(game.score.combo, 0)
      assert.deepEqual(game.current, spawn)
      assert.deepEqual(game.previous, spawn)
      assert.equal(await host.fingerprint(), fingerprint)
    }
  } finally { await game.dispose() }
})

test('every garden leaf supports a stable landing and legal inputs reach the arcade summit', async () => {
  // This committed steering plan was found by replaying legal inputs from tick
  // zero. It does not teleport bodies, alter a fixture, or bypass collisions.
  // Keep it explicit so accidental level/feel changes cannot silently pass.
  const plan = [
    { runup: 6, air: 125 }, { runup: 0, air: 108 }, { runup: 12, air: 81 },
    { runup: 6, air: 90 }, { runup: 12, air: 73 }, { runup: 0, air: 71 },
    { runup: 18, air: 85 }, { runup: 0, air: 78 }, { runup: 0, air: 84 },
  ]
  assert.equal(plan.length, ARCADE_LEVEL.staticBoxes.length - 1)
  const host = new LocalSimulationHost(ARCADE_OPTIONS)
  const inputs = []
  let current = await host.init()
  const steer = goalX => Math.max(-1, Math.min(1,
    (goalX - current.position.x) * 1.4 - current.linearVelocity.x * 0.65,
  ))
  const step = async input => {
    inputs.push(input)
    current = (await host.advance([input])).current
  }
  try {
    for (let index = 0; index < plan.length; index++) {
      const source = ARCADE_LEVEL.staticBoxes[index]
      const goal = ARCADE_LEVEL.staticBoxes[index + 1]
      const top = goal.center[1] + goal.halfExtents[1]
      for (let tick = 0; tick < 100; tick++) await step({ ...NEUTRAL_INPUT, moveX: steer(source.center[0]) })
      assert.equal(current.physics.grounded, true, `grounded before jump ${index + 1}`)
      for (let tick = 0; tick < plan[index].runup; tick++) await step({ ...NEUTRAL_INPUT, moveX: steer(goal.center[0]) })
      await step({ ...NEUTRAL_INPUT, moveX: steer(goal.center[0]), jumpDown: true })
      let stableTicks = 0
      for (let tick = 0; tick < plan[index].air; tick++) {
        await step({ ...NEUTRAL_INPUT, moveX: steer(goal.center[0]), jumpUp: tick === 0 })
        // A single glancing corner contact must not count as a solved ledge.
        const stable = current.physics.grounded &&
          (current.physics.supportContactWorld?.y ?? -Infinity) >= top - 0.03 &&
          Math.abs(current.position.x - goal.center[0]) < goal.halfExtents[0] - 0.15 &&
          (current.physics.supportNormal?.y ?? 0) > 0.75
        stableTicks = stable ? stableTicks + 1 : 0
      }
      assert.ok(stableTicks >= 12, `stable landing on leaf ${index + 1}`)
    }
  } finally { await host.free() }

  // Run the very same input evidence through the product lifecycle/scorer.
  const game = new ArcadeRun(new LocalSimulationHost(ARCADE_OPTIONS))
  await game.init()
  game.start()
  try {
    for (const input of inputs) {
      game.tick(1 / 60, () => input)
      await game.settled()
      if (game.phase === 'over') break
    }
    assert.equal(game.phase, 'over')
    assert.equal(game.reason, 'summit')
    assert.equal(game.current.tick, 1728)
    assert.equal(game.score.points, 1900)
    assert.equal(game.score.combo, 5)
    assert.equal(game.score.bonus, 350)
    assert.equal(game.pendingCount, 0)
  } finally { await game.dispose() }
})
