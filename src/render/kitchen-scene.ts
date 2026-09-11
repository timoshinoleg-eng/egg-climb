/** Read-only presentation geometry for the canonical 3D Kitchen level. */
import type { SimulationSnapshot } from '../sim/contracts.js'
import { KITCHEN_LEVEL, KITCHEN_LEVEL_DEFINITION, kinematicOffsetAtTick } from '../sim/level.js'
import type { KinematicBoxDefinition, StaticBoxDefinition } from '../sim/level.js'

export interface ViewPoint { x: number; y: number; z: number }
export interface KitchenCamera { x: number; y: number; z: number; scale: number }
export interface KitchenProjection { x: number; y: number; depth: number }

/** Fixed oblique projection preserves X/Y/Z; it does not flatten the physics to 2D. */
export function projectKitchenPoint(point: ViewPoint, camera: KitchenCamera, width: number, height: number): KitchenProjection {
  const x = point.x - camera.x, y = point.y - camera.y, z = point.z - camera.z
  return {
    x: width * 0.45 + (x - z * 0.24) * camera.scale,
    y: height * 0.55 + (-y + z * 0.22) * camera.scale,
    depth: point.x * 0.24 + point.y * 0.22 + point.z,
  }
}

export function kinematicRenderCenter(box: KinematicBoxDefinition, previousTick: number, currentTick: number, alpha: number): ViewPoint {
  const t = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0
  const previous = kinematicOffsetAtTick(box, previousTick)
  const current = kinematicOffsetAtTick(box, currentTick)
  return {
    x: box.center[0] + previous[0] + (current[0] - previous[0]) * t,
    y: box.center[1] + previous[1] + (current[1] - previous[1]) * t,
    z: box.center[2] + previous[2] + (current[2] - previous[2]) * t,
  }
}

export interface KitchenBoxView {
  readonly definition: StaticBoxDefinition
  readonly moving: boolean
  readonly center: ViewPoint
  /** Eight world-space corners, shared by all faces; rewritten only for moving geometry. */
  readonly corners: Float64Array
}

export function writeBoxCorners(target: Float64Array, box: StaticBoxDefinition, center: ViewPoint): void {
  if (target.length !== 24) throw new Error('A box requires exactly eight 3D corners')
  const [qx, qy, qz, qw] = box.rotation ?? [0, 0, 0, 1]
  for (let i = 0; i < 8; i++) {
    const x = box.halfExtents[0] * (i & 1 ? 1 : -1)
    const y = box.halfExtents[1] * (i & 2 ? 1 : -1)
    const z = box.halfExtents[2] * (i & 4 ? 1 : -1)
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x)
    target[i * 3] = center.x + x + qw * tx + qy * tz - qz * ty
    target[i * 3 + 1] = center.y + y + qw * ty + qz * tx - qx * tz
    target[i * 3 + 2] = center.z + z + qw * tz + qx * ty - qy * tx
  }
}

export class KitchenScene {
  readonly boxes: readonly KitchenBoxView[]
  private readonly movingBoxes: readonly KitchenBoxView[]
  private steamActiveValue = false
  private completionTickValue: number | null = null

  constructor() {
    this.boxes = [
      ...KITCHEN_LEVEL_DEFINITION.staticBoxes.map(definition => this.box(definition, false)),
      ...KITCHEN_LEVEL_DEFINITION.kinematicBoxes.map(definition => this.box(definition, true)),
    ]
    this.movingBoxes = this.boxes.filter(box => box.moving)
  }
  private box(definition: StaticBoxDefinition, moving: boolean): KitchenBoxView {
    const center = { x: definition.center[0], y: definition.center[1], z: definition.center[2] }
    const corners = new Float64Array(24)
    writeBoxCorners(corners, definition, center)
    return { definition, center, corners, moving }
  }
  update(previous: SimulationSnapshot, current: SimulationSnapshot, alpha: number): void {
    if (current.identity.levelHash !== KITCHEN_LEVEL.hash || current.identity.levelId !== KITCHEN_LEVEL.id ||
      current.identity.levelVersion !== KITCHEN_LEVEL.version || current.identity.levelFormatVersion !== KITCHEN_LEVEL.formatVersion) {
      throw new Error('Kitchen renderer requires the canonical Kitchen snapshot')
    }
    for (const box of this.movingBoxes) {
      const position = kinematicRenderCenter(box.definition as KinematicBoxDefinition, previous.tick, current.tick, alpha)
      box.center.x = position.x; box.center.y = position.y; box.center.z = position.z
      writeBoxCorners(box.corners, box.definition, box.center)
    }
    this.steamActiveValue = current.gameplay.activeContinuousForceZoneIds.includes('coffee-steam')
    this.completionTickValue = current.gameplay.completionTick
  }
  get steamActive(): boolean { return this.steamActiveValue }
  get completionTick(): number | null { return this.completionTickValue }
  get cabinetY(): number { return this.movingBoxes[0]!.center.y }
}
