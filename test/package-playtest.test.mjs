import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { packagePlaytest } from '../scripts/package-playtest.mjs'

const output = join(process.cwd(), 'build', 'playtest')

async function files(root, current = root) {
  const result = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) result.push(...await files(root, path))
    else result.push(relative(root, path).replaceAll('\\', '/'))
  }
  return result
}

test('static playtest package contains browser runtime assets for Labs and Kitchen and preserves subpath imports', async () => {
  assert.equal(await packagePlaytest(), output)
  const names = await files(output)
  assert.ok(names.includes('index.html'))
  for (const required of [
    'debug/index.html', 'debug/main.js', 'debug/max-playtest.js', 'debug/style.css', 'debug/sim-worker.js',
    'debug/juice-view.js', 'debug/kitchen-escape.html', 'debug/kitchen-escape.js', 'debug/kitchen-escape.css',
    'dist/sim/simulation.js', 'dist/host/worker-client.js', 'dist/render/interpolate.js', 'dist/render/kitchen-presentation.js',
    'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/addons/postprocessing/EffectComposer.js',
    'vendor/three/addons/shaders/CopyShader.js', 'vendor/three/LICENSE-MIT.txt',
    'vendor/rapier/rapier.mjs', 'vendor/rapier/rapier_wasm3d_bg.wasm', 'vendor/rapier/LICENSE-APACHE-2.0.txt',
  ]) assert.ok(names.includes(required), required)
  assert.equal(names.some(name => name.endsWith('.map') || name.endsWith('.d.ts')), false)
  assert.equal(names.some(name => /(^|\/)(src|test|node_modules|\.git)(\/|$)/.test(name)), false)

  const root = await readFile(join(output, 'index.html'), 'utf8')
  assert.match(root, /\.\/debug\/index\.html.*location\.search.*location\.hash/)
  const html = await readFile(join(output, 'debug', 'index.html'), 'utf8')
  assert.match(html, /\.\.\/vendor\/three\/three\.module\.js/)
  const kitchen = await readFile(join(output, 'debug', 'kitchen-escape.html'), 'utf8')
  assert.match(kitchen, /\.\.\/vendor\/three\/three\.module\.js/)
  assert.match(kitchen, /\.\.\/vendor\/three\/addons\//)
  const worker = await readFile(join(output, 'debug', 'sim-worker.js'), 'utf8')
  assert.match(worker, /\.\.\/vendor\/rapier\/rapier\.mjs/)
  const rapier = await readFile(join(output, 'dist', 'sim', 'rapier.js'), 'utf8')
  assert.match(rapier, /\.\.\/\.\.\/vendor\/rapier\/rapier\.mjs/)
  assert.doesNotMatch(`${html}\n${kitchen}\n${worker}\n${rapier}`, /\/node_modules\//)
})
