import assert from 'node:assert/strict'
import test from 'node:test'
import { collectSimulationPresentationEvents } from '../dist/host/presentation-events.js'
import { PresentationEventCursor } from '../dist/presentation/events.js'

function snapshot({
  tick,
  grounded,
  vy = 0,
  y = 0,
  lastJumpTick = -1,
  lastJumpSource = null,
  lastJumpStrength = 0,
}) {
  return {
    tick,
    position: { x: 0.25, y, z: -0.5 },
    linearVelocity: { x: 0, y: vy, z: 0 },
    feel: { lastJumpTick, lastJumpSource, lastJumpStrength },
    physics: { grounded },
  }
}

function event({ attemptId = 0, tick, ordinal = 0, kind = 'jump' }) {
  return {
    id: `${attemptId}:${tick}:${kind}:${ordinal}`,
    attemptId,
    tick,
    ordinal,
    kind,
    position: { x: 0, y: 0, z: 0 },
    source: 'support',
    strength: 3,
  }
}

test('presentation transitions use semantic simulation fields, not velocity heuristics', () => {
  const airborneBefore = snapshot({ tick: 10, grounded: false, vy: -8 })
  const velocityAbsorbedWithoutSupport = snapshot({ tick: 11, grounded: false, vy: 1 })
  assert.deepEqual(collectSimulationPresentationEvents(airborneBefore, velocityAbsorbedWithoutSupport, 0), [])

  const supportedBefore = snapshot({ tick: 20, grounded: true, vy: 0 })
  const launchLikeVelocityWithoutJump = snapshot({ tick: 21, grounded: false, vy: 7 })
  assert.deepEqual(collectSimulationPresentationEvents(supportedBefore, launchLikeVelocityWithoutJump, 0), [])
})

test('exact jump signal produces stable identity and occurrence position', () => {
  const previous = snapshot({ tick: 4, grounded: true, y: 1 })
  const current = snapshot({
    tick: 5,
    grounded: false,
    vy: 4,
    y: 1.2,
    lastJumpTick: 4,
    lastJumpSource: 'buffer',
    lastJumpStrength: 3.75,
  })
  const events = collectSimulationPresentationEvents(previous, current, 7)
  assert.equal(events.length, 1)
  assert.deepEqual(events[0], {
    id: '7:5:jump:0',
    attemptId: 7,
    tick: 5,
    ordinal: 0,
    kind: 'jump',
    source: 'buffer',
    strength: 3.75,
    position: { x: 0.25, y: 1.2, z: -0.5 },
  })
})

test('support transition emits land/hard-land and preserves same-tick event order', () => {
  const previous = snapshot({ tick: 8, grounded: false, vy: -10, y: 2 })
  const current = snapshot({
    tick: 9,
    grounded: true,
    vy: 0,
    y: 0.61,
    lastJumpTick: 8,
    lastJumpSource: 'support',
    lastJumpStrength: 2.6,
  })
  const events = collectSimulationPresentationEvents(previous, current, 2)
  assert.deepEqual(events.map(({ kind, ordinal }) => ({ kind, ordinal })), [
    { kind: 'hard-land', ordinal: 0 },
    { kind: 'jump', ordinal: 1 },
  ])
  assert.equal(events[0].id, '2:9:hard-land:0')
  assert.equal(events[1].id, '2:9:jump:1')
  assert.ok(events[0].impact > 0.8 && events[0].impact <= 1)
})

test('presentation event cursor consumes ordered events exactly once', () => {
  const cursor = new PresentationEventCursor()
  const batch = [event({ tick: 2 }), event({ tick: 4 })]
  assert.deepEqual(cursor.take(batch), batch)
  assert.deepEqual(cursor.take(batch), [])

  const next = event({ tick: 5 })
  assert.deepEqual(cursor.take([next]), [next])
  assert.throws(() => cursor.take([event({ tick: 7 }), event({ tick: 6 })]), /strictly ordered/)

  cursor.reset()
  assert.deepEqual(cursor.take([batch[0]]), [batch[0]])
})

test('non-adjacent snapshots fail closed instead of inventing missing transitions', () => {
  assert.throws(
    () => collectSimulationPresentationEvents(
      snapshot({ tick: 1, grounded: false }),
      snapshot({ tick: 3, grounded: true }),
      0,
    ),
    /adjacent authoritative snapshots/,
  )
})
