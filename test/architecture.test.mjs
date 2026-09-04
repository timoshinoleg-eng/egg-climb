import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { findSimDeterminismViolations } from '../scripts/sim-determinism-policy.mjs'

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

test('AST determinism policy rejects portability and boundary hazards', () => {
  const unsafe = `
    import * as THREE from 'three'
    import { thing } from '../render/thing.js'
    export { other } from '../host/other.js'
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
    const j = import('../render/lazy.js')
  `
  const violations = findSimDeterminismViolations(unsafe, 'src/sim/unsafe.ts').join('\n')
  assert.match(violations, /external import is not allowed/)
  assert.match(violations, /relative import escapes authoritative src\/sim boundary/)
  assert.match(violations, /exponentiation operator/)
  assert.match(violations, /remainder operator/)
  assert.match(violations, /Math\.hypot/)
  assert.match(violations, /Math may only be used through a direct allowlisted/)
  assert.match(violations, /Date/)
  assert.match(violations, /performance/)
  assert.match(violations, /crypto/)
  assert.match(violations, /structuredClone/)
  assert.match(violations, /globalThis/)
  assert.match(violations, /dynamic import/)
})

test('AST determinism policy allows internal sim imports and the explicit portable math set', () => {
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
