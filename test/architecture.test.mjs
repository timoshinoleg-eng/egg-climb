import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { findAuthoritativeHostViolations, findSimDeterminismViolations } from '../scripts/sim-determinism-policy.mjs'

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full)
  }
  return files.sort()
}

test('authoritative simulation satisfies the AST determinism allowlist', async () => {
  const files = await sourceFiles('src/sim')
  assert.ok(files.length > 0)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.deepEqual(findSimDeterminismViolations(source, file), [])
  }
})

test('authoritative worker runtime is typed and covered by its transport policy', async () => {
  const file = 'src/host/worker-runtime.ts'
  const source = await readFile(file, 'utf8')
  assert.deepEqual(findAuthoritativeHostViolations(source, file), [])
})

test('AST simulation policy rejects portability and boundary hazards', () => {
  const unsafe = `
    import * as THREE from 'three'
    import { thing } from '../render/thing.js'
    const a = 2 ** 3
    const b = 5 % 2
    const c = Math.hypot(a, b)
    const M = Math
    const d = M.sqrt(4)
    const e = Date.now()
    const f = performance.now()
    const g = crypto.getRandomValues(new Uint32Array(1))
    const h = structuredClone({ x: 1 })
    const i = globalThis.Math.sqrt(4)
    const j = Reflect.get(Math, 'random')
    const k = self.Math.random()
    const l = WebAssembly.instantiate(new Uint8Array())
    const m = import('../render/lazy.js')
    const n = import.meta.url
  `
  const violations = findSimDeterminismViolations(unsafe, 'src/sim/unsafe.ts').join('\n')
  assert.match(violations, /external import is not allowed/)
  assert.match(violations, /relative import escapes authoritative boundary/)
  assert.match(violations, /exponentiation operator/)
  assert.match(violations, /remainder operator/)
  assert.match(violations, /Math\.hypot/)
  assert.match(violations, /Math may only be used through a direct allowlisted/)
  assert.match(violations, /Date/)
  assert.match(violations, /performance/)
  assert.match(violations, /crypto/)
  assert.match(violations, /structuredClone/)
  assert.match(violations, /globalThis/)
  assert.match(violations, /Reflect/)
  assert.match(violations, /self/)
  assert.match(violations, /WebAssembly/)
  assert.match(violations, /dynamic import/)
  assert.match(violations, /import\.meta/)
})

test('AST simulation policy allows internal sim imports and the explicit portable math set', () => {
  const safe = `
    import type { TickInput } from './contracts.js'
    import RAPIER from '@dimforge/rapier3d-deterministic-compat'
    const a = Math.sqrt(Math.abs(-4))
    const b = Math.max(1, Math.min(2, Math.floor(1.5)))
    const c = Math.fround(Math.sign(a))
    const d = Math.imul(123, 456)
    export type { TickInput } from './contracts.js'
  `
  assert.deepEqual(findSimDeterminismViolations(safe, 'src/sim/rapier.ts'), [])
})

test('authoritative host policy rejects clocks, ambient globals and imports outside host/sim', () => {
  const unsafe = `
    import { x } from '../render/x.js'
    const a = Date.now()
    const b = Math.random()
    const c = self.location
    const d = import.meta.url
  `
  const violations = findAuthoritativeHostViolations(unsafe, 'src/host/worker-runtime.ts').join('\n')
  assert.match(violations, /relative import escapes authoritative boundary/)
  assert.match(violations, /Date/)
  assert.match(violations, /Math is not allowed/)
  assert.match(violations, /self/)
  assert.match(violations, /import\.meta/)
})
