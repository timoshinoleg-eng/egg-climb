export type KitchenCameraRegionId =
  | 'table-counter'
  | 'toaster-steam'
  | 'fridge-cabinet'
  | 'hood-vent'

export interface KitchenCameraRegion {
  readonly id: KitchenCameraRegionId
  readonly minX: number
  /** Additional forward look-ahead on top of the existing follow camera. */
  readonly leadX: number
  /** Additional vertical look-ahead on top of the existing follow camera. */
  readonly liftY: number
  /** Multiplier applied to the existing follow scale. Values below 1 widen the view. */
  readonly zoom: number
  readonly responseSeconds: number
}

export interface KitchenRouteCue {
  readonly id: 'toaster' | 'steam' | 'cabinet' | 'vent' | 'freedom'
  readonly minX: number
  readonly label: string
}

export const KITCHEN_CAMERA_REGIONS: readonly KitchenCameraRegion[] = Object.freeze([
  Object.freeze({
    id: 'table-counter' as const,
    minX: Number.NEGATIVE_INFINITY,
    leadX: 0,
    liftY: 0,
    zoom: 1,
    responseSeconds: 0.24,
  }),
  Object.freeze({
    id: 'toaster-steam' as const,
    minX: 16.5,
    leadX: 0.62,
    liftY: 0.28,
    zoom: 0.96,
    responseSeconds: 0.22,
  }),
  Object.freeze({
    id: 'fridge-cabinet' as const,
    minX: 20.2,
    leadX: 0.46,
    liftY: 0.56,
    zoom: 0.93,
    responseSeconds: 0.24,
  }),
  Object.freeze({
    id: 'hood-vent' as const,
    minX: 23.7,
    leadX: 0.3,
    liftY: 0.78,
    zoom: 0.9,
    responseSeconds: 0.26,
  }),
])

export const KITCHEN_ROUTE_CUES: readonly KitchenRouteCue[] = Object.freeze([
  Object.freeze({ id: 'toaster' as const, minX: Number.NEGATIVE_INFINITY, label: 'NEXT · TOASTER POP' }),
  Object.freeze({ id: 'steam' as const, minX: 17.55, label: 'NEXT · STEAM LIFT' }),
  Object.freeze({ id: 'cabinet' as const, minX: 19.35, label: 'NEXT · MOVING CABINET' }),
  Object.freeze({ id: 'vent' as const, minX: 22.75, label: 'NEXT · OPEN VENT' }),
  Object.freeze({ id: 'freedom' as const, minX: 26.15, label: 'VENT · FREEDOM' }),
])

export function kitchenCameraRegionForX(x: number): KitchenCameraRegion {
  if (!Number.isFinite(x)) return KITCHEN_CAMERA_REGIONS[0]!
  let region = KITCHEN_CAMERA_REGIONS[0]!
  for (const candidate of KITCHEN_CAMERA_REGIONS) {
    if (x >= candidate.minX) region = candidate
    else break
  }
  return region
}

export function kitchenRouteCueForX(x: number): KitchenRouteCue {
  if (!Number.isFinite(x)) return KITCHEN_ROUTE_CUES[0]!
  let cue = KITCHEN_ROUTE_CUES[0]!
  for (const candidate of KITCHEN_ROUTE_CUES) {
    if (x >= candidate.minX) cue = candidate
    else break
  }
  return cue
}

/** Frame-rate-independent exponential response alpha. */
export function exponentialDampingAlpha(deltaSeconds: number, responseSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0
  if (!Number.isFinite(responseSeconds) || responseSeconds <= 0) return 1
  return 1 - Math.exp(-Math.min(deltaSeconds, 0.1) / responseSeconds)
}

export function dampKitchenScalar(current: number, target: number, alpha: number): number {
  const from = Number.isFinite(current) ? current : 0
  const to = Number.isFinite(target) ? target : from
  const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0
  return from + (to - from) * t
}
