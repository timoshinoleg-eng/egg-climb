/** Browser persistence is optional. Even obtaining localStorage can throw. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class SafeStorage {
  constructor(private readonly getStorage: () => StorageLike = () => globalThis.localStorage) {}

  read<T>(key: string, fallback: T, validate: (value: unknown) => value is T, maxBytes = 262_144): T {
    try {
      const text = this.getStorage().getItem(key)
      if (text === null || text.length > maxBytes) return fallback
      const parsed: unknown = JSON.parse(text)
      return validate(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }

  write(key: string, value: unknown): boolean {
    try {
      const text = JSON.stringify(value)
      if (text === undefined) return false
      this.getStorage().setItem(key, text)
      return true
    } catch {
      return false
    }
  }
}

export const BEST_SCORE_KEY = 'egg-climb-arcade-best-v1'
export const isBestScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000
