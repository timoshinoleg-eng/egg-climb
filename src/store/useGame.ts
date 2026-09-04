import { create } from 'zustand'

export type GamePhase = 'ready' | 'playing' | 'won'
export type JumpQuality = 'SIDE' | 'ANGLED' | 'GOOD' | 'PERFECT'

type GameState = {
  phase: GamePhase
  runId: number
  height: number
  bestHeight: number
  jumpQuality: JumpQuality
  start: () => void
  updateHeight: (height: number) => void
  setJumpQuality: (quality: JumpQuality) => void
  win: () => void
  restart: () => void
}

export const useGame = create<GameState>((set) => ({
  phase: 'ready',
  runId: 0,
  height: 0,
  bestHeight: 0,
  jumpQuality: 'SIDE',
  start: () => set((state) => (state.phase === 'ready' ? { phase: 'playing' } : state)),
  updateHeight: (height) =>
    set((state) => ({
      height,
      bestHeight: Math.max(state.bestHeight, height),
    })),
  setJumpQuality: (jumpQuality) => set({ jumpQuality }),
  win: () => set({ phase: 'won' }),
  restart: () => set((state) => ({ phase: 'ready', runId: state.runId + 1, height: 0 })),
}))
