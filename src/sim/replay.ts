import { resolveFeelPreset, computeFeelPresetHash } from './feel-presets.js'
import type { FeelPreset } from './feel-presets.js'
import {
  DAILY_RULESET_HASH,
  EGG_COLLIDER_HASH,
  EGG_COLLIDER_ID,
  EGG_COLLIDER_VERSION,
  FINGERPRINT_VERSION,
  PHYSICS_HZ,
  PHYSICS_PRESET_HASH,
  PHYSICS_PRESET_ID,
  PHYSICS_PRESET_VERSION,
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  REPLAY_PROTOCOL_VERSION,
  SIMULATION_VERSION,
} from './config.js'
import type { Replay, ReplayInputEvent, SimulationSnapshot, TickInput } from './contracts.js'
import { resolveTrustedLevel } from './level.js'
import type { ResolvedLevel } from './level.js'
import { PHYSICS_V1 } from './physics-presets.js'
import { EMPTY_HEIGHT_SCORE, recordHeightScore, worldCenterOfMassYFromSnapshot } from './scoring.js'
import { createSimulation } from './simulation.js'

export interface ReplayResult {
  readonly snapshot: SimulationSnapshot
  readonly fingerprint: string
  readonly clientFingerprintMatches: boolean | null
  readonly maxHeightMm: number | null
  readonly firstTickAtMaxHeight: number | null
  readonly completed: boolean
  readonly completionTick: number | null
}

export interface ReplayLimits {
  readonly maxFinishTick: number
  readonly maxInputEvents: number
  readonly maxInputEventsPerTick: number
}

/** 5 minutes at 60 Hz; intentionally above the target 1–3 minute Daily run. */
export const DEFAULT_REPLAY_LIMITS: ReplayLimits = Object.freeze({
  maxFinishTick: 18_000,
  maxInputEvents: 10_000,
  maxInputEventsPerTick: 32,
})

