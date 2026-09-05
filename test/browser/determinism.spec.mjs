import { expect, test } from '@playwright/test'

const GOLDEN_REPLAY_FINGERPRINT = '4393dd6d'

function attachDiagnostics(page, browserName) {
  page.on('console', message => console.log(`[browser-console:${browserName}] ${message.type()} ${message.text()}`))
  page.on('pageerror', error => console.error(`[browser-pageerror:${browserName}] ${error.name}: ${error.message}`))
}

test('golden replay is identical in this browser engine', async ({ page, browserName }) => {
  attachDiagnostics(page, browserName)
  await page.goto('/debug/replay-harness.html')
  const result = page.locator('#result')
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
  await expect(result).toHaveText(GOLDEN_REPLAY_FINGERPRINT)
  await expect(result).toHaveAttribute('data-tick', '240')
  await expect(result).toHaveAttribute('data-chunking', 'true')
  await expect(result).toHaveAttribute('data-queue', 'true')
  await expect(result).toHaveAttribute('data-runtime', 'worker')
  await expect(result).toHaveAttribute('data-rapier-version', '0.20.0')
  await expect(result).toHaveAttribute('data-protocol-version', '1')
  await expect(result).toHaveAttribute('data-double-init', 'true')
  await expect(result).toHaveAttribute('data-empty', 'true')
  console.log(`[worker-fingerprint] ${browserName} ${GOLDEN_REPLAY_FINGERPRINT} tick=240 runtime=worker chunking=true queue=true`)
})
