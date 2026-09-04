import { create } from 'zustand'

type InputState = {
  x: number
  y: number
  jumpNonce: number
  setMove: (x: number, y: number) => void
  triggerJump: () => void
  resetMove: () => void
}

export const useInput = create<InputState>((set) => ({
  x: 0,
  y: 0,
  jumpNonce: 0,
  setMove: (x, y) => set({ x, y }),
  triggerJump: () => set((state) => ({ jumpNonce: state.jumpNonce + 1 })),
  resetMove: () => set({ x: 0, y: 0 }),
}))
