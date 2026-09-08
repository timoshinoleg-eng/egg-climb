import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  DAILY_RULESET_HASH,
  DEFAULT_REPLAY_LIMITS,
  EMPTY_HEIGHT_SCORE,
  FOUNDATION_LEVEL_DEFINITION,
  FOUNDATION_LEVEL_HASH,
  PHYSICS_V1,
  assertReplay,
  defaultReplayHeader,
  heightMetersToMillimeters,
  recordHeightScore,
  runReplay,
  worldCenterOfMassYFromSnapshot,
} from '../dist/sim/index.js'
import { canonicalJson } from '../dist/server/canonical-json.js'
import { canonicalLevelSha256, canonicalReplaySha256, canonicalRulesetSha256 } from '../dist/server/daily-contracts.js'
import { compareLeaderboardRuns } from '../dist/server/leaderboard-ranking.js'

function replay(events = [], finishTick = 120) {
  return { header: defaultReplayHeader(), inputEvents: events, finishTick }
}

test('fixed-point height conversion and first-at-max semantics are exact', () => {
  assert.equal(heightMetersToMillimeters(0.0015), 2)
  assert.equal(heightMetersToMillimeters(-0.0015), -2)
  assert.equal(heightMetersToMillimeters(1.2344), 1234)
  let score = EMPTY_HEIGHT_SCORE
  score = recordHeightScore(score, 1.2, 0, 1)
  assert.deepEqual(score, { maxHeightMm: 1200, firstTickAtMaxHeight: 1 })
  score = recordHeightScore(score, 1.2004, 0, 2)
  assert.deepEqual(score, { maxHeightMm: 1200, firstTickAtMaxHeight: 1 })
  score = recordHeightScore(score, 1.201, 0, 3)
  assert.deepEqual(score, { maxHeightMm: 1201, firstTickAtMaxHeight: 3 })
  score = recordHeightScore(score, 0.8, 0, 4)
  assert.deepEqual(score, { maxHeightMm: 1201, firstTickAtMaxHeight: 3 })
})

test('runReplay samples historical COM height after completed ticks', async () => {
  const oneTick = await runReplay(replay([], 1))
  const falling = await runReplay(replay([], 120))
  assert.equal(falling.maxHeightMm, oneTick.maxHeightMm)
  assert.equal(falling.firstTickAtMaxHeight, 1)
  const finalComY = worldCenterOfMassYFromSnapshot(falling.snapshot, PHYSICS_V1.egg.centerOfMassY)
  const finalHeightMm = heightMetersToMillimeters(finalComY - FOUNDATION_LEVEL_DEFINITION.origin[1])
  assert.ok(falling.maxHeightMm !== null)
  assert.ok(falling.maxHeightMm > finalHeightMm)
  assert.equal(falling.completed, false)
  assert.equal(falling.completionTick, null)
})

test('zero-tick replay has no invented score or completion', async () => {
  const result = await runReplay(replay([], 0))
  assert.equal(result.snapshot.tick, 0)
  assert.equal(result.maxHeightMm, null)
  assert.equal(result.firstTickAtMaxHeight, null)
  assert.equal(result.completed, false)
  assert.equal(result.completionTick, null)
})

test('replay structural limits reject excess cost and accept boundaries', () => {
  const { maxFinishTick, maxInputEvents, maxInputEventsPerTick } = DEFAULT_REPLAY_LIMITS
  assert.doesNotThrow(() => assertReplay(replay([], maxFinishTick)))
  assert.throws(() => assertReplay(replay([], maxFinishTick + 1)), /maximum finish tick/)
  const boundaryEvents = Array.from({ length: maxInputEvents }, (_, tick) => ({ tick, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }))
  assert.doesNotThrow(() => assertReplay(replay(boundaryEvents, maxInputEvents + 1)))
  assert.throws(() => assertReplay(replay([...boundaryEvents, { tick: maxInputEvents, seq: 0, kind: 'move', moveX: 0, moveZ: 0 }], maxInputEvents + 1)), /maximum input events/)
  const densityBoundary = Array.from({ length: maxInputEventsPerTick }, (_, seq) => ({ tick: 0, seq, kind: 'jump-cancel' }))
  assert.doesNotThrow(() => assertReplay(replay(densityBoundary, 1)))
  assert.throws(() => assertReplay(replay([...densityBoundary, { tick: 0, seq: maxInputEventsPerTick, kind: 'jump-cancel' }], 1)), /events per tick/)
})

