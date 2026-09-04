import {
  AUTHORITATIVE_STATE_VERSION,
  FINGERPRINT_VERSION,
  RAPIER_PACKAGE,
  RAPIER_VERSION,
  SIMULATION_VERSION,
} from './config.js'
import { fingerprintBytes } from './hash.js'

export interface FingerprintEnvelopeInput {
  readonly tick: number
  readonly authoritativeState: Uint8Array
  readonly physicsSnapshot: Uint8Array
}

function writeU32(target: number[], value: number): void {
  const normalized = value >>> 0
  target.push(normalized & 0xff, (normalized >>> 8) & 0xff, (normalized >>> 16) & 0xff, (normalized >>> 24) & 0xff)
}

function writeSafeInteger(target: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Fingerprint tick must be a non-negative safe integer')
  const low = value >>> 0
  const high = Math.floor(value / 0x100000000)
  writeU32(target, low)
  writeU32(target, high)
}

function writeAscii(target: number[], value: string): void {
  writeU32(target, value.length)
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code > 0x7f) throw new Error('Fingerprint envelope identifiers must be ASCII')
    target.push(code)
  }
}

function writeBytes(target: number[], value: Uint8Array): void {
  writeU32(target, value.byteLength)
  for (const byte of value) target.push(byte)
}

/**
 * Canonical versioned envelope for deterministic telemetry/regression fingerprints.
 * Any future authoritative state outside Rapier must be serialized explicitly into
 * authoritativeState and requires an AUTHORITATIVE_STATE_VERSION bump when its schema changes.
 */
export function encodeFingerprintEnvelope(input: FingerprintEnvelopeInput): Uint8Array {
  const bytes: number[] = []
  bytes.push(0x45, 0x47, 0x47, 0x43) // EGGC
  writeU32(bytes, FINGERPRINT_VERSION)
  writeAscii(bytes, SIMULATION_VERSION)
  writeAscii(bytes, RAPIER_PACKAGE)
  writeAscii(bytes, RAPIER_VERSION)
  writeU32(bytes, AUTHORITATIVE_STATE_VERSION)
  writeSafeInteger(bytes, input.tick)
  writeBytes(bytes, input.authoritativeState)
  writeBytes(bytes, input.physicsSnapshot)
  return Uint8Array.from(bytes)
}

export function fingerprintSimulationState(input: FingerprintEnvelopeInput): string {
  return fingerprintBytes(encodeFingerprintEnvelope(input))
}
