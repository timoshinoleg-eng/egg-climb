import { createReadStream, realpathSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.wasm', 'application/wasm'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webp', 'image/webp'],
])

/** A public preview is NOT a repository file browser. Fail closed, including symlinks. */
export function isPublicAsset(relativePath) {
  const parts = relativePath.replaceAll('\\', '/').split('/')
  if (parts.some(part => part.startsWith('.') || part === '' || part.includes('\0'))) return false
  if (/^(debug|play)\/[\w/-]+\.(html|js|css|svg|png|webp)$/.test(relativePath)) return true
  if (/^dist\/(sim|host|render|presentation|game)\/[\w/-]+\.js$/.test(relativePath)) return true
  if (/^node_modules\/three\/(build\/three\.(module|core)\.js|examples\/jsm\/[\w/.-]+\.js)$/.test(relativePath)) return true
  return /^node_modules\/@dimforge\/rapier3d-deterministic-compat\/dist\/(rapier\.mjs|rapier_wasm3d_bg\.wasm)$/.test(relativePath)
}

export function createDebugServer() {
  return createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed')
      return
    }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname === '/') {
        const lab = ['max', 'feel', 'physics', 'scenario', 'visual', 'order'].some(key => url.searchParams.has(key))
        const page = lab ? '/debug/index.html' : url.searchParams.get('mode') === 'kitchen' ? '/play/kitchen.html' : '/play/index.html'
        response.writeHead(302, { Location: `${page}${url.search}` }).end()
        return
      }
      const pathname = decodeURIComponent(url.pathname)
      const relativePath = pathname.slice(1)
      if (!isPublicAsset(relativePath)) { response.writeHead(403).end('Forbidden'); return }
      const target = realpathSync(path.resolve(root, relativePath))
      const realRelative = path.relative(root, target).split(path.sep).join('/')
      if (!isPublicAsset(realRelative)) { response.writeHead(403).end('Forbidden'); return }
      if (!statSync(target).isFile()) throw new Error('not a file')
      response.writeHead(200, {
        'Content-Type': mime.get(path.extname(target)) ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
      })
      if (request.method === 'HEAD') { response.end(); return }
      const stream = createReadStream(target)
      stream.on('error', () => response.destroy())
      response.on('close', () => stream.destroy())
      stream.pipe(response)
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number.parseInt(process.env.PORT ?? '4173', 10)
  createDebugServer().listen(port, '0.0.0.0', () => {
    console.log(`Egg Climb: http://0.0.0.0:${port}/`)
  })
}
