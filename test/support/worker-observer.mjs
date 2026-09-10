/** Test-only, read-only transport observation. No inputs or responses are modified. */
export function observeWorkerTransport() {
  const NativeWorker = window.Worker
  const waiters = []
  const probe = { requested: 0, tick: 0, inputs: [], steam: false, launch: false, finish: null }
  window.__transportProbe = probe
  window.__waitForTick = tick => probe.tick >= tick ? Promise.resolve() : new Promise(resolve => waiters.push({ tick, resolve }))
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args)
      this.addEventListener('message', event => {
        const response = event.data
        if (response.type === 'advanced') {
          const snapshot = response.frame.current
          probe.tick = snapshot.tick
          probe.steam ||= snapshot.gameplay.activeContinuousForceZoneIds.length > 0
          probe.launch ||= response.frame.events.some(event => event.kind === 'launch')
          probe.finish = snapshot.gameplay.completionTick
          for (let i = waiters.length - 1; i >= 0; i--) if (probe.tick >= waiters[i].tick) waiters.splice(i, 1)[0].resolve()
        }
      })
    }
    postMessage(message, ...rest) {
      if (message.type === 'advance') {
        probe.requested += message.inputs.length
        probe.inputs.push(...message.inputs.map(input => ({ ...input })))
      }
      return super.postMessage(message, ...rest)
    }
  }
}
