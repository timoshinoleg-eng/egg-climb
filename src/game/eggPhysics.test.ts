import { describe, expect, it } from 'vitest'
import { clampInput, getJumpProfile, getTipAlignment } from './eggPhysics'

describe('egg physics tuning', () => {
  it('treats identity rotation as tip-up', () => {
    expect(getTipAlignment({ x: 0, y: 0, z: 0, w: 1 })).toBe(1)
  })

  it('treats a 90 degree roll as side-on', () => {
    const s = Math.SQRT1_2
    expect(getTipAlignment({ x: s, y: 0, z: 0, w: s })).toBeCloseTo(0, 6)
  })

  it('scales jump force with orientation quality', () => {
    const side = getJumpProfile(0)
    const angled = getJumpProfile(0.4)
    const good = getJumpProfile(0.75)
    const perfect = getJumpProfile(0.95)

    expect(side.quality).toBe('SIDE')
    expect(perfect.quality).toBe('PERFECT')
    expect(side.impulse).toBeLessThan(angled.impulse)
    expect(angled.impulse).toBeLessThan(good.impulse)
    expect(good.impulse).toBeLessThan(perfect.impulse)
  })

  it('clamps analog input', () => {
    expect(clampInput(-4)).toBe(-1)
    expect(clampInput(0.4)).toBe(0.4)
    expect(clampInput(3)).toBe(1)
  })
})
