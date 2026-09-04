import { expect, test } from '@playwright/test'

const GOLDEN_REPLAY_FINGERPRINT = '436f6aa7'

test('golden replay is identical in this browser engine', async ({ page, browserName }) => {
  await page.goto('/debug/replay-harness.html')
  const result = page.locator('#result')
  await expect(result).toHaveText(GOLDEN_REPLAY_FINGERPRINT)
  await expect(result).toHaveAttribute('data-client-match', 'true')
  const userAgent = await result.getAttribute('data-user-agent')
  console.log(`[browser-fingerprint] ${browserName} ${GOLDEN_REPLAY_FINGERPRINT} ${userAgent ?? ''}`)
})

test('simulation worker proves runtime identity, golden equivalence, chunking and queue ordering', async ({ page, browserName }) => {
  await page.goto('/debug/worker-harness.html')
  const result = page.locator('#result')
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
