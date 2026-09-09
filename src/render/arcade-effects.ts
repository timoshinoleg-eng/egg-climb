/** Bounded, allocation-free-in-update presentation pools; never authoritative. */
export type ParticleKind = 'dust' | 'shell' | 'spark'
const KINDS: Readonly<Record<ParticleKind, number>> = { dust: 0, shell: 1, spark: 2 }
export class ParticlePool {
  readonly x: Float32Array
  readonly y: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  readonly life: Float32Array
  readonly duration: Float32Array
  readonly size: Float32Array
  readonly rotation: Float32Array
  readonly kind: Uint8Array
  private cursor = 0
  private seed = 41

  constructor(readonly capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1024) throw new Error('Invalid particle capacity')
    this.x = new Float32Array(capacity); this.y = new Float32Array(capacity)
    this.vx = new Float32Array(capacity); this.vy = new Float32Array(capacity)
    this.life = new Float32Array(capacity); this.duration = new Float32Array(capacity)
    this.size = new Float32Array(capacity); this.rotation = new Float32Array(capacity)
    this.kind = new Uint8Array(capacity)
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  spawn(x: number, y: number, kind: ParticleKind, count: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(count)) return
    const bounded = Math.min(this.capacity, Math.max(0, Math.floor(count)))
    for (let n = 0; n < bounded; n += 1) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
      const spread = kind === 'shell' ? 5 : kind === 'spark' ? 3.4 : 2.3
      this.x[i] = x; this.y[i] = y
      this.vx[i] = (this.random() - 0.5) * spread
      this.vy[i] = (0.2 + this.random()) * (kind === 'dust' ? 1.2 : 3.2)
      this.duration[i] = this.life[i] = 0.35 + this.random() * 0.65
      this.size[i] = kind === 'shell' ? 0.06 + this.random() * 0.09 : 0.025 + this.random() * 0.04
      this.rotation[i] = this.random() * Math.PI * 2
      this.kind[i] = KINDS[kind]
    }
  }

  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i]! <= 0) continue
      this.life[i] = Math.max(0, this.life[i]! - dt)
      this.vy[i] = this.vy[i]! - (this.kind[i] === 0 ? 2 : 5.5) * dt
      this.x[i] = this.x[i]! + this.vx[i]! * dt
      this.y[i] = this.y[i]! + this.vy[i]! * dt
      this.rotation[i] = this.rotation[i]! + this.vx[i]! * dt
    }
  }

  get activeCount(): number {
    let count = 0
    for (let i = 0; i < this.capacity; i += 1) if (this.life[i]! > 0) count += 1
    return count
  }

  reset(): void {
    for (const buffer of [this.x, this.y, this.vx, this.vy, this.life, this.duration, this.size, this.rotation, this.kind]) buffer.fill(0)
    this.cursor = 0; this.seed = 41
  }
}

export interface FloatingLabel { x: number; y: number; text: string; life: number; bonus: boolean }
export class FloatingLabels {
  readonly slots: FloatingLabel[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0, text: '', life: 0, bonus: false }))
  private cursor = 0
  spawn(x: number, y: number, text: string, bonus = false): void {
    const label = this.slots[this.cursor]!
    label.x = x; label.y = y; label.text = text; label.life = 1; label.bonus = bonus
    this.cursor = (this.cursor + 1) % this.slots.length
  }
  update(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0
    for (const label of this.slots) label.life = Math.max(0, label.life - dt)
  }
  reset(): void { for (const label of this.slots) { label.life = 0; label.text = ''; label.x = 0; label.y = 0; label.bonus = false }; this.cursor = 0 }
}

/** Measured cadence and JS render work; does not mistake simulation Hz for FPS. */
export class FrameMeter {
  private readonly intervals = new Float32Array(240)
  private readonly work = new Float32Array(240)
  private cursor = 0
  private count = 0
  record(intervalMs: number, workMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(workMs) || workMs < 0) return
    this.intervals[this.cursor] = intervalMs; this.work[this.cursor] = workMs
    this.cursor = (this.cursor + 1) % this.intervals.length
    this.count = Math.min(this.count + 1, this.intervals.length)
  }
  summary(): { fps: number; p95Ms: number; workP95Ms: number; frames: number } {
    if (this.count === 0) return { fps: 0, p95Ms: 0, workP95Ms: 0, frames: 0 }
    const intervals = this.intervals.slice(0, this.count).sort()
    const work = this.work.slice(0, this.count).sort()
    const total = intervals.reduce((sum, value) => sum + value, 0)
    const p95 = Math.ceil(this.count * 0.95) - 1
    return { fps: 1000 * this.count / total, p95Ms: intervals[p95]!, workP95Ms: work[p95]!, frames: this.count }
  }
  reset(): void { this.cursor = 0; this.count = 0; this.intervals.fill(0); this.work.fill(0) }
}

export function canvasPixelRatio(deviceRatio: number, quality: 'high' | 'medium' | 'low'): number {
  const ratio = Number.isFinite(deviceRatio) ? Math.max(1, deviceRatio) : 1
  return Math.min(ratio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1)
}
