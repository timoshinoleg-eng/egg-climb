import type { Replay } from '../sim/contracts.js'
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

/**
 * Canonical authoritative replay evidence. clientFingerprint is deliberately
 * excluded: it is untrusted telemetry and must not change attempt identity.
 */
export function canonicalReplayJson(replay: Replay): string {
  return canonicalJson({
    header: replay.header,
    inputEvents: replay.inputEvents,
    finishTick: replay.finishTick,
  })
}

export async function canonicalReplaySha256(replay: Replay): Promise<string> {
  return sha256HexText(canonicalReplayJson(replay))
}
