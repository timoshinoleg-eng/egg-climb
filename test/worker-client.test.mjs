import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { WorkerSimulationHost } from '../dist/host/worker-client.js'
import { EXPECTED_WORKER_RUNTIME_INFO } from '../dist/host/worker-protocol.js'
import { WORKER_PROTOCOL_VERSION } from '../dist/sim/config.js'

function fakeWorker(t, mode='silent') {
  const original=globalThis.Worker
  class FakeWorker {
    static last
    listeners=new Map();messages=[];terminated=false
    constructor(){FakeWorker.last=this}
    addEventListener(type,callback){this.listeners.set(type,callback)}
    terminate(){this.terminated=true}
    emit(data){this.listeners.get('message')?.({data})}
    postMessage(message){
      this.messages.push(message)
      if(mode==='throw')throw new Error('DataCloneError')
      if(mode==='auto')queueMicrotask(()=>this.emit({id:message.id,protocolVersion:WORKER_PROTOCOL_VERSION,type:message.type==='init'?'initialized':'freed',snapshot:{tick:0},runtimeInfo:EXPECTED_WORKER_RUNTIME_INFO}))
    }
  }
  globalThis.Worker=FakeWorker;t.after(()=>{globalThis.Worker=original})
  return FakeWorker
}

test('watchdog rejects a stalled worker and terminates all retained requests', async t => {
  const Fake=fakeWorker(t),host=new WorkerSimulationHost('fake',undefined,undefined,20)
  await assert.rejects(host.init(),/init timed out/)
  assert.equal(Fake.last.terminated,true)
  await assert.rejects(host.init(),/closed/);await host.free()
})

test('synchronous postMessage failure rejects immediately instead of leaking a pending request', async t => {
  const Fake=fakeWorker(t,'throw'),host=new WorkerSimulationHost('fake',undefined,undefined,1000)
  await assert.rejects(host.init(),/DataCloneError/)
  assert.equal(Fake.last.terminated,true);await host.free()
})

test('successful requests clear watchdogs and free coalesces concurrent callers', async t => {
  const Fake=fakeWorker(t,'auto'),host=new WorkerSimulationHost('fake',undefined,undefined,20)
  assert.deepEqual(await host.init(),{tick:0})
  await delay(40);assert.equal(Fake.last.terminated,false)
  const a=host.free(),b=host.free();assert.equal(a,b);await a
  assert.equal(Fake.last.messages.filter(message=>message.type==='free').length,1)
  assert.equal(Fake.last.terminated,true);await host.free()
})

test('synchronous teardown rejects an in-flight init and cancels its timeout', async t => {
  const Fake=fakeWorker(t),host=new WorkerSimulationHost('fake',undefined,undefined,1000)
  const pending=host.init();host.terminate()
  await assert.rejects(pending,/closed/);assert.equal(Fake.last.terminated,true)
  host.terminate();await host.free()
})

test('malformed or mismatched worker handshakes fail closed', async t => {
  const Fake=fakeWorker(t),host=new WorkerSimulationHost('fake',undefined,undefined,1000)
  const pending=host.init(),message=Fake.last.messages[0]
  Fake.last.emit({id:message.id,protocolVersion:WORKER_PROTOCOL_VERSION,type:'initialized',snapshot:{tick:0},runtimeInfo:{...EXPECTED_WORKER_RUNTIME_INFO,physicsPresetHash:'untrusted'}})
  await assert.rejects(pending,/handshake mismatch/);assert.equal(Fake.last.terminated,true)
})
