import { expect, test } from '@playwright/test'
import { KITCHEN_LEVEL } from '../../dist/sim/level.js'

async function ready(page) {
  await page.goto('/play/kitchen.html')
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'ready')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-level', KITCHEN_LEVEL.id)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-level-hash', KITCHEN_LEVEL.hash)
}

test('Kitchen exposes a route-aware presentation without changing canonical identity', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await ready(page)
  const canvas = page.locator('#gameCanvas')
  await expect(canvas).toHaveAttribute('data-camera-region', 'table-counter')
  await expect(canvas).toHaveAttribute('data-route-cue', 'NEXT · TOASTER POP')
  await page.locator('#startButton').click()
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing')
  await expect(page.locator('#gameStage')).toHaveAttribute('data-level', KITCHEN_LEVEL.id)
  await expect(page.locator('#gameStage')).toHaveAttribute('data-level-hash', KITCHEN_LEVEL.hash)
  await page.getByRole('button', { name: 'View the kitchen' }).click()
  await expect(page.locator('#overviewButton')).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveAttribute('data-route-cue', 'NEXT · TOASTER POP')
  expect(errors).toEqual([])
})

test.describe('Kitchen readability mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })

  test('the next objective remains available when the desktop route card is hidden', async ({ page }) => {
    await ready(page)
    await expect(page.locator('.route-card')).toBeHidden()
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-route-cue', 'NEXT · TOASTER POP')
    await page.locator('#startButton').tap()
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing')
    await expect(page.locator('#gameCanvas')).toHaveAttribute('data-camera-region', 'table-counter')
  })
})