test('replay v4 fails closed on canonical Daily-specific identity', async () => {
  const base = defaultReplayHeader()
  for (const [field, value, pattern] of [
    ['levelFormatVersion', base.levelFormatVersion + 1, /Level format/],
    ['levelHash', '0000000000000000000000000000000000000000000000000000000000000000', /Level hash/],
    ['generatorVersion', base.generatorVersion + 1, /Generator version/],
    ['rulesetHash', '0000000000000000000000000000000000000000000000000000000000000000', /Ruleset/],
  ]) await assert.rejects(runReplay({ header: { ...base, [field]: value }, inputEvents: [], finishTick: 1 }), pattern)
})

test('canonical level and ruleset hashes match committed identities', async () => {
  assert.equal(await canonicalLevelSha256(FOUNDATION_LEVEL_DEFINITION), FOUNDATION_LEVEL_HASH)
  assert.equal(await canonicalRulesetSha256(), DAILY_RULESET_HASH)
})

test('canonical replay hash includes only authoritative v4 evidence', async () => {
  const header = {
    protocolVersion: 4,
    simulationVersion: 'sim',
    rapierPackage: 'rapier',
    rapierVersion: '1',
    fingerprintVersion: 1,
    physicsPresetId: 'p',
    physicsPresetVersion: 1,
    physicsPresetHash: 'ph',
    eggColliderId: 'e',
    eggColliderVersion: 1,
    eggColliderHash: 'eh',
    feelPresetId: 'f',
    feelPresetVersion: 1,
    feelPresetHash: 'fh',
    tickRate: 60,
    levelId: 'l',
    levelVersion: 1,
    levelFormatVersion: 1,
    levelHash: 'lh',
    generatorVersion: 1,
    rulesetHash: 'rh',
    seed: 0,
    dimensionMode: '3d',
    controlMode: 'tap',
    assistPresetId: 'none',
  }
  const event = { tick: 0, seq: 0, kind: 'move', moveX: 0.5, moveZ: 0 }
  const fixture = { header, inputEvents: [event], finishTick: 2, clientFingerprint: 'deadbeef' }
  const expected = '353f1086f713080697ed46867345100a0cbabe09b0d70c8a28ef147948b5d0f8'
  assert.equal(canonicalJson({ z: 2, a: 1 }), canonicalJson({ a: 1, z: 2 }))
  assert.equal(await canonicalReplaySha256(fixture), expected)
  assert.equal(await canonicalReplaySha256({
    ...fixture,
    header: { ...header, ignoredHeaderField: 'noise' },
    inputEvents: [{ ...event, ignoredEventField: 'noise' }],
    clientFingerprint: '00000000',
    ignoredTopLevelField: 'noise',
  }), expected)
  assert.notEqual(await canonicalReplaySha256({ ...fixture, finishTick: 3 }), expected)
})

test('leaderboard comparator mirrors completed/partial ordering and stable run id tie-break', () => {
  const incomplete = { runId: 10n, maxHeightMm: 9000, firstTickAtMaxHeight: 100, completed: false, completionTick: null }
  const completedSlow = { runId: 9n, maxHeightMm: 100, firstTickAtMaxHeight: 300, completed: true, completionTick: 600 }
  const completedFast = { ...completedSlow, runId: 8n, completionTick: 500 }
  assert.ok(compareLeaderboardRuns(completedSlow, incomplete) < 0)
  assert.ok(compareLeaderboardRuns(completedFast, completedSlow) < 0)
  assert.ok(compareLeaderboardRuns({ ...incomplete, runId: 11n, maxHeightMm: 9001 }, incomplete) < 0)
  assert.ok(compareLeaderboardRuns({ ...incomplete, runId: 12n, firstTickAtMaxHeight: 99 }, incomplete) < 0)
  assert.ok(compareLeaderboardRuns({ ...incomplete, runId: 2n }, incomplete) < 0)
})

test('Postgres migration contains focused immutable/fixed-point/ranking invariants', async () => {
  const sql = (await readFile(new URL('../db/migrations/0001_leaderboard.sql', import.meta.url), 'utf8')).replace(/\s+/g, ' ').toLowerCase()
  for (const invariant of [
    'canonical_level text not null',
    'level_hash text not null',
    'ruleset_hash text not null',
    'max_height_mm bigint not null',
    'first_tick_at_max_height integer not null',
    'completed boolean not null',
    'completion_tick integer null',
    'unique (player_id, daily_tower_id, replay_sha256)',
    'before update or delete on daily_towers',
    'case when not r.completed then r.max_height_mm end desc nulls last',
    'case when not b.completed then b.first_tick_at_max_height end asc nulls last',
  ]) assert.ok(sql.includes(invariant), invariant)
  assert.equal(sql.includes('numeric(10, 2)'), false)
  assert.equal(sql.includes('replay_sha256 text not null unique'), false)
})

