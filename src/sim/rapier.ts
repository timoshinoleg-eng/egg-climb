import RAPIER from '@dimforge/rapier3d-deterministic-compat'

let ready: Promise<void> | undefined

export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init()
  return ready!
}

export { RAPIER }
