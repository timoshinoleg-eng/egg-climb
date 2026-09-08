import type { Replay, ReplayInputEvent } from '../sim/contracts.js'
import type { LevelDefinition } from '../sim/level.js'
import { canonicalJson, sha256HexText } from './canonical-json.js'

/** Canonical rules whose SHA-256 is DAILY_RULESET_HASH in sim/config.ts. */
export const DAILY_RULESET_DEFINITION = Object.freeze({
  version: 1,
  scoreSample: 'world-com-y-after-completed-authoritative-tick-relative-to-level-origin',
  heightUnit: 'millimeter',
  quantization: 'nearest-millimeter-half-away-from-zero',
  completionOrdering: 'completed-before-incomplete',
  completedOrdering: Object.freeze(['completion-tick-asc', 'run-id-asc']),
  incompleteOrdering: Object.freeze(['max-height-mm-desc', 'first-tick-at-max-height-asc', 'run-id-asc']),
})

export function canonicalLevelJson(level: LevelDefinition): string {
  return canonicalJson(level)
}

export async function canonicalLevelSha256(level: LevelDefinition): Promise<string> {
  return sha256HexText(canonicalLevelJson(level))
}

export async function canonicalRulesetSha256(): Promise<string> {
  return sha256HexText(canonicalJson(DAILY_RULESET_DEFINITION))
}

function canonicalReplayInputEvent(event: ReplayInputEvent): unknown {
  switch (event.kind) {
    case 'move':
      return { tick: event.tick, seq: event.seq, kind: event.kind, moveX: event.moveX, moveZ: event.moveZ }
    case 'jump':
      return { tick: event.tick, seq: event.seq, kind: event.kind, down: event.down }
    case 'jump-cancel':
      return { tick: event.tick, seq: event.seq, kind: event.kind }
  }
  throw new Error('Unsupported replay input event')
}

/**
 * Canonical authoritative replay evidence. Runtime-only/unknown properties and
 * clientFingerprint are deliberately excluded so ignored data cannot create a
 * second accepted-attempt identity for the same authoritative replay.
 */
export function canonicalReplayJson(replay: Replay): string {
  const header = replay.header
  return canonicalJson({
    header: {
      protocolVersion: header.protocolVersion,
      simulationVersion: header.simulationVersion,
      rapierPackage: header.rapierPackage,
      rapierVersion: header.rapierVersion,
      fingerprintVersion: header.fingerprintVersion,
      physicsPresetId: header.physicsPresetId,
      physicsPresetVersion: header.physicsPresetVersion,
      physicsPresetHash: header.physicsPresetHash,
      eggColliderId: header.eggColliderId,
      eggColliderVersion: header.eggColliderVersion,
      eggColliderHash: header.eggColliderHash,
      feelPresetId: header.feelPresetId,
      feelPresetVersion: header.feelPresetVersion,
      feelPresetHash: header.feelPresetHash,
      tickRate: header.tickRate,
      levelId: header.levelId,
      levelVersion: header.levelVersion,
      levelFormatVersion: header.levelFormatVersion,
      levelHash: header.levelHash,
      generatorVersion: header.generatorVersion,
      rulesetHash: header.rulesetHash,
      seed: header.seed,
      dimensionMode: header.dimensionMode,
      controlMode: header.controlMode,
      assistPresetId: header.assistPresetId,
    },
    inputEvents: replay.inputEvents.map(canonicalReplayInputEvent),
    finishTick: replay.finishTick,
  })
}

export async function canonicalReplaySha256(replay: Replay): Promise<string> {
  return sha256HexText(canonicalReplayJson(replay))
}
