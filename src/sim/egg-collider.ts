import { EGG_COLLIDER_HASH, EGG_COLLIDER_ID, EGG_COLLIDER_VERSION } from './config.js'
import { fingerprintBytes } from './hash.js'

export const EGG_COLLIDER_MIN_Y = -0.62 as const
export const EGG_COLLIDER_MAX_Y = 0.8 as const

/** Pre-baked offline; radial slices are committed literals, never generated at runtime. */
export const EGG_COLLIDER_VERTEX_DATA: readonly number[] = Object.freeze([
  0, -0.62, 0, 0.32, -0.5, 0, 0.27712813, -0.5, 0.16,
  0.16, -0.5, 0.27712813, 0, -0.5, 0.32, -0.16, -0.5, 0.27712813,
  -0.27712813, -0.5, 0.16, -0.32, -0.5, 0, -0.27712813, -0.5, -0.16,
  -0.16, -0.5, -0.27712813, 0, -0.5, -0.32, 0.16, -0.5, -0.27712813,
  0.27712813, -0.5, -0.16, 0.5, -0.18, 0, 0.4330127, -0.18, 0.25,
  0.25, -0.18, 0.4330127, 0, -0.18, 0.5, -0.25, -0.18, 0.4330127,
  -0.4330127, -0.18, 0.25, -0.5, -0.18, 0, -0.4330127, -0.18, -0.25,
  -0.25, -0.18, -0.4330127, 0, -0.18, -0.5, 0.25, -0.18, -0.4330127,
  0.4330127, -0.18, -0.25, 0.45, 0.16, 0, 0.38971143, 0.16, 0.225,
  0.225, 0.16, 0.38971143, 0, 0.16, 0.45, -0.225, 0.16, 0.38971143,
  -0.38971143, 0.16, 0.225, -0.45, 0.16, 0, -0.38971143, 0.16, -0.225,
  -0.225, 0.16, -0.38971143, 0, 0.16, -0.45, 0.225, 0.16, -0.38971143,
  0.38971143, 0.16, -0.225, 0.32, 0.44, 0, 0.27712813, 0.44, 0.16,
  0.16, 0.44, 0.27712813, 0, 0.44, 0.32, -0.16, 0.44, 0.27712813,
  -0.27712813, 0.44, 0.16, -0.32, 0.44, 0, -0.27712813, 0.44, -0.16,
  -0.16, 0.44, -0.27712813, 0, 0.44, -0.32, 0.16, 0.44, -0.27712813,
  0.27712813, 0.44, -0.16, 0.16, 0.66, 0, 0.13856406, 0.66, 0.08,
  0.08, 0.66, 0.13856406, 0, 0.66, 0.16, -0.08, 0.66, 0.13856406,
  -0.13856406, 0.66, 0.08, -0.16, 0.66, 0, -0.13856406, 0.66, -0.08,
  -0.08, 0.66, -0.13856406, 0, 0.66, -0.16, 0.08, 0.66, -0.13856406,
  0.13856406, 0.66, -0.08, 0, 0.8, 0,
])

export const EGG_COLLIDER_INDEX_DATA: readonly number[] = Object.freeze([
  0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7,
  0, 7, 8, 0, 8, 9, 0, 9, 10, 0, 10, 11, 0, 11, 12, 0, 12, 1,
  1, 14, 2, 1, 13, 14, 2, 15, 3, 2, 14, 15, 3, 16, 4, 3, 15, 16,
  4, 17, 5, 4, 16, 17, 5, 18, 6, 5, 17, 18, 6, 19, 7, 6, 18, 19,
  7, 20, 8, 7, 19, 20, 8, 21, 9, 8, 20, 21, 9, 22, 10, 9, 21, 22,
  10, 23, 11, 10, 22, 23, 11, 24, 12, 11, 23, 24, 12, 13, 1, 12, 24, 13,
  13, 26, 14, 13, 25, 26, 14, 27, 15, 14, 26, 27, 15, 28, 16, 15, 27, 28,
  16, 29, 17, 16, 28, 29, 17, 30, 18, 17, 29, 30, 18, 31, 19, 18, 30, 31,
  19, 32, 20, 19, 31, 32, 20, 33, 21, 20, 32, 33, 21, 34, 22, 21, 33, 34,
  22, 35, 23, 22, 34, 35, 23, 36, 24, 23, 35, 36, 24, 25, 13, 24, 36, 25,
  25, 38, 26, 25, 37, 38, 26, 39, 27, 26, 38, 39, 27, 40, 28, 27, 39, 40,
  28, 41, 29, 28, 40, 41, 29, 42, 30, 29, 41, 42, 30, 43, 31, 30, 42, 43,
  31, 44, 32, 31, 43, 44, 32, 45, 33, 32, 44, 45, 33, 46, 34, 33, 45, 46,
  34, 47, 35, 34, 46, 47, 35, 48, 36, 35, 47, 48, 36, 37, 25, 36, 48, 37,
  37, 50, 38, 37, 49, 50, 38, 51, 39, 38, 50, 51, 39, 52, 40, 39, 51, 52,
  40, 53, 41, 40, 52, 53, 41, 54, 42, 41, 53, 54, 42, 55, 43, 42, 54, 55,
  43, 56, 44, 43, 55, 56, 44, 57, 45, 44, 56, 57, 45, 58, 46, 45, 57, 58,
  46, 59, 47, 46, 58, 59, 47, 60, 48, 47, 59, 60, 48, 49, 37, 48, 60, 49,
  49, 61, 50, 50, 61, 51, 51, 61, 52, 52, 61, 53, 53, 61, 54, 54, 61, 55,
  55, 61, 56, 56, 61, 57, 57, 61, 58, 58, 61, 59, 59, 61, 60, 60, 61, 49,
])

export function createEggColliderVertices(): Float32Array {
  return Float32Array.from(EGG_COLLIDER_VERTEX_DATA)
}

export function createEggColliderIndices(): Uint32Array {
  return Uint32Array.from(EGG_COLLIDER_INDEX_DATA)
}

export function computeEggColliderHash(): string {
  const vertexCount = EGG_COLLIDER_VERTEX_DATA.length / 3
  const byteLength = 8 + 8 + EGG_COLLIDER_VERTEX_DATA.length * 4 + EGG_COLLIDER_INDEX_DATA.length * 4
  const bytes = new Uint8Array(byteLength)
  const view = new DataView(bytes.buffer)
  bytes.set([0x45, 0x47, 0x47, 0x48, 0x55, 0x4c, 0x4c, 0x31], 0) // EGGHULL1
  let offset = 8
  view.setUint32(offset, vertexCount, true); offset += 4
  view.setUint32(offset, EGG_COLLIDER_INDEX_DATA.length, true); offset += 4
  for (const value of EGG_COLLIDER_VERTEX_DATA) { view.setFloat32(offset, value, true); offset += 4 }
  for (const value of EGG_COLLIDER_INDEX_DATA) { view.setUint32(offset, value, true); offset += 4 }
  return fingerprintBytes(bytes)
}

export const EGG_COLLIDER_IDENTITY = Object.freeze({
  id: EGG_COLLIDER_ID,
  version: EGG_COLLIDER_VERSION,
  hash: EGG_COLLIDER_HASH,
  vertexCount: EGG_COLLIDER_VERTEX_DATA.length / 3,
  triangleCount: EGG_COLLIDER_INDEX_DATA.length / 3,
})
