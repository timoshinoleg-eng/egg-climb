import assert from 'node:assert/strict'
import test from 'node:test'
import { FEEL_PRESETS, defaultReplayHeader, runReplay, createSimulation, NEUTRAL_INPUT } from '../dist/sim/index.js'

const events = [
  { tick: 25, seq: 0, kind: 'jump', down: true },
  { tick: 30, seq: 0, kind: 'jump', down: false },
  { tick: 40, seq: 0, kind: 'jump', down: true },
  { tick: 45, seq: 0, kind: 'jump-cancel' },
  { tick: 60, seq: 0, kind: 'jump', down: true },
  { tick: 90, seq: 0, kind: 'jump', down: false },
]
test('replay reproduces raw hold/release/cancel edges for all eight feel presets', async () => {
  for (const feel of Object.values(FEEL_PRESETS)) {
    const replay = { header: defaultReplayHeader(feel), inputEvents: events, finishTick: 180 }
    const result = await runReplay(replay)
    const sim = await createSimulation({ feel })
    try {
      for (let tick = 0; tick < 180; tick++) {
        const event = events.find(event => event.tick === tick)
        sim.step({ ...NEUTRAL_INPUT, jumpDown: event?.kind === 'jump' && event.down, jumpUp: event?.kind === 'jump' && !event.down, jumpCancel: event?.kind === 'jump-cancel' })
      }
      assert.equal(result.fingerprint, sim.fingerprint(), feel.id)
      assert.deepEqual(result.snapshot, sim.snapshot(), feel.id)
    } finally { sim.free() }
  }
})

test('replay fails closed on every feel identity mismatch and cancels invalid charge edges', async () => {
  const header = defaultReplayHeader()
  for (const patch of [{ feelPresetId: 'unknown' }, { feelPresetId: '__proto__' }, { feelPresetVersion: 99 }, { feelPresetHash: '00000000' }]) {
    await assert.rejects(runReplay({ header: { ...header, ...patch }, inputEvents: [], finishTick: 1 }), /feel/i)
  }
})

test('playtest file replay validates contiguous ticks and runtime identity', async () => {
  const { replayPlaytest } = await import('../scripts/replay-playtest.mjs')
  const feel = FEEL_PRESETS['3d-tap']
  const sim = await createSimulation({ feel })
  try {
    const identity = sim.snapshot().identity
    const samples = Array.from({ length: 12 }, (_, tick) => ({ tick, ...NEUTRAL_INPUT }))
    for (const input of samples) sim.step(input)
    const record = { schema: 'egg-climb-playtest-v1', config: { feel: feel.id, physics: 'physics-v1', scenario: 'default' }, identity, finishTick: samples.length, samples, fingerprint: sim.fingerprint() }
    assert.equal((await replayPlaytest(record)).matched, true)
    await assert.rejects(replayPlaytest({ ...record, identity: { ...identity, simulationVersion: 'old' } }), /identity mismatch/)
    await assert.rejects(replayPlaytest({ ...record, samples: samples.slice(1) }), /contiguous/)
    await assert.rejects(replayPlaytest({ ...record, fingerprint: '00000000' }), /fingerprint mismatch/)
  } finally { sim.free() }
})
