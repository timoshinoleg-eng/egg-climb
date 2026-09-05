import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { LocalSimulationHost } from '../dist/host/local-host.js'
import { assertTickInput } from '../dist/host/validation.js'
import { PHYSICS_LAB_PRESETS, PHYSICS_V1 } from '../dist/sim/physics-presets.js'
import { resolveFeelPreset } from '../dist/sim/feel-presets.js'
import { physicsLabScenario } from '../dist/sim/physics-lab-fixtures.js'

export async function replayPlaytest(record) {
  if (record?.history !== undefined) {
    if (!Array.isArray(record.history) || record.history.length > 24) throw new Error('Invalid playtest history')
    for (const previous of record.history) {
      if (previous.history !== undefined) throw new Error('Nested playtest history is invalid')
      await replayPlaytest(previous)
    }
  }
  if (record?.schema !== 'egg-climb-playtest-v1' || !record.config) throw new Error('Invalid playtest record')
  if (!Number.isSafeInteger(record.finishTick) || record.finishTick < 0 || !Array.isArray(record.samples) || record.samples.length !== record.finishTick) throw new Error('Playtest ticks must be complete and contiguous')
  const feel = resolveFeelPreset(record.config.feel)
  const key = record.config.physics
  const preset = key === 'physics-v1' ? PHYSICS_V1 : Object.hasOwn(PHYSICS_LAB_PRESETS, key) ? PHYSICS_LAB_PRESETS[key] : null
  if (!preset) throw new Error('Unknown playtest physics preset')
  const scenario = record.config.scenario === 'default' ? null : physicsLabScenario(record.config.scenario)
  const host = new LocalSimulationHost({ feel, preset, ...(scenario ? { level: scenario.level, initialEgg: scenario.initialEgg } : {}) })
  try {
    const initial = await host.init()
    for (const [key, value] of Object.entries(initial.identity)) {
      if (record.identity?.[key] !== value) throw new Error(`Playtest identity mismatch: ${key}`)
    }
    for (let tick = 0; tick < record.samples.length; tick++) {
      const input = record.samples[tick]
      if (input.tick !== tick) throw new Error(`Playtest input tick mismatch: ${tick}`)
      assertTickInput(input)
    }
    for (let start = 0; start < record.samples.length; start += 120) await host.advance(record.samples.slice(start, start + 120))
    const fingerprint = await host.fingerprint()
    if (record.fingerprint !== fingerprint) throw new Error(`Playtest fingerprint mismatch: expected ${record.fingerprint}, got ${fingerprint}`)
    return { tick: record.finishTick, fingerprint, matched: true }
  } finally { await host.free() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: npm run replay:playtest -- path/to/export.json')
  console.log(JSON.stringify(await replayPlaytest(JSON.parse(await readFile(process.argv[2], 'utf8')))))
}
