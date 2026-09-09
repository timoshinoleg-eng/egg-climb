import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOUNDATION_LEVEL,
  KITCHEN_LEVEL,
  KITCHEN_LEVEL_DEFINITION,
  KITCHEN_LEVEL_HASH,
  NEUTRAL_INPUT,
  createSimulation,
  kinematicOffsetAtTick,
  replayHeaderForLevel,
  resolveTrustedLevel,
  runReplay,
  assertLevelDefinition,
  advanceLaunchZoneEdge,
} from '../dist/sim/index.js'
import { canonicalLevelSha256 } from '../dist/server/daily-contracts.js'

const initialEgg = position => ({ position, rotation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] })

function withCollection(name, value) {
  return { ...KITCHEN_LEVEL_DEFINITION, [name]: value }
}

function appendReplayEvent(events, tick, event) {
  const last = events.at(-1)
  const seq = last?.tick === tick ? last.seq + 1 : 0
  events.push({ tick, seq, ...event })
}

async function discoverKitchenWitness({ moveMagnitude, finishMoveMagnitude, jumpCooldown }) {
  const finishTick = 1800
  const routeTargets = [13, 15.5, 18, 20.5, 22.5, 24.5, 27]
  const sim = await createSimulation({ level: KITCHEN_LEVEL })
  const events = []
  let moveX = 0
  let jumpHeld = false
  let lastJumpTick = -1000
  let targetIndex = 0
  let maxX = -Infinity
  let maxY = -Infinity
  try {
    for (let tick = 0; tick < finishTick; tick += 1) {
      const snapshot = sim.snapshot()
      maxX = Math.max(maxX, snapshot.position.x)
      maxY = Math.max(maxY, snapshot.position.y)
      if (snapshot.gameplay.completionTick !== null) {
        return { completed: true, completionTick: snapshot.gameplay.completionTick, terminalTick: tick, events, maxX, maxY, fingerprint: sim.fingerprint() }
      }

      while (targetIndex < routeTargets.length - 1 && snapshot.position.x >= routeTargets[targetIndex] - 0.35) targetIndex += 1
      const targetX = routeTargets[targetIndex]
      const error = targetX - snapshot.position.x
      const magnitude = targetIndex === routeTargets.length - 1 ? finishMoveMagnitude : moveMagnitude
      const desiredMoveX = Math.abs(error) <= 0.2 ? 0 : Math.sign(error) * magnitude
      if (desiredMoveX !== moveX) {
        moveX = desiredMoveX
        appendReplayEvent(events, tick, { kind: 'move', moveX, moveZ: 0 })
      }

      let jumpDown = false
      let jumpUp = false
      if (jumpHeld) {
        jumpHeld = false
        jumpUp = true
        appendReplayEvent(events, tick, { kind: 'jump', down: false })
      } else if (snapshot.physics.grounded && tick - lastJumpTick >= jumpCooldown && snapshot.position.x < 26.6) {
        jumpHeld = true
        jumpDown = true
        lastJumpTick = tick
        appendReplayEvent(events, tick, { kind: 'jump', down: true })
      }

      sim.step({ moveX, moveZ: 0, jumpDown, jumpUp })
    }
    const snapshot = sim.snapshot()
    maxX = Math.max(maxX, snapshot.position.x)
    maxY = Math.max(maxY, snapshot.position.y)
    return { completed: false, completionTick: null, terminalTick: finishTick, events, maxX, maxY, x: snapshot.position.x, y: snapshot.position.y, fingerprint: sim.fingerprint() }
  } finally {
    sim.free()
  }
}

