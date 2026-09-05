import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, relative } from 'node:path'
import { packagePlaytest } from '../../scripts/package-playtest.mjs'
import { replayPlaytest } from '../../scripts/replay-playtest.mjs'
import { expect, test } from '@playwright/test'

test('packaged playtest runs under an /egg-climb/ subpath and exports replayable JSON', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Static MAX package smoke runs in Chromium')
  const packageRoot = await packagePlaytest()
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
  }
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (!requestPath.startsWith('/egg-climb/')) { response.writeHead(404); response.end('not found'); return }
      const relativePath = decodeURIComponent(requestPath.slice('/egg-climb/'.length)) || 'index.html'
      const safePath = normalize(relativePath).replace(/^([.][.][\\/])+/, '')
      const filePath = join(packageRoot, safePath)
      if (relative(packageRoot, filePath).startsWith('..')) { response.writeHead(403); response.end('forbidden'); return }
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) { response.writeHead(404); response.end('not found'); return }
      response.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      createReadStream(filePath).pipe(response)
    } catch {
      response.writeHead(404); response.end('not found')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const missing = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('response', response => { if (response.url().includes(`/egg-climb/`) && response.status() >= 400) missing.push(`${response.status()} ${response.url()}`) })
  try {
    await page.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.WebApp={platform:"android"}' }))
    await page.goto(`http://127.0.0.1:${port}/egg-climb/?max=1&feel=2d-hold-assist&scenario=jump-base`)
    await expect(page).toHaveURL(/\/egg-climb\/debug\/index\.html\?max=1&feel=2d-hold-assist&scenario=jump-base/)
    await expect(page.locator('#maxToolbar')).toHaveAttribute('data-platform', 'android')
    try { await expect(page.locator('#status')).toContainText('running') } catch (error) { throw new Error(`${error.message}\n${errors.join('\n')}`) }
    const jump = page.getByRole('button', { name: 'JUMP', exact: true })
    const box = await jump.boundingBox()
    expect(box).toBeTruthy()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(200)
    await page.mouse.up()
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
    const record = JSON.parse(await page.getByLabel('JSON записи теста').inputValue())
    expect((await replayPlaytest(record)).matched).toBe(true)
    expect(record.config.feel).toBe('2d-hold-assist')
    expect(record.samples.some(input => input.jumpDown)).toBe(true)
    expect(record.samples.some(input => input.jumpUp)).toBe(true)
    expect(missing).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
