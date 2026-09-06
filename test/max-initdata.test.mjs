import assert from 'node:assert/strict'
import test from 'node:test'
import { extractWebAppData, validateMaxInitData } from '../dist/server/max-initdata.js'

// Vectors computed with the official algorithm from
// dev.max.ru/docs/webapps/validation:
//   secret = HMAC-SHA256(key: "WebAppData", data: BOT_TOKEN)
//   hash   = hex(HMAC-SHA256(key: secret, data: sorted key=value pairs joined by "\n"))
const BOT_TOKEN = 'egg-climb-test-bot-token'
const AUTH_DATE = 1773000000

const VALID_INIT_DATA =
  'auth_date=1773000000&ip=127.0.0.1&query_id=test-query-0001' +
  '&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22Oleg%22%2C%22username%22%3A%22oleg%22%7D' +
  '&hash=e554295f8c2d007d1a5325ac0fb4c5303f719b2d69cba7dfe8f6ac8748874982'

const NO_AUTH_DATE_INIT_DATA =
  'ip=127.0.0.1&query_id=test-query-0001' +
  '&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22Oleg%22%2C%22username%22%3A%22oleg%22%7D' +
  '&hash=6a3b473eeadeff5d50e43f65998e91352a79ae8743f2a2206657304a8c32efb7'

test('valid WebAppData passes and exposes the user payload', async () => {
  const res = await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 })
  assert.ok(res.ok, `expected ok, got ${JSON.stringify(res)}`)
  assert.equal(res.userId, 42)
  assert.equal(res.displayName, 'Oleg')
  assert.equal(res.authDate, AUTH_DATE)
  assert.equal(res.queryId, 'test-query-0001')
})

test('a tampered value fails the signature check', async () => {
  const tampered = VALID_INIT_DATA.replace('127.0.0.1', '127.0.0.2')
  const res = await validateMaxInitData(tampered, BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 })
  assert.deepEqual(res, { ok: false, reason: 'signature mismatch' })
})

test('a wrong bot token fails the signature check', async () => {
  const res = await validateMaxInitData(VALID_INIT_DATA, 'another-token', { nowSeconds: AUTH_DATE + 60 })
  assert.deepEqual(res, { ok: false, reason: 'signature mismatch' })
})

test('missing, duplicated or malformed hash parameters are rejected', async () => {
  assert.deepEqual(
    await validateMaxInitData('auth_date=1773000000&ip=127.0.0.1', BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 }),
    { ok: false, reason: 'missing hash' },
  )
  assert.deepEqual(
    await validateMaxInitData(`${VALID_INIT_DATA}&hash=abcd`, BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 }),
    { ok: false, reason: 'duplicate hash' },
  )
  assert.deepEqual(
    await validateMaxInitData('ip=127.0.0.1&hash=abcd', BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 }),
    { ok: false, reason: 'malformed hash' },
  )
})

test('stale and future-skewed auth_date are rejected, freshness can be disabled', async () => {
  assert.deepEqual(
    await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE + 901 }),
    { ok: false, reason: 'stale auth_date' },
  )
  assert.deepEqual(
    await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE - 901 }),
    { ok: false, reason: 'stale auth_date' },
  )
  const res = await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { maxAgeSeconds: 0, nowSeconds: AUTH_DATE + 999999 })
  assert.ok(res.ok)
})

test('data without auth_date needs freshness disabled to pass', async () => {
  assert.deepEqual(
    await validateMaxInitData(NO_AUTH_DATE_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 }),
    { ok: false, reason: 'missing auth_date' },
  )
  const res = await validateMaxInitData(NO_AUTH_DATE_INIT_DATA, BOT_TOKEN, { maxAgeSeconds: 0 })
  assert.ok(res.ok)
  assert.equal(res.userId, 42)
})

test('extractWebAppData pulls the encoded payload out of a launch URL', () => {
  const url = `https://app.example/#WebAppPlatform=web&WebAppData=${encodeURIComponent(VALID_INIT_DATA)}`
  assert.equal(extractWebAppData(url), VALID_INIT_DATA)
  assert.equal(extractWebAppData('https://app.example/'), null)
  assert.equal(extractWebAppData('https://app.example/#other=1'), null)
})
