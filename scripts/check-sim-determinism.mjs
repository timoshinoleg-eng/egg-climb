import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { findAuthoritativeHostViolations, findSimDeterminismViolations } from './sim-determinism-policy.mjs'

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

const violations = []
for (const file of await sourceFiles('src/sim')) {
  const source = await readFile(file, 'utf8')
  violations.push(...findSimDeterminismViolations(source, file))
}

const workerRuntimeFile = 'src/host/worker-runtime.ts'
violations.push(...findAuthoritativeHostViolations(await readFile(workerRuntimeFile, 'utf8'), workerRuntimeFile))

if (violations.length > 0) {
  console.error('Authoritative determinism policy failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('Authoritative simulation + worker runtime determinism policy: OK')
}
