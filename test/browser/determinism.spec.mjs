import { expect, test } from '@playwright/test'

const GOLDEN_REPLAY_FINGERPRINT = '4f677949'
const KITCHEN_WITNESS_FINGERPRINT = '547f7e78'

function attachDiagnostics(page, browserName) {
  page.on('console', message => console.log(`[browser-console:${browserName}] ${message.type()} ${message.text()}`))
  page.on('pageerror', error => console.error(`[browser-pageerror:${browserName}] ${error.name}: ${error.message}`))
}

test('golden replay is identical in this browser engine', async ({ page, browserName }) => {
  attachDiagnostics(page, browserName)
  await page.goto('/debug/replay-harness.html')
  const result = page.locator('#result')
  await expect(result).not.toHaveText('pending')
  console.log(`[candidate-fingerprint] ${browserName} ${await result.textContent()}`)
  await expect(result).toHaveText(GOLDEN_REPLAY_FINGERPRINT)
  await expect(result).toHaveAttribute('data-client-match', 'true')
  const userAgent = await result.getAttribute('data-user-agent')
  console.log(`[browser-fingerprint] ${browserName} ${GOLDEN_REPLAY_FINGERPRINT} ${userAgent ?? ''}`)
})

test('simulation worker proves runtime identity, golden equivalence, chunking and queue ordering', async ({ page, browserName }) => {
  attachDiagnostics(page, browserName)
  await page.goto('/debug/worker-harness.html')
  const result = page.locator('#result')
  await expect(result).not.toHaveText('pending')
  const error = await result.getAttribute('data-error')
  if (error) throw new Error(`Worker harness failed: ${error}`)
  await expect(result).not.toHaveText('pending')
  console.log(`[candidate-fingerprint] ${browserName} ${await result.textContent()}`)
  await expect(result).toHaveText(GOLDEN_REPLAY_FINGERPRINT)
  await expect(result).toHaveAttribute('data-tick', '240')
  await expect(result).toHaveAttribute('data-chunking', 'true')
  await expect(result).toHaveAttribute('data-queue', 'true')
  await expect(result).toHaveAttribute('data-runtime', 'worker')
  await expect(result).toHaveAttribute('data-rapier-version', '0.20.0')
  await expect(result).toHaveAttribute('data-protocol-version', '5')
  await expect(result).toHaveAttribute('data-physics-preset-id', 'physics-v1')
  await expect(result).toHaveAttribute('data-physics-preset-hash', 'ce73c5de')
  await expect(result).toHaveAttribute('data-egg-collider-id', 'egg-convex-v1')
  await expect(result).toHaveAttribute('data-egg-collider-hash', 'c7ac9e44')
  await expect(result).toHaveAttribute('data-double-init', 'true')
  await expect(result).toHaveAttribute('data-empty', 'true')
  console.log(`[worker-fingerprint] ${browserName} ${GOLDEN_REPLAY_FINGERPRINT} tick=240 runtime=worker chunking=true queue=true physics=physics-v1 collider=egg-convex-v1`)
})

test('Kitchen authoritative replay and environmental mechanics are deterministic in this browser engine', async ({ page, browserName }) => {
  attachDiagnostics(page, browserName)
  await page.goto('/debug/replay-harness.html')
  const evidence = await page.evaluate(async () => {
    const sim = await import('/dist/sim/index.js')
    const hostModule = await import('/dist/host/index.js')
    const replay = await sim.runReplay({ header: sim.replayHeaderForLevel(sim.KITCHEN_LEVEL), inputEvents: [], finishTick: 300 })
    const launch = sim.KITCHEN_LEVEL_DEFINITION.launchZones[0]
    const initialEgg = { position: launch.center, rotation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] }
    const environment = await sim.createSimulation({ level: sim.KITCHEN_LEVEL, initialEgg })
    environment.step(sim.NEUTRAL_INPUT)
    const snapshot = environment.snapshot()
    environment.free()
    const worker = new hostModule.WorkerSimulationHost('/debug/sim-worker.js', undefined, undefined, sim.KITCHEN_LEVEL)
    const workerInitial = await worker.init()
    for (let chunk = 0; chunk < 3; chunk += 1) {
      await worker.advance(Array.from({ length: 100 }, () => sim.NEUTRAL_INPUT))
    }
    const workerFingerprint = await worker.fingerprint()
    await worker.free()
    return { fingerprint: replay.fingerprint, completionTick: replay.completionTick, workerFingerprint, workerLevelHash: workerInitial.identity.levelHash, levelHash: replay.snapshot.identity.levelHash, launch: snapshot.gameplay.activatedLaunchZoneIds }
  })
  expect(evidence.fingerprint).toBe(KITCHEN_WITNESS_FINGERPRINT)
  expect(evidence.levelHash).toHaveLength(64)
  expect(evidence.workerLevelHash).toBe(evidence.levelHash)
  expect(evidence.workerFingerprint).toBe(evidence.fingerprint)
  expect(evidence.completionTick).toBe(214)
  expect(evidence.launch).toEqual(['toaster-launch'])
  console.log(`[kitchen-fingerprint] ${browserName} ${evidence.fingerprint}`)
})
