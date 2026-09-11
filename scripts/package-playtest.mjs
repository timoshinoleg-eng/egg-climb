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
  for (const name of ['index.html', 'kitchen.html', 'style.css', 'layout.css', 'kitchen.css', 'main.js', 'modes.js', 'egg-art.js', 'garden-view.js', 'kitchen-view.js', 'kitchen-readability-view.js', 'kitchen-max-view.js', 'kitchen-art.js', 'sim-worker.js', 'kitchen-worker.js', 'egg.svg']) {
    await copyFile(join(ROOT, 'play', name), join(OUTPUT, 'play', name))
  }
  for (const module of ['sim', 'host', 'presentation', 'render', 'game']) {
    await copyDistJavaScript(join(ROOT, 'dist', module), join(OUTPUT, 'dist', module))
  }

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
  for (const name of ['sim-worker.js', 'kitchen-worker.js']) {
    const workerPath = join(OUTPUT, 'play', name)
    const worker = await readFile(workerPath, 'utf8')
    await writeFile(workerPath, worker.replace('/node_modules/@dimforge/rapier3d-deterministic-compat/dist/rapier.mjs', '../vendor/rapier/rapier.mjs'))
  }
  const rapierPath = join(OUTPUT, 'dist', 'sim', 'rapier.js')
  const rapier = await readFile(rapierPath, 'utf8')
  await writeFile(rapierPath, rapier.replace("'@dimforge/rapier3d-deterministic-compat'", "'../../vendor/rapier/rapier.mjs'"))

  await writeFile(join(OUTPUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Egg Climb</title><script>(()=>{const params=new URLSearchParams(location.search);const maxLaunch=params.get('max')==='1'||params.has('WebAppStartParam')||location.hash.includes('WebAppData=');const allowMaxLab=params.get('lab')==='1';const lab=['feel','physics','scenario','visual','order'].some(key=>params.has(key));const garden=params.get('mode')==='garden';if(maxLaunch&&!allowMaxLab){for(const key of ['feel','physics','scenario','visual','order','lab','mode'])params.delete(key);const search=params.toString();location.replace('./play/kitchen.html'+(search?'?'+search:'')+location.hash)}else location.replace((lab?'./debug/index.html':garden?'./play/index.html':'./play/kitchen.html')+location.search+location.hash)})()</script><noscript>Enable JavaScript to play Egg Climb.</noscript>\n`)
  await writeFile(join(OUTPUT, 'max.html'), `<!doctype html><meta charset="utf-8"><title>Egg Climb</title><script>(()=>{const params=new URLSearchParams(location.search);for(const key of ['feel','physics','scenario','visual','order','lab','mode'])params.delete(key);if(!params.has('max'))params.set('max','1');const search=params.toString();location.replace('./play/kitchen.html'+(search?'?'+search:'')+location.hash)})()</script><noscript>Enable JavaScript to play Egg Climb.</noscript>\n`)
  return OUTPUT
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await packagePlaytest())
}
