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

function kitchenWitnessInputEvents(finishTick, jumpInterval = 12, moveX = 1) {
  const events = [{ tick: 0, seq: 0, kind: 'move', moveX, moveZ: 0 }]
  if (jumpInterval !== null) {
    for (let tick = jumpInterval; tick + 1 < finishTick; tick += jumpInterval) {
      events.push({ tick, seq: 0, kind: 'jump', down: true })
      events.push({ tick: tick + 1, seq: 0, kind: 'jump', down: false })
    }
  }
  return events
}

function withCollection(name, value) {
  return { ...KITCHEN_LEVEL_DEFINITION, [name]: value }
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

test('Kitchen authored-input witness candidates identify a real player-driven completion', async () => {
  const finishTick = 1200
  const candidates = []
  for (const moveX of [0.5, 0.75, 1]) {
    for (const jumpInterval of [null, 6, 9, 12, 18, 24, 30]) {
      const inputEvents = kitchenWitnessInputEvents(finishTick, jumpInterval, moveX)
      const result = await runReplay({ header: replayHeaderForLevel(KITCHEN_LEVEL), inputEvents, finishTick })
      candidates.push({ moveX, jumpInterval, inputEvents, result })
      console.log(`[kitchen-candidate] moveX=${moveX} jump=${jumpInterval ?? 'none'} completed=${result.completed} completionTick=${result.completionTick} x=${result.snapshot.position.x} y=${result.snapshot.position.y} maxHeightMm=${result.maxHeightMm} fingerprint=${result.fingerprint}`)
    }
  }
  const winner = candidates.find(candidate => candidate.result.completed)
  assert.ok(winner, 'No authored-input Kitchen witness completed within the candidate matrix')
  assert.ok(winner.inputEvents.length > 0)
  assert.ok(Number.isInteger(winner.result.completionTick) && winner.result.completionTick > 0 && winner.result.completionTick < finishTick)
})
