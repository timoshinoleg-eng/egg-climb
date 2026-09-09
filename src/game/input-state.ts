import { NEUTRAL_INPUT } from '../sim/contracts.js'
import type { TickInput } from '../sim/contracts.js'

export type InputAction = 'left' | 'right' | 'forward' | 'backward' | 'jump'

/** Multiple pointers/keyboard keys may own the same action independently. */
export class InputState {
  private readonly owners = new Map<string, InputAction>()
  private jumpDown = false
  private jumpUp = false
  private jumpCancel = false

  held(action: InputAction): boolean {
    for (const value of this.owners.values()) if (value === action) return true
    return false
  }

  press(action: InputAction, owner: string): void {
    if (this.owners.has(owner)) return
    if (action === 'jump' && !this.held('jump')) this.jumpDown = true
    this.owners.set(owner, action)
  }

  release(owner: string, cancelled = false): void {
    const action = this.owners.get(owner)
    if (action === undefined) return
    this.owners.delete(owner)
    if (action === 'jump' && !this.held('jump')) {
      if (cancelled) { this.jumpCancel = true; this.jumpUp = false }
      else if (!this.jumpCancel) this.jumpUp = true
    }
  }

  /** Focus loss must cancel, never synthesize a charged jump on resume. */
  cancel(): void {
    const wasCharging = this.held('jump') || this.jumpDown || this.jumpUp
    this.reset()
    this.jumpCancel = wasCharging
  }

  reset(): void {
    this.owners.clear()
    this.jumpDown = false
    this.jumpUp = false
    this.jumpCancel = false
  }

  sample(planar = true): TickInput {
    const input: TickInput = {
      ...NEUTRAL_INPUT,
      moveX: Number(this.held('right')) - Number(this.held('left')),
      moveZ: planar ? 0 : Number(this.held('backward')) - Number(this.held('forward')),
      jumpDown: this.jumpDown && !this.jumpCancel,
      jumpUp: this.jumpUp && !this.jumpCancel,
      jumpCancel: this.jumpCancel,
    }
    this.jumpDown = false
    this.jumpUp = false
    this.jumpCancel = false
    return input
  }
}