test('Kitchen v2 canonical identity is stable and trusted resolution fails closed', async () => {
  assert.equal(KITCHEN_LEVEL_DEFINITION.formatVersion, 2)
  assert.equal(await canonicalLevelSha256(KITCHEN_LEVEL_DEFINITION), KITCHEN_LEVEL_HASH)
  assert.equal(resolveTrustedLevel(replayHeaderForLevel(KITCHEN_LEVEL)), KITCHEN_LEVEL)
  assert.equal(resolveTrustedLevel(replayHeaderForLevel(FOUNDATION_LEVEL)), FOUNDATION_LEVEL)
  assert.equal(Object.isFrozen(KITCHEN_LEVEL_DEFINITION.launchZones[0].impulse), true)
  const header = replayHeaderForLevel(KITCHEN_LEVEL)
  for (const [field, value] of [['levelVersion', 99], ['levelFormatVersion', 1], ['levelHash', 'bad'], ['generatorVersion', 99], ['rulesetHash', 'bad'], ['seed', 99]]) {
    assert.throws(() => resolveTrustedLevel({ ...header, [field]: value }))
  }
  assert.throws(() => resolveTrustedLevel({ ...header, levelId: 'unknown' }), /Unknown authoritative level/)
})

test('level format validation is exact and fail-closed for every primitive type', async () => {
  assert.doesNotThrow(() => assertLevelDefinition(KITCHEN_LEVEL_DEFINITION))
  assert.throws(() => assertLevelDefinition({ ...KITCHEN_LEVEL_DEFINITION, formatVersion: 3 }), /Unsupported level format/)
  assert.throws(() => assertLevelDefinition({ ...KITCHEN_LEVEL_DEFINITION, ignoredMechanic: [] }), /Unsupported level fields/)

  const staticBox = KITCHEN_LEVEL_DEFINITION.staticBoxes[0]
  const { friction: _staticFriction, ...staticWithoutFriction } = staticBox
  assert.throws(() => assertLevelDefinition(withCollection('staticBoxes', [staticWithoutFriction, ...KITCHEN_LEVEL_DEFINITION.staticBoxes.slice(1)])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('staticBoxes', [{ ...staticBox, unknown: true }, ...KITCHEN_LEVEL_DEFINITION.staticBoxes.slice(1)])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('staticBoxes', [{ ...staticBox, impulse: [0, 1, 0] }, ...KITCHEN_LEVEL_DEFINITION.staticBoxes.slice(1)])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('staticBoxes', [{ ...staticBox, halfExtents: [1, 0, 1] }, ...KITCHEN_LEVEL_DEFINITION.staticBoxes.slice(1)])), /half extents/)

  const kinematic = KITCHEN_LEVEL_DEFINITION.kinematicBoxes[0]
  const { motion: _motion, ...kinematicWithoutMotion } = kinematic
  assert.throws(() => assertLevelDefinition(withCollection('kinematicBoxes', [kinematicWithoutMotion])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('kinematicBoxes', [{ ...kinematic, unexpected: 1 }])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('kinematicBoxes', [{ ...kinematic, motion: { ...kinematic.motion, axis: [0, 2, 0] } }])), /cardinal unit vector/)
  assert.throws(() => assertLevelDefinition(withCollection('kinematicBoxes', [{ ...kinematic, motion: { ...kinematic.motion, distance: -1 } }])), /kinematic distance/)

  const steam = KITCHEN_LEVEL_DEFINITION.continuousForceZones[0]
  const { impulsePerTick: _steamImpulse, ...steamWithoutImpulse } = steam
  assert.throws(() => assertLevelDefinition(withCollection('continuousForceZones', [steamWithoutImpulse])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('continuousForceZones', [{ ...steam, impulse: [0, 1, 0] }])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('continuousForceZones', [{ ...steam, impulsePerTick: [0, Number.NaN, 0] }])), /continuous force impulse/)

  const launch = KITCHEN_LEVEL_DEFINITION.launchZones[0]
  const { impulse: _launchImpulse, ...launchWithoutImpulse } = launch
  assert.throws(() => assertLevelDefinition(withCollection('launchZones', [launchWithoutImpulse])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('launchZones', [{ ...launch, impulsePerTick: [0, 1, 0] }])), /Unsupported primitive fields/)
  assert.throws(() => assertLevelDefinition(withCollection('launchZones', [{ ...launch, id: staticBox.id }])), /duplicate/)

  const finish = KITCHEN_LEVEL_DEFINITION.finishVolumes[0]
  assert.throws(() => assertLevelDefinition(withCollection('finishVolumes', [{ ...finish, impulse: [0, 1, 0] }])), /Unsupported primitive fields/)

  const reversed = { ...KITCHEN_LEVEL_DEFINITION, staticBoxes: [...KITCHEN_LEVEL_DEFINITION.staticBoxes].reverse() }
  assert.notEqual(await canonicalLevelSha256(reversed), KITCHEN_LEVEL_HASH)
})

