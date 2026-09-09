import { expect, test } from '@playwright/test'
import {
  KITCHEN_WITNESS_COMPLETION_TICK,
  KITCHEN_WITNESS_FINISH_TICK,
  KITCHEN_WITNESS_FINGERPRINT,
  KITCHEN_WITNESS_INPUT_EVENTS,
} from '../fixtures/kitchen-witness.mjs'

const GOLDEN_REPLAY_FINGERPRINT = '4f677949'

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

test('Kitchen authored replay, Finish and Worker parity are deterministic in this browser engine', async ({ page, browserName }) => {
  attachDiagnostics(page, browserName)
  await page.goto('/debug/replay-harness.html')
  const evidence = await page.evaluate(async ({ inputEvents, finishTick }) => {
    const sim = await import('/dist/sim/index.js')
    const hostModule = await import('/dist/host/index.js')
    const header = sim.replayHeaderForLevel(sim.KITCHEN_LEVEL)
    const replay = await sim.runReplay({ header, inputEvents, finishTick })
    const neutral = await sim.runReplay({ header, inputEvents: [], finishTick })

    const state = { moveX: 0, moveZ: 0, jumpHeld: false }
    let cursor = 0
    const inputs = []
    for (let tick = 0; tick < finishTick; tick += 1) {
      let jumpDown = false
      let jumpUp = false
      let jumpCancel = false
      while (cursor < inputEvents.length && inputEvents[cursor].tick === tick) {
        const event = inputEvents[cursor]
        cursor += 1
        if (event.kind === 'move') {
          state.moveX = event.moveX
          state.moveZ = event.moveZ
        } else if (event.kind === 'jump-cancel') {
          state.jumpHeld = false
          jumpCancel = true
        } else if (event.down && !state.jumpHeld) {
          state.jumpHeld = true
          jumpDown = true
        } else if (!event.down && state.jumpHeld) {
          state.jumpHeld = false
          jumpUp = true
        }
      }
      inputs.push({ moveX: state.moveX, moveZ: state.moveZ, jumpDown, jumpUp, jumpCancel })
    }

    const worker = new hostModule.WorkerSimulationHost('/debug/sim-worker.js', undefined, undefined, sim.KITCHEN_LEVEL)
    const workerInitial = await worker.init()
    let frame = null
    for (let offset = 0; offset < inputs.length; offset += 100) frame = await worker.advance(inputs.slice(offset, offset + 100))
    const workerFingerprint = await worker.fingerprint()
    await worker.free()

    const launch = sim.KITCHEN_LEVEL_DEFINITION.launchZones[0]
    const environment = await sim.createSimulation({ level: sim.KITCHEN_LEVEL, initialEgg: { position: launch.center, rotation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] } })
    environment.step(sim.NEUTRAL_INPUT)
    const launchSnapshot = environment.snapshot()
    environment.free()

    return {
      replayFingerprint: replay.fingerprint,
      replayCompletionTick: replay.completionTick,
      neutralCompleted: neutral.completed,
      workerFingerprint,
      workerCompletionTick: frame?.current.gameplay.completionTick ?? null,
      workerLevelHash: workerInitial.identity.levelHash,
      levelHash: replay.snapshot.identity.levelHash,
      launch: launchSnapshot.gameplay.activatedLaunchZoneIds,
    }
  }, { inputEvents: KITCHEN_WITNESS_INPUT_EVENTS, finishTick: KITCHEN_WITNESS_FINISH_TICK })

  expect(evidence.replayFingerprint).toBe(KITCHEN_WITNESS_FINGERPRINT)
  expect(evidence.replayCompletionTick).toBe(KITCHEN_WITNESS_COMPLETION_TICK)
  expect(evidence.neutralCompleted).toBe(false)
  expect(evidence.workerLevelHash).toBe(evidence.levelHash)
  expect(evidence.workerFingerprint).toBe(evidence.replayFingerprint)
  expect(evidence.workerCompletionTick).toBe(evidence.replayCompletionTick)
  expect(evidence.launch).toEqual(['toaster-launch'])
  console.log(`[kitchen-fingerprint] ${browserName} ${evidence.replayFingerprint} completionTick=${evidence.replayCompletionTick} finishTick=${KITCHEN_WITNESS_FINISH_TICK}`)
})
