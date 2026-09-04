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

test('simulation worker advances the same headless core', async ({ page, browserName }) => {
  await page.goto('/debug/worker-harness.html')
  await expect(page.locator('#result')).toHaveText('10')
  console.log(`[worker-smoke] ${browserName} tick=10`)
})