test('simulation rejects cloned or cross-bound resolved descriptors', async () => {
  await assert.rejects(createSimulation({ level: { ...KITCHEN_LEVEL } }), /trusted resolved level/)
  await assert.rejects(createSimulation({ level: { ...KITCHEN_LEVEL, definition: FOUNDATION_LEVEL.definition } }), /trusted resolved level/)
})

test('kinematic cabinet uses an exact tick triangle wave', () => {
  const box = KITCHEN_LEVEL_DEFINITION.kinematicBoxes[0]
  assert.deepEqual(kinematicOffsetAtTick(box, 0), [0, 0, 0])
  assert.deepEqual(kinematicOffsetAtTick(box, 60), [0, 0.625, 0])
  assert.deepEqual(kinematicOffsetAtTick(box, 120), [0, 1.25, 0])
  assert.deepEqual(kinematicOffsetAtTick(box, 180), [0, 0.625, 0])
  assert.deepEqual(kinematicOffsetAtTick(box, 240), [0, 0, 0])
})

test('kinematic Rapier collider carries the egg reproducibly and resets phase', async () => {
  const box = KITCHEN_LEVEL_DEFINITION.kinematicBoxes[0]
  const options = { level: KITCHEN_LEVEL, initialEgg: initialEgg([box.center[0], box.center[1] + box.halfExtents[1] + 0.65, box.center[2]]) }
  const run = async () => {
    const sim = await createSimulation(options)
    try { for (let tick = 0; tick < 120; tick += 1) sim.step(NEUTRAL_INPUT); return { snapshot: sim.snapshot(), fingerprint: sim.fingerprint() } } finally { sim.free() }
  }
  const first = await run(); const reset = await run()
  assert.deepEqual(first, reset)
  assert.ok(first.snapshot.position.y > box.center[1] + 1)
})

test('steam is local, predominantly vertical, inclusive, and applies once per authoritative tick', async () => {
  const zone = KITCHEN_LEVEL_DEFINITION.continuousForceZones[0]
  assert.ok(zone.halfExtents[0] <= 2)
  assert.ok(zone.impulsePerTick[1] > Math.abs(zone.impulsePerTick[0]))
  assert.ok(zone.impulsePerTick[1] > Math.abs(zone.impulsePerTick[2]))
  const sim = await createSimulation({ level: KITCHEN_LEVEL, initialEgg: initialEgg(zone.center) })
  const boundary = await createSimulation({ level: KITCHEN_LEVEL, initialEgg: initialEgg([zone.center[0] + zone.halfExtents[0], zone.center[1], zone.center[2]]) })
  const outside = await createSimulation({ level: KITCHEN_LEVEL, initialEgg: initialEgg([zone.center[0] + zone.halfExtents[0] + 0.001, zone.center[1], zone.center[2]]) })
  try {
    sim.step(NEUTRAL_INPUT)
    const first = sim.snapshot()
    assert.deepEqual(first.gameplay.activeContinuousForceZoneIds, [zone.id])
    assert.ok(first.linearVelocity.y > 0)
    sim.step(NEUTRAL_INPUT)
    assert.deepEqual(sim.snapshot().gameplay.activeContinuousForceZoneIds, [zone.id])
    boundary.step(NEUTRAL_INPUT)
    outside.step(NEUTRAL_INPUT)
    assert.deepEqual(boundary.snapshot().gameplay.activeContinuousForceZoneIds, [zone.id])
    assert.deepEqual(outside.snapshot().gameplay.activeContinuousForceZoneIds, [])
  } finally { sim.free(); boundary.free(); outside.free() }
})

