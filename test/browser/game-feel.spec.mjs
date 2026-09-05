import { expect, test } from '@playwright/test'
import { FEEL_PRESETS, PHYSICS_V1, physicsLabScenario } from '../../dist/sim/index.js'
import { LocalSimulationHost } from '../../dist/host/local-host.js'

test.setTimeout(120_000)

const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })
const FEEL_KEYS = Object.keys(FEEL_PRESETS).sort()

function inputs() {
  return Array.from({ length: 180 }, (_, tick) => ({
    moveX: tick >= 20 && tick < 70 ? 0.35 : 0,
    moveZ: tick >= 70 && tick < 120 ? -0.25 : 0,
    jumpDown: tick === 12,
    jumpUp: tick === 13,
  }))
}

async function localFingerprint(feel, script, chunks) {
  const scenario = physicsLabScenario('jump-base')
  const host = new LocalSimulationHost({ preset: PHYSICS_V1, feel, level: scenario.level, initialEgg: scenario.initialEgg })
  try {
    await host.init()
    let cursor = 0
    let i = 0
    while (cursor < script.length) {
      const end = Math.min(script.length, cursor + chunks[i % chunks.length])
      await host.advance(script.slice(cursor, end))
      cursor = end
      i += 1
    }
    return host.fingerprint()
  } finally { await host.free() }
}

test('worker and Node remain identical across every feel preset, chunks, and reset', async ({ page, browserName }) => {
  await page.goto('/debug/replay-harness.html')
  const script = inputs()
  const expected = []
  for (const key of FEEL_KEYS) {
    const feel = FEEL_PRESETS[key]
    const fingerprint = await localFingerprint(feel, script, [1, 7, 31, 4, 53, 9])
    const oneBatch = await localFingerprint(feel, script, [120, 60])
    expect(oneBatch, `${browserName} local chunk parity ${key}`).toBe(fingerprint)
    expected.push({ key, fingerprint })
  }

  const result = await page.evaluate(async ({ rows, script }) => {
    const { WorkerSimulationHost } = await import(new URL('/dist/host/worker-client.js', window.location.origin).href)
    const { FEEL_PRESETS } = await import(new URL('/dist/sim/feel-presets.js', window.location.origin).href)
    const output = []
    for (const row of rows) {
      const workerUrl = new URL('/debug/sim-worker.js', window.location.origin)
      workerUrl.searchParams.set('feel', row.key)
      workerUrl.searchParams.set('scenario', 'jump-base')
      const feel = FEEL_PRESETS[row.key]
      const host = new WorkerSimulationHost(workerUrl, undefined, feel)
      try {
        await host.init()
        let cursor = 0
        let i = 0
        const chunks = [1, 7, 31, 4, 53, 9]
        while (cursor < script.length) {
          const end = Math.min(script.length, cursor + chunks[i % chunks.length])
          await host.advance(script.slice(cursor, end))
          cursor = end
          i += 1
        }
        const chunked = await host.fingerprint()
        await host.reset()
        await host.advance(script.slice(0, 120))
        await host.advance(script.slice(120))
        const reset = await host.fingerprint()
        output.push({ key: row.key, chunked, reset })
      } finally { await host.free() }
    }
    return output
  }, { rows: expected.map(({ key }) => ({ key })), script })

  expect(result).toHaveLength(FEEL_KEYS.length)
  for (const row of result) {
    const baseline = expected.find(item => item.key === row.key)
    expect(row.chunked, `${browserName} worker chunked ${row.key}`).toBe(baseline.fingerprint)
    expect(row.reset, `${browserName} worker reset ${row.key}`).toBe(baseline.fingerprint)
  }
})
