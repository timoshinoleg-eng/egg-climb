import { expect, test } from '@playwright/test'
import { LocalSimulationHost } from '../../dist/host/local-host.js'
import { PHYSICS_LAB_PRESETS } from '../../dist/sim/physics-presets.js'
import { PHYSICS_LAB_SCENARIOS } from '../../dist/sim/physics-lab-fixtures.js'

test.setTimeout(120_000)

const NEUTRAL = Object.freeze({ moveX: 0, moveZ: 0, jumpDown: false, jumpUp: false })

function scriptedInputs(length = 180) {
  return Array.from({ length }, (_, tick) => ({
    moveX: tick >= 20 && tick < 55 ? 0.35 : 0,
    moveZ: tick >= 70 && tick < 105 ? -0.25 : 0,
    jumpDown: tick === 12,
    jumpUp: tick === 13,
  }))
}

async function runLocal(scenario, preset, inputs, chunks) {
  const host = new LocalSimulationHost({ preset, level: scenario.level, initialEgg: scenario.initialEgg })
  try {
    await host.init()
    let cursor = 0
    let chunkIndex = 0
    while (cursor < inputs.length) {
      const end = Math.min(inputs.length, cursor + chunks[chunkIndex % chunks.length])
      await host.advance(inputs.slice(cursor, end))
      cursor = end
      chunkIndex += 1
    }
    return await host.fingerprint()
  } finally {
    await host.free()
  }
}

test('Physics Lab rendered debug exposes preset, contact quality, COM and trajectory telemetry', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGL render smoke is owned by Chromium; worker matrix runs in every engine')
  const errors = []
  page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`))
  await page.goto('/debug/index.html?physics=lab-c&scenario=jump-tip')
  await expect(page.locator('#status')).toContainText('physics-lab-c')
  await expect(page.locator('#status')).toContainText('jump-tip')
  await expect.poll(() => page.locator('#telemetry').textContent()).toMatch(/PERFECT|GOOD|ANGLED|SIDE|AIRBORNE|AIR/)
  await expect.poll(() => page.locator('#telemetry').textContent()).toContain('contactT')
  await expect.poll(() => page.locator('#telemetry').textContent()).toContain('apex')
  await expect.poll(() => page.locator('#telemetry').textContent()).toContain('COM Y')
  const renderState = await page.evaluate(() => {
    const canvas = document.querySelector('#viewport')
    const context = canvas?.getContext('webgl2')
    return { width: canvas?.width ?? 0, height: canvas?.height ?? 0, webgl2: Boolean(context) }
  })
  expect(renderState.webgl2).toBe(true)
  expect(renderState.width).toBeGreaterThan(0)
  expect(renderState.height).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('Physics Lab worker matches Node LocalSimulationHost for every fixture and preset', async ({ page, browserName }) => {
  await page.goto('/debug/replay-harness.html')
  const inputs = scriptedInputs()
  const scenarios = Object.values(PHYSICS_LAB_SCENARIOS)
  const presets = Object.entries(PHYSICS_LAB_PRESETS)
  const expected = []
  for (const [presetKey, preset] of presets) {
    for (const scenario of scenarios) {
      const local = await runLocal(scenario, preset, inputs, [120])
      const localChunked = await runLocal(scenario, preset, inputs, [1, 7, 31, 4, 53, 9])
      expect(localChunked, `${browserName} local chunking ${presetKey}/${scenario.id}`).toBe(local)
      expected.push({ presetKey, preset, scenarioId: scenario.id, fingerprint: local })
    }
  }

  const result = await page.evaluate(async ({ rows, inputScript }) => {
    const { WorkerSimulationHost } = await import(new URL('/dist/host/worker-client.js', window.location.origin).href)
    const { PHYSICS_LAB_PRESETS } = await import(new URL('/dist/sim/physics-presets.js', window.location.origin).href)
    const inputs = inputScript.map(input => ({ ...input }))
    const output = []
    for (const row of rows) {
      const workerUrl = new URL('/debug/sim-worker.js', window.location.origin)
      workerUrl.searchParams.set('physics', row.presetKey)
      workerUrl.searchParams.set('scenario', row.scenarioId)
      const host = new WorkerSimulationHost(workerUrl, PHYSICS_LAB_PRESETS[row.presetKey])
      try {
        await host.init()
        let cursor = 0
        let chunkIndex = 0
        const chunks = [1, 7, 31, 4, 53, 9]
        while (cursor < inputs.length) {
          const end = Math.min(inputs.length, cursor + chunks[chunkIndex % chunks.length])
          await host.advance(inputs.slice(cursor, end))
          cursor = end
          chunkIndex += 1
        }
        const chunked = await host.fingerprint()
        await host.reset()
        await host.advance(inputs.slice(0, 120))
        await host.advance(inputs.slice(120))
        const reset = await host.fingerprint()
        output.push({ presetKey: row.presetKey, scenarioId: row.scenarioId, chunked, reset })
      } finally {
        await host.free()
      }
    }
    return output
  }, { rows: expected.map(({ presetKey, scenarioId }) => ({ presetKey, scenarioId })), inputScript: inputs })

  expect(result).toHaveLength(expected.length)
  for (const row of result) {
    const baseline = expected.find(item => item.presetKey === row.presetKey && item.scenarioId === row.scenarioId)
    expect(baseline).toBeDefined()
    expect(row.chunked, `${browserName} worker chunked ${row.presetKey}/${row.scenarioId}`).toBe(baseline.fingerprint)
    expect(row.reset, `${browserName} worker reset ${row.presetKey}/${row.scenarioId}`).toBe(baseline.fingerprint)
  }
  console.log(`[physics-lab-fingerprints] ${browserName} rows=${result.length} fingerprints=${[...new Set(result.map(row => row.chunked))].join(',')}`)
})
