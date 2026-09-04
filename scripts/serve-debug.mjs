import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number.parseInt(process.env.PORT ?? '4173', 10)
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json; charset=utf-8'],
])

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const pathname = url.pathname === '/' ? '/debug/index.html' : decodeURIComponent(url.pathname)
    const target = path.resolve(root, `.${pathname}`)
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    if (!statSync(target).isFile()) throw new Error('not a file')
    response.writeHead(200, {
      'Content-Type': mime.get(path.extname(target)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
    })
    createReadStream(target).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Egg Climb debug renderer: http://127.0.0.1:${port}/`)
})
