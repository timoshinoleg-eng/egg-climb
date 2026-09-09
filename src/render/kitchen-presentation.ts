export interface KitchenPresentationVec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface KitchenCameraRegion {
  readonly id: 'table-counter' | 'toaster-steam' | 'fridge-cabinet' | 'hood-vent'
  readonly minX: number
  readonly positionOffset: KitchenPresentationVec3
  readonly lookOffset: KitchenPresentationVec3
}

export const KITCHEN_SECTION_ORDER = Object.freeze([
  'table',
  'cutting-board',
  'counter',
  'toaster',
  'steam',
  'fridge',
  'moving-cabinet',
  'hood',
  'vent',
] as const)

export type KitchenSectionId = (typeof KITCHEN_SECTION_ORDER)[number]

export const KITCHEN_CAMERA_REGIONS: readonly KitchenCameraRegion[] = Object.freeze([
  Object.freeze({
    id: 'table-counter' as const,
    minX: Number.NEGATIVE_INFINITY,
    positionOffset: Object.freeze({ x: -4.6, y: 3.4, z: 11.8 }),
    lookOffset: Object.freeze({ x: 3.0, y: 0.8, z: 0 }),
  }),
  Object.freeze({
    id: 'toaster-steam' as const,
    minX: 17.0,
    positionOffset: Object.freeze({ x: -4.8, y: 4.0, z: 12.3 }),
    lookOffset: Object.freeze({ x: 3.2, y: 1.05, z: 0 }),
  }),
  Object.freeze({
    id: 'fridge-cabinet' as const,
    minX: 20.4,
    positionOffset: Object.freeze({ x: -4.7, y: 4.5, z: 12.5 }),
    lookOffset: Object.freeze({ x: 3.2, y: 1.2, z: 0 }),
  }),
  Object.freeze({
    id: 'hood-vent' as const,
    minX: 24.0,
    positionOffset: Object.freeze({ x: -4.0, y: 4.8, z: 11.6 }),
    lookOffset: Object.freeze({ x: 2.5, y: 1.4, z: 0 }),
  }),
])

const SECTION_STARTS: readonly Readonly<{ id: KitchenSectionId; minX: number }>[] = Object.freeze([
  Object.freeze({ id: 'table', minX: Number.NEGATIVE_INFINITY }),
  Object.freeze({ id: 'cutting-board', minX: 12.0 }),
  Object.freeze({ id: 'counter', minX: 14.4 }),
  Object.freeze({ id: 'toaster', minX: 17.0 }),
  Object.freeze({ id: 'steam', minX: 18.8 }),
  Object.freeze({ id: 'fridge', minX: 20.2 }),
  Object.freeze({ id: 'moving-cabinet', minX: 21.8 }),
  Object.freeze({ id: 'hood', minX: 24.0 }),
  Object.freeze({ id: 'vent', minX: 26.2 }),
])

export function kitchenSectionForX(x: number): KitchenSectionId {
  if (!Number.isFinite(x)) return 'table'
  let section: KitchenSectionId = 'table'
  for (const candidate of SECTION_STARTS) {
    if (x >= candidate.minX) section = candidate.id
    else break
  }
  return section
}

export function kitchenSectionIndex(section: KitchenSectionId): number {
  return KITCHEN_SECTION_ORDER.indexOf(section)
}

export function kitchenCameraRegionForX(x: number): KitchenCameraRegion {
  if (!Number.isFinite(x)) return KITCHEN_CAMERA_REGIONS[0]!
  let region = KITCHEN_CAMERA_REGIONS[0]!
  for (const candidate of KITCHEN_CAMERA_REGIONS) {
    if (x >= candidate.minX) region = candidate
    else break
  }
  return region
}

export function kitchenCameraTargets(egg: KitchenPresentationVec3): Readonly<{
  region: KitchenCameraRegion
  position: KitchenPresentationVec3
  lookAt: KitchenPresentationVec3
}> {
  const region = kitchenCameraRegionForX(egg.x)
  return {
    region,
    position: {
      x: egg.x + region.positionOffset.x,
      y: egg.y + region.positionOffset.y,
      z: egg.z + region.positionOffset.z,
    },
    lookAt: {
      x: egg.x + region.lookOffset.x,
      y: egg.y + region.lookOffset.y,
      z: egg.z + region.lookOffset.z,
    },
  }
}

/** Frame-rate-independent exponential response alpha. */
export function exponentialDampingAlpha(deltaSeconds: number, responseSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0
  if (!Number.isFinite(responseSeconds) || responseSeconds <= 0) return 1
  const boundedDelta = Math.min(deltaSeconds, 0.1)
  return 1 - Math.exp(-boundedDelta / responseSeconds)
}

export function dampKitchenVec3(
  current: KitchenPresentationVec3,
  target: KitchenPresentationVec3,
  alpha: number,
): KitchenPresentationVec3 {
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0
  return {
    x: current.x + (target.x - current.x) * t,
    y: current.y + (target.y - current.y) * t,
    z: current.z + (target.z - current.z) * t,
  }
}
