import { PHYSICS_HZ, PHYSICS_PRESET_ID, RAPIER_PACKAGE, RAPIER_VERSION, REPLAY_PROTOCOL_VERSION, SIMULATION_VERSION } from './config.js'
import type { Replay, ReplayInputEvent, SimulationSnapshot, TickInput } from './contracts.js'
import { createSimulation } from './simulation.js'

export interface ReplayResult { readonly snapshot: SimulationSnapshot; readonly fingerprint: string }

function assertReplay(replay: Replay): void {
  const { header } = replay
  if (header.protocolVersion !== REPLAY_PROTOCOL_VERSION) throw new Error('Unsupported replay protocol')
  if (header.simulationVersion !== SIMULATION_VERSION) throw new Error('Simulation version mismatch')
  if (header.rapierPackage !== RAPIER_PACKAGE || header.rapierVersion !== RAPIER_VERSION) throw new Error('Rapier version mismatch')
  if (header.physicsPresetId !== PHYSICS_PRESET_ID) throw new Error('Physics preset mismatch')
  if (header.tickRate !== PHYSICS_HZ) throw new Error('Tick rate mismatch')
  if (!Number.isInteger(replay.finishTick) || replay.finishTick < 0) throw new Error('Invalid finish tick')

  let lastTick = -1; let lastSeq = -1
  for (const event of replay.inputEvents) {
    if (!Number.isInteger(event.tick) || event.tick < 0 || event.tick >= replay.finishTick) throw new Error('Input event tick is outside the replay')
    if (!Number.isInteger(event.seq) || event.seq < 0) throw new Error('Invalid input event sequence')
    if (event.tick < lastTick || (event.tick === lastTick && event.seq <= lastSeq)) throw new Error('Input events must be in canonical tick/sequence order')
    if (event.kind === 'move') {
      if (!Number.isFinite(event.moveX) || !Number.isFinite(event.moveZ)) throw new Error('Invalid move input')
      if (event.moveX < -1 || event.moveX > 1 || event.moveZ < -1 || event.moveZ > 1) throw new Error('Move input is outside [-1, 1]')
    }
    lastTick = event.tick; lastSeq = event.seq
  }
}

function applyEvent(event: ReplayInputEvent, state: { moveX: number; moveZ: number; jumpHeld: boolean }, edges: { jumpDown: boolean; jumpUp: boolean }): void {
  if (event.kind === 'move') { state.moveX = event.moveX; state.moveZ = event.moveZ; return }
  if (event.down && !state.jumpHeld) { state.jumpHeld = true; edges.jumpDown = true }
  else if (!event.down && state.jumpHeld) { state.jumpHeld = false; edges.jumpUp = true }
}

export async function runReplay(replay: Replay): Promise<ReplayResult> {
  assertReplay(replay)
  const simulation = await createSimulation()
  const state = { moveX: 0, moveZ: 0, jumpHeld: false }
  let cursor = 0
  try {
    for (let tick = 0; tick < replay.finishTick; tick += 1) {
      const edges = { jumpDown: false, jumpUp: false }
      while (cursor < replay.inputEvents.length && replay.inputEvents[cursor]?.tick === tick) {
        applyEvent(replay.inputEvents[cursor] as ReplayInputEvent, state, edges); cursor += 1
      }
      const input: TickInput = { moveX: state.moveX, moveZ: state.moveZ, jumpDown: edges.jumpDown, jumpUp: edges.jumpUp }
      simulation.step(input)
    }
    return { snapshot: simulation.snapshot(), fingerprint: simulation.fingerprint() }
  } finally { simulation.free() }
}
