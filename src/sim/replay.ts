import {
  FINGERPRINT_VERSION,
  FOUNDATION_ASSIST_PRESET_ID,
  FOUNDATION_CONTROL_MODE,
  FOUNDATION_DIMENSION_MODE,
  FOUNDATION_LEVEL_ID,
  FOUNDATION_LEVEL_VERSION,
  FOUNDATION_SEED,
  PHYSICS_HZ,
  PHYSICS_PRESET_ID,
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  REPLAY_PROTOCOL_VERSION,
  SIMULATION_VERSION,
} from './config.js'
import type { Replay, ReplayInputEvent, SimulationSnapshot, TickInput } from './contracts.js'
import { createSimulation } from './simulation.js'

export interface ReplayResult {
  readonly snapshot: SimulationSnapshot
  readonly fingerprint: string
  readonly clientFingerprintMatches: boolean | null
}

function assertReplay(replay: Replay): void {
  const { header } = replay
  if (header.protocolVersion !== REPLAY_PROTOCOL_VERSION) throw new Error('Unsupported replay protocol')
  if (header.simulationVersion !== SIMULATION_VERSION) throw new Error('Simulation version mismatch')
  if (header.rapierPackage !== RAPIER_PACKAGE || header.rapierVersion !== RAPIER_VERSION) throw new Error('Rapier version mismatch')
  if (header.fingerprintVersion !== FINGERPRINT_VERSION) throw new Error('Fingerprint version mismatch')
  if (header.physicsPresetId !== PHYSICS_PRESET_ID) throw new Error('Physics preset mismatch')
  if (header.tickRate !== PHYSICS_HZ) throw new Error('Tick rate mismatch')
  if (header.levelId !== FOUNDATION_LEVEL_ID || header.levelVersion !== FOUNDATION_LEVEL_VERSION) throw new Error('Level version mismatch')
  if (header.seed !== FOUNDATION_SEED) throw new Error('Unsupported foundation seed')
  if (header.dimensionMode !== FOUNDATION_DIMENSION_MODE) throw new Error('Dimension mode mismatch')
  if (header.controlMode !== FOUNDATION_CONTROL_MODE) throw new Error('Control mode mismatch')
  if (header.assistPresetId !== FOUNDATION_ASSIST_PRESET_ID) throw new Error('Assist preset mismatch')
  if (!Number.isInteger(replay.finishTick) || replay.finishTick < 0) throw new Error('Invalid finish tick')
  if (!Array.isArray(replay.inputEvents)) throw new Error('Invalid input event list')
  if (replay.clientFingerprint !== undefined && !/^[0-9a-f]{8}$/.test(replay.clientFingerprint)) throw new Error('Invalid client fingerprint')

  let currentTick = -1
  let expectedSeq = 0
  for (const event of replay.inputEvents) {
    if (!Number.isInteger(event.tick) || event.tick < 0 || event.tick >= replay.finishTick) throw new Error('Input event tick is outside the replay')
    if (event.tick < currentTick) throw new Error('Input events must be in canonical tick/sequence order')
    if (event.tick !== currentTick) {
      currentTick = event.tick
      expectedSeq = 0
    }
    if (!Number.isInteger(event.seq) || event.seq !== expectedSeq) throw new Error('Input events must use contiguous canonical sequence numbers per tick')
    expectedSeq += 1

    if (event.kind !== 'move' && event.kind !== 'jump') throw new Error('Unsupported input event kind')
    if (event.kind === 'move') {
      if (!Number.isFinite(event.moveX) || !Number.isFinite(event.moveZ)) throw new Error('Invalid move input')
      if (event.moveX < -1 || event.moveX > 1 || event.moveZ < -1 || event.moveZ > 1) throw new Error('Move input is outside [-1, 1]')
    } else if (typeof event.down !== 'boolean') {
      throw new Error('Invalid jump input')
    }
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
        applyEvent(replay.inputEvents[cursor] as ReplayInputEvent, state, edges)
        cursor += 1
      }
      const input: TickInput = { moveX: state.moveX, moveZ: state.moveZ, jumpDown: edges.jumpDown, jumpUp: edges.jumpUp }
      simulation.step(input)
    }
    const fingerprint = simulation.fingerprint()
    return {
      snapshot: simulation.snapshot(),
      fingerprint,
      clientFingerprintMatches: replay.clientFingerprint === undefined ? null : replay.clientFingerprint === fingerprint,
    }
  } finally {
    simulation.free()
  }
}
