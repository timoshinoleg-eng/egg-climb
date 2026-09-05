import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { replayPlaytest } from '../../scripts/replay-playtest.mjs'

test('Game Feel Lab exports reproducible separate runs and balanced navigation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGL UI smoke runs in Chromium')
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/debug/index.html?feel=2d-hold-assist&scenario=jump-base&visual=feedback&order=2')
  await expect(page.locator('#feelReadout')).toContainText('2d-hold-assist')
  await expect(page.locator('#telemetry')).toContainText('tick')
  await page.keyboard.down('Space')
  await expect(page.locator('#chargeMeter i')).not.toHaveCSS('width', '0px')
  await page.keyboard.up('Space')
  await page.locator('#clarityRating').fill('5')
  await page.locator('#saveRating').click()
  await expect(page.locator('#attemptCard')).toContainText('Rating saved')
  await page.screenshot({ path: 'test-results/game-feel-desktop.png' })
  const downloadRecord = async () => {
    const pending = page.waitForEvent('download')
    await page.locator('#exportButton').click()
    const download = await pending
    const record = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect((await replayPlaytest(record)).matched).toBe(true)
    await expect(page.locator('#attemptCard')).toContainText('Exported through tick')
    return record
  }
  const first = await downloadRecord()
  expect(first.ratings).toHaveLength(1)
  expect(first.samples.some(input => input.jumpDown)).toBe(true)
  expect(first.samples.some(input => input.jumpUp)).toBe(true)
  expect(first.config.plannedOrder).toEqual(['3d-hold', '2d-hold', '2d-tap', '3d-tap-assist', '3d-tap', '2d-tap-assist', '2d-hold-assist', '3d-hold-assist'])
  await page.locator('#nextVariant').click()
  await expect(page).toHaveURL(/feel=3d-hold-assist/)
  await expect(page.locator('#feelReadout')).toContainText('3d-hold-assist')
  const second = await downloadRecord()
  expect(second.config.orderRow).toBe(2)
  expect(second.ratings).toHaveLength(0)
  expect(second.history).toHaveLength(1)
  expect(second.history[0].config.feel).toBe('2d-hold-assist')
  expect(second.history[0].ratings).toHaveLength(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/game-feel-mobile.png' })
  expect(errors).toEqual([])
})
