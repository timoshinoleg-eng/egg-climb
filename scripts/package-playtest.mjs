import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = resolve(ROOT, 'build', 'playtest')

async function copyFile(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target)
}

async function copyDistJavaScript(sourceDir, targetDir) {
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const source = join(sourceDir, entry.name)
    const target = join(targetDir, entry.name)
    if (entry.isDirectory()) await copyDistJavaScript(source, target)
    else if (entry.isFile() && extname(entry.name) === '.js') await copyFile(source, target)
  }
}

export async function packagePlaytest() {
  const expectedOutput = resolve(ROOT, 'build', 'playtest')
  const buildRoot = resolve(ROOT, 'build')
  const outputRelative = relative(buildRoot, OUTPUT)
  if (OUTPUT !== expectedOutput || outputRelative === '..' || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative)) throw new Error('Unsafe playtest output path')
  await rm(OUTPUT, { recursive: true, force: true })

  await copyFile(join(ROOT, 'debug', 'index.html'), join(OUTPUT, 'debug', 'index.html'))
  await copyFile(join(ROOT, 'debug', 'main.js'), join(OUTPUT, 'debug', 'main.js'))
  await copyFile(join(ROOT, 'debug', 'max-playtest.js'), join(OUTPUT, 'debug', 'max-playtest.js'))
  await copyFile(join(ROOT, 'debug', 'style.css'), join(OUTPUT, 'debug', 'style.css'))
  await copyFile(join(ROOT, 'debug', 'sim-worker.js'), join(OUTPUT, 'debug', 'sim-worker.js'))
  await copyDistJavaScript(join(ROOT, 'dist'), join(OUTPUT, 'dist'))

  await copyFile(join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'), join(OUTPUT, 'vendor', 'three', 'three.module.js'))
  await copyFile(join(ROOT, 'node_modules', 'three', 'build', 'three.core.js'), join(OUTPUT, 'vendor', 'three', 'three.core.js'))
  await copyFile(join(ROOT, 'node_modules', 'three', 'LICENSE'), join(OUTPUT, 'vendor', 'three', 'LICENSE-MIT.txt'))
  await copyFile(join(ROOT, 'node_modules', '@dimforge', 'rapier3d-deterministic-compat', 'dist', 'rapier.mjs'), join(OUTPUT, 'vendor', 'rapier', 'rapier.mjs'))
  await copyFile(join(ROOT, 'node_modules', '@dimforge', 'rapier3d-deterministic-compat', 'dist', 'rapier_wasm3d_bg.wasm'), join(OUTPUT, 'vendor', 'rapier', 'rapier_wasm3d_bg.wasm'))
  await copyFile(join(ROOT, 'node_modules', '@dimforge', 'rapier3d-deterministic-compat', 'LICENSE'), join(OUTPUT, 'vendor', 'rapier', 'LICENSE-APACHE-2.0.txt'))

  const indexPath = join(OUTPUT, 'debug', 'index.html')
  const index = await readFile(indexPath, 'utf8')
  await writeFile(indexPath, index.replace('/node_modules/three/build/three.module.js', '../vendor/three/three.module.js'))
  const workerPath = join(OUTPUT, 'debug', 'sim-worker.js')
  const worker = await readFile(workerPath, 'utf8')
  await writeFile(workerPath, worker.replace('/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs', '../vendor/rapier/rapier.mjs'))
  const rapierPath = join(OUTPUT, 'dist', 'sim', 'rapier.js')
  const rapier = await readFile(rapierPath, 'utf8')
  await writeFile(rapierPath, rapier.replace("'@dimforge/rapier3d-deterministic-compat'", "'../../vendor/rapier/rapier.mjs'"))

  await writeFile(join(OUTPUT, 'index.html'), '<!doctype html><meta charset="utf-8"><script>location.replace(\'./debug/index.html\' + location.search + location.hash)</script>\n')
  return OUTPUT
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await packagePlaytest())
}