test('DB replay_canonical bound fits the maximum admitted canonical replay', async () => {
  const sql = await readFile(new URL('../db/migrations/0001_leaderboard.sql', import.meta.url), 'utf8')
  const match = sql.replace(/\s+/g, ' ').match(/replay_canonical text not null check \(octet_length\(replay_canonical\) between 2 and (\d+)\)/)
  assert.ok(match, 'replay_canonical octet bound not found in migration')
  const dbBound = Number(match[1])

  // Longest JSON number rendering for a validated move axis in [-1, 1]:
  // sign + "0." + 5 leading zeros + 17 significant digits = 25 chars.
  // (|x| < 1e-6 uses shorter exponent notation.)
  const widestAxis = -0.0000031989640801661535
  assert.equal(JSON.stringify(widestAxis).length, 25)
  const widestEvent = { tick: 17999, seq: 31, kind: 'move', moveX: widestAxis, moveZ: widestAxis }
  const widestEventOctets = Buffer.byteLength(JSON.stringify(widestEvent), 'utf8')
  assert.ok(widestEventOctets <= 105, `widest event is ${widestEventOctets} octets`)

  // Structural maximum admitted by DEFAULT_REPLAY_LIMITS: every event at the
  // widest rendering, packed 32 per tick into the latest 5-digit ticks.
  const { maxFinishTick, maxInputEvents, maxInputEventsPerTick } = DEFAULT_REPLAY_LIMITS
  const packedTicks = Math.ceil(maxInputEvents / maxInputEventsPerTick)
  const events = []
  for (let index = 0; index < maxInputEvents; index += 1) {
    events.push({
      tick: maxFinishTick - packedTicks + Math.floor(index / maxInputEventsPerTick),
      seq: index % maxInputEventsPerTick,
      kind: 'move',
      moveX: widestAxis,
      moveZ: widestAxis,
    })
  }
  const maximumReplay = { header: defaultReplayHeader(), inputEvents: events, finishTick: maxFinishTick }
  assertReplay(maximumReplay) // passes structural admission...
  const { canonicalReplayJson } = await import('../dist/server/daily-contracts.js')
  const maximumOctets = Buffer.byteLength(canonicalReplayJson(maximumReplay), 'utf8')
  assert.ok(maximumOctets <= dbBound, `maximum admitted canonical replay ${maximumOctets} octets exceeds DB bound ${dbBound}`) // ...so it must fit storage

  // Conservative link: header + per-event maximum + separators must stay
  // under the DB bound, so future ReplayLimits changes fail this test loudly
  // instead of silently diverging from storage.
  const headerOctets = Buffer.byteLength(canonicalReplayJson({ header: defaultReplayHeader(), inputEvents: [], finishTick: maxFinishTick }), 'utf8')
  const structuralMax = headerOctets + maxInputEvents * (widestEventOctets + 1)
  assert.ok(maximumOctets <= structuralMax)
  assert.ok(structuralMax <= dbBound, `structural maximum ${structuralMax} octets exceeds DB bound ${dbBound}`)
})

test('adversarial spread-tick widest-value replay fits the DB bound', async () => {
  // Regression: one widest-value move event per tick at ticks 8000..17999
  // serialized to 1_048_798 octets and exceeded the previous 1 MiB bound.
  const widestAxis = -0.0000031989640801661535
  const events = []
  for (let index = 0; index < DEFAULT_REPLAY_LIMITS.maxInputEvents; index += 1) {
    events.push({ tick: 8000 + index, seq: 0, kind: 'move', moveX: widestAxis, moveZ: widestAxis })
  }
  const replay = { header: defaultReplayHeader(), inputEvents: events, finishTick: DEFAULT_REPLAY_LIMITS.maxFinishTick }
  assertReplay(replay)
  const { canonicalReplayJson } = await import('../dist/server/daily-contracts.js')
  const octets = Buffer.byteLength(canonicalReplayJson(replay), 'utf8')
  assert.ok(octets <= 2097152, `adversarial replay ${octets} octets exceeds DB bound`)
})