function validatedLimits(limits: ReplayLimits): ReplayLimits {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid replay limit: ${name}`)
  }
  return limits
}

function validateReplay(replay: Replay, requestedLimits: ReplayLimits): { feel: FeelPreset; level: ResolvedLevel } {
  const limits = validatedLimits(requestedLimits)
  if (!Number.isInteger(replay.finishTick) || replay.finishTick < 0) throw new Error('Invalid finish tick')
  if (replay.finishTick > limits.maxFinishTick) throw new Error('Replay exceeds maximum finish tick')
  if (!Array.isArray(replay.inputEvents)) throw new Error('Invalid input event list')
  if (replay.inputEvents.length > limits.maxInputEvents) throw new Error('Replay exceeds maximum input events')
  if (replay.clientFingerprint !== undefined && !/^[0-9a-f]{8}$/.test(replay.clientFingerprint)) throw new Error('Invalid client fingerprint')

  const { header } = replay
  if (header === null || typeof header !== 'object') throw new Error('Invalid replay header')
  if (header.protocolVersion !== REPLAY_PROTOCOL_VERSION) throw new Error('Unsupported replay protocol')
  if (header.simulationVersion !== SIMULATION_VERSION) throw new Error('Simulation version mismatch')
  if (header.rapierPackage !== RAPIER_PACKAGE || header.rapierVersion !== RAPIER_VERSION) throw new Error('Rapier version mismatch')
  if (header.fingerprintVersion !== FINGERPRINT_VERSION) throw new Error('Fingerprint version mismatch')
  if (
    header.physicsPresetId !== PHYSICS_PRESET_ID ||
    header.physicsPresetVersion !== PHYSICS_PRESET_VERSION ||
    header.physicsPresetHash !== PHYSICS_PRESET_HASH
  ) throw new Error('Physics preset mismatch')
  if (
    header.eggColliderId !== EGG_COLLIDER_ID ||
    header.eggColliderVersion !== EGG_COLLIDER_VERSION ||
    header.eggColliderHash !== EGG_COLLIDER_HASH
  ) throw new Error('Egg collider mismatch')
  const feel = resolveFeelPreset(header.feelPresetId)
  if (header.feelPresetVersion !== feel.version || header.feelPresetHash !== computeFeelPresetHash(feel)) throw new Error('Feel preset mismatch')
  if (header.tickRate !== PHYSICS_HZ) throw new Error('Tick rate mismatch')
  const level = resolveTrustedLevel(header)
  if (header.dimensionMode !== feel.dimensionMode) throw new Error('Dimension mode mismatch')
  if (header.controlMode !== feel.controlMode) throw new Error('Control mode mismatch')
  if (header.assistPresetId !== (feel.bufferTicks || feel.coyoteTicks || feel.tipHoldTicks ? feel.id : 'none')) throw new Error('Assist preset mismatch')

  let currentTick = -1
  let expectedSeq = 0
  let eventsAtTick = 0
  for (const event of replay.inputEvents) {
    if (event === null || typeof event !== 'object') throw new Error('Invalid input event')
    if (!Number.isInteger(event.tick) || event.tick < 0 || event.tick >= replay.finishTick) throw new Error('Input event tick is outside the replay')
    if (event.tick < currentTick) throw new Error('Input events must be in canonical tick/sequence order')
    if (event.tick !== currentTick) {
      currentTick = event.tick
      expectedSeq = 0
      eventsAtTick = 0
    }
    eventsAtTick += 1
    if (eventsAtTick > limits.maxInputEventsPerTick) throw new Error('Replay exceeds maximum input events per tick')
    if (!Number.isInteger(event.seq) || event.seq !== expectedSeq) throw new Error('Input events must use contiguous canonical sequence numbers per tick')
    expectedSeq += 1

    if (event.kind !== 'move' && event.kind !== 'jump' && event.kind !== 'jump-cancel') throw new Error('Unsupported input event kind')
    if (event.kind === 'move') {
      if (!Number.isFinite(event.moveX) || !Number.isFinite(event.moveZ)) throw new Error('Invalid move input')
      if (event.moveX < -1 || event.moveX > 1 || event.moveZ < -1 || event.moveZ > 1) throw new Error('Move input is outside [-1, 1]')
    } else if (event.kind === 'jump' && typeof event.down !== 'boolean') {
      throw new Error('Invalid jump input')
    }
  }
  return { feel, level }
}

/** Structural + compatibility validation reusable by future HTTP admission code. */
export function assertReplay(replay: Replay, limits: ReplayLimits = DEFAULT_REPLAY_LIMITS): void {
  validateReplay(replay, limits)
}

function applyEvent(event: ReplayInputEvent, state: { moveX: number; moveZ: number; jumpHeld: boolean }, edges: { jumpDown: boolean; jumpUp: boolean; jumpCancel: boolean }): void {
  if (event.kind === 'move') { state.moveX = event.moveX; state.moveZ = event.moveZ; return }
  if (event.kind === 'jump-cancel') { state.jumpHeld = false; edges.jumpCancel = true; return }
  if (event.down && !state.jumpHeld) { state.jumpHeld = true; edges.jumpDown = true }
  else if (!event.down && state.jumpHeld) { state.jumpHeld = false; edges.jumpUp = true }
}

export async function runReplay(replay: Replay, limits: ReplayLimits = DEFAULT_REPLAY_LIMITS): Promise<ReplayResult> {
  const { feel, level } = validateReplay(replay, limits)
  const simulation = await createSimulation({ feel, level })
  const state = { moveX: 0, moveZ: 0, jumpHeld: false }
  let cursor = 0
  let heightScore = EMPTY_HEIGHT_SCORE
  let lastSnapshot: SimulationSnapshot | null = null
  try {
    for (let tick = 0; tick < replay.finishTick; tick += 1) {
      const edges = { jumpDown: false, jumpUp: false, jumpCancel: false }
      while (cursor < replay.inputEvents.length && replay.inputEvents[cursor]?.tick === tick) {
        applyEvent(replay.inputEvents[cursor] as ReplayInputEvent, state, edges)
        cursor += 1
      }
      const input: TickInput = { moveX: state.moveX, moveZ: state.moveZ, jumpDown: edges.jumpDown, jumpUp: edges.jumpUp, jumpCancel: edges.jumpCancel }
      simulation.step(input)
      lastSnapshot = simulation.snapshot()
      heightScore = recordHeightScore(
        heightScore,
        worldCenterOfMassYFromSnapshot(lastSnapshot, PHYSICS_V1.egg.centerOfMassY),
        level.origin[1],
        simulation.tick,
      )
    }
    const fingerprint = simulation.fingerprint()
    return {
      snapshot: lastSnapshot ?? simulation.snapshot(),
      fingerprint,
      clientFingerprintMatches: replay.clientFingerprint === undefined ? null : replay.clientFingerprint === fingerprint,
      maxHeightMm: heightScore.maxHeightMm,
      firstTickAtMaxHeight: heightScore.firstTickAtMaxHeight,
      completed: (lastSnapshot ?? simulation.snapshot()).gameplay.completionTick !== null,
      completionTick: (lastSnapshot ?? simulation.snapshot()).gameplay.completionTick,
    }
  } finally {
    simulation.free()
  }
}
