import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

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

const forbidden = [
  ['React import', /from\s+['"]react(?:\/|['"])/],
  ['Three import', /from\s+['"]three(?:\/|['"])/],
  ['R3F import', /@react-three\//],
  ['DOM window access', /\bwindow\b/],
  ['DOM document access', /\bdocument\b/],
  ['render clock', /\brequestAnimationFrame\b|\bperformance\.(?:now|timeOrigin)\b/],
  ['wall clock', /\bDate\.(?:now|UTC)\b|\bnew\s+Date\s*\(/],
  ['ambient randomness', /\bMath\.random\s*\(|\bcrypto\.getRandomValues\s*\(/],
  ['non-portable transcendental math', /\bMath\.(?:sin|cos|tan|asin|acos|atan|atan2|pow|exp|expm1|log|log1p|log2|log10)\s*\(/],
]

test('headless simulation boundary has no render, clock, random or transcendental dependencies', async () => {
  const files = await sourceFiles('src/sim')
  assert.ok(files.length > 0)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const [name, pattern] of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} violates deterministic sim boundary: ${name}`)
    }
  }
})
