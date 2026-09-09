import assert from 'node:assert/strict'
import test from 'node:test'
import { SafeStorage, isBestScore, BEST_SCORE_KEY } from '../dist/game/storage.js'

test('unavailable localStorage getter never escapes into gameplay', () => {
  const storage = new SafeStorage(() => { throw new Error('SecurityError') })
  assert.equal(storage.read(BEST_SCORE_KEY, 0, isBestScore), 0)
  assert.equal(storage.write(BEST_SCORE_KEY, 42), false)
})

test('quota failures and circular serialization fall back without losing the in-memory score', () => {
  const memory = { best: 120 }
  const storage = new SafeStorage(() => ({ getItem: () => null, setItem() { throw new Error('QuotaExceededError') } }))
  assert.equal(storage.write(BEST_SCORE_KEY, memory.best), false); assert.equal(memory.best, 120)
  const circle = {}; circle.self = circle
  assert.equal(storage.write('bad', circle), false)
  assert.equal(storage.write('bad', undefined), false)
})

test('malformed, oversized and hostile persisted values are rejected', () => {
  for (const text of ['{', 'null', '[]', '-1', '1.1', '10000001', '"<img src=x onerror=alert(1)>"', '1'.repeat(300000)]) {
    const storage = new SafeStorage(() => ({ getItem: () => text, setItem() {} }))
    assert.equal(storage.read(BEST_SCORE_KEY, 0, isBestScore), 0)
  }
})

test('valid score persists and round-trips without HTML rendering', () => {
  const entries = new Map()
  const storage = new SafeStorage(() => ({ getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }))
  assert.equal(storage.write(BEST_SCORE_KEY, 420), true)
  assert.equal(storage.read(BEST_SCORE_KEY, 0, isBestScore), 420)
})
