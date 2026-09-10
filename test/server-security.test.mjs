import assert from 'node:assert/strict'
import test from 'node:test'
import { symlink, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createDebugServer, isPublicAsset } from '../scripts/serve-debug.mjs'

async function withServer(fn){
  const server=createDebugServer();await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve))
  try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(resolve=>server.close(resolve))}
}

test('public preview denies checkout metadata, secrets, SQL, source and encoded traversal', async()=>{
  await withServer(async base=>{
    for(const route of ['/.git/HEAD','/.env','/.env.local','/package.json','/package-lock.json','/src/server/max-initdata.ts','/db/migrations/0001_leaderboard.sql','/dist/server/max-initdata.js','/debug/%2e%2e/%2eenv','/debug/%00.js','/debug/%E0%A4%A']){
      const response=await fetch(base+route);assert.ok([403,404].includes(response.status),route);await response.text()
    }
  })
})

test('runtime resources accept preview hosts, preserve redirect queries and apply nosniff', async()=>{
  await withServer(async base=>{
    const root=await fetch(base+'/',{redirect:'manual'});assert.equal(root.status,302);assert.equal(root.headers.get('location'),'/play/index.html')
    const lab=await fetch(base+'/?feel=2d-tap',{redirect:'manual'});assert.equal(lab.headers.get('location'),'/debug/index.html?feel=2d-tap')
    const kitchen=await fetch(base+'/?mode=kitchen',{redirect:'manual'});assert.equal(kitchen.headers.get('location'),'/play/kitchen.html?mode=kitchen')
    for(const route of ['/play/index.html','/play/main.js','/play/egg.svg','/debug/index.html','/dist/game/arcade-run.js']){
      const response=await fetch(base+route,{headers:{Host:'4173-test.e2b.app',Origin:'https://4173-test.e2b.app'}})
      assert.equal(response.status,200,route);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-frame-options'),null);await response.arrayBuffer()
    }
    const head=await fetch(base+'/play/main.js',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'')
    const post=await fetch(base+'/play/main.js',{method:'POST'});assert.equal(post.status,405)
  })
})

test('a public-looking symlink cannot disclose server-only runtime files', async()=>{
  const link=path.resolve('debug','security-test-link')
  await symlink(path.resolve('dist/server'),link,'junction')
  try{await withServer(async base=>{const response=await fetch(base+'/debug/security-test-link/max-initdata.js');assert.equal(response.status,403)})}
  finally{await unlink(link)}
  assert.equal(isPublicAsset('../.git/HEAD'),false)
  assert.equal(isPublicAsset('node_modules/three/../../.env'),false)
})