test('toaster is edge-triggered and reset-by-reconstruction safe', async () => {
  let state = false
  const edgeActivations = []
  for (const inside of [false, true, true, false, true]) {
    const edge = advanceLaunchZoneEdge(state, inside)
    state = edge.inside
    edgeActivations.push(edge.activated)
  }
  assert.deepEqual(edgeActivations, [false, true, false, false, true])
  const zone = KITCHEN_LEVEL_DEFINITION.launchZones[0]
  const options = { level: KITCHEN_LEVEL, initialEgg: initialEgg(zone.center) }
  const sim = await createSimulation(options)
  try {
    sim.step(NEUTRAL_INPUT)
    assert.deepEqual(sim.snapshot().gameplay.activatedLaunchZoneIds, [zone.id])
    for (let tick = 1; tick < 120; tick += 1) {
      sim.step(NEUTRAL_INPUT)
      assert.deepEqual(sim.snapshot().gameplay.activatedLaunchZoneIds, [])
    }
  } finally { sim.free() }
  const reset = await createSimulation(options)
  try { reset.step(NEUTRAL_INPUT); assert.deepEqual(reset.snapshot().gameplay.activatedLaunchZoneIds, [zone.id]) } finally { reset.free() }
})

test('Finish is post-step, first-tick latched, and Foundation remains incomplete', async () => {
  const volume = KITCHEN_LEVEL_DEFINITION.finishVolumes[0]
  const sim = await createSimulation({ level: KITCHEN_LEVEL, initialEgg: initialEgg(volume.center) })
  try {
    assert.equal(sim.snapshot().gameplay.completionTick, null)
    sim.step(NEUTRAL_INPUT)
    assert.equal(sim.snapshot().gameplay.completionTick, 1)
    sim.step(NEUTRAL_INPUT)
    assert.equal(sim.snapshot().gameplay.completionTick, 1)
  } finally { sim.free() }
  const foundation = await runReplay({ header: replayHeaderForLevel(FOUNDATION_LEVEL), inputEvents: [], finishTick: 2 })
  assert.equal(foundation.completed, false)
  assert.equal(foundation.completionTick, null)
})

test('Kitchen neutral replay does not self-complete', async () => {
  const neutral = await runReplay({ header: replayHeaderForLevel(KITCHEN_LEVEL), inputEvents: [], finishTick: 600 })
  assert.equal(neutral.completed, false)
  assert.equal(neutral.completionTick, null)
})

test('Kitchen grounded-feedback finder discovers a player-driven witness', async () => {
  const candidates = []
  for (const moveMagnitude of [0.55, 0.7, 0.85, 1]) {
    for (const finishMoveMagnitude of [0.2, 0.35, 0.5]) {
      for (const jumpCooldown of [4, 8, 12, 18]) {
        const result = await discoverKitchenWitness({ moveMagnitude, finishMoveMagnitude, jumpCooldown })
        candidates.push({ moveMagnitude, finishMoveMagnitude, jumpCooldown, result })
        console.log(`[kitchen-feedback] move=${moveMagnitude} finishMove=${finishMoveMagnitude} cooldown=${jumpCooldown} completed=${result.completed} completionTick=${result.completionTick} maxX=${result.maxX} maxY=${result.maxY} x=${result.x ?? '-'} y=${result.y ?? '-'} events=${result.events.length} fingerprint=${result.fingerprint}`)
        if (result.completed) console.log(`[kitchen-feedback-events] ${JSON.stringify(result.events)}`)
      }
    }
  }
  const winner = candidates.find(candidate => candidate.result.completed)
  assert.ok(winner, 'No grounded-feedback Kitchen witness completed')
  assert.ok(winner.result.events.length > 0)
  assert.ok(Number.isInteger(winner.result.completionTick) && winner.result.completionTick > 0)
  const replayFinishTick = winner.result.completionTick + 120
  const replayEvents = winner.result.events.filter(event => event.tick < replayFinishTick)
  const replay = await runReplay({ header: replayHeaderForLevel(KITCHEN_LEVEL), inputEvents: replayEvents, finishTick: replayFinishTick })
  assert.equal(replay.completed, true)
  assert.equal(replay.completionTick, winner.result.completionTick)
  console.log(`[kitchen-feedback-replay] finishTick=${replayFinishTick} fingerprint=${replay.fingerprint} completionTick=${replay.completionTick} events=${JSON.stringify(replayEvents)}`)
})
