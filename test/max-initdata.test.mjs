import assert from 'node:assert/strict'
import test from 'node:test'
import { extractWebAppData, validateMaxInitData } from '../dist/server/max-initdata.js'

// Fixed vectors independently computed from the official MAX algorithm with
// Python's hmac/hashlib, not by the implementation under test.
const BOT_TOKEN = 'egg-climb-test-bot-token'
const AUTH_DATE = 1773000000

const VALID_INIT_DATA =
  'auth_date=1773000000&ip=127.0.0.1&query_id=test-query-0001' +
  '&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22Oleg%22%2C%22username%22%3A%22oleg%22%7D' +
  '&hash=e554295f8c2d007d1a5325ac0fb4c5303f719b2d69cba7dfe8f6ac8748874982'

const LARGE_ID_INIT_DATA =
  'auth_date=1773000000&query_id=large-user' +
  '&user=%7B%22id%22%3A9223372036854775807%2C%22first_name%22%3A%22Max%22%7D' +
  '&hash=5607d7546afc8ad127353f394d9cd507eb7b4ce1b62f8507cedc3cdede463834'

const MALFORMED_USER_INIT_DATA =
  'auth_date=1773000000&query_id=bad-user&user=%7B%22id%22%3A42' +
  '&hash=a83b1103e13c8dbb6761bb7e9a978529a315c285eec06b552a0e9d0c5f937033'

const NO_AUTH_DATE_INIT_DATA =
  'ip=127.0.0.1&query_id=test-query-0001' +
  '&user=%7B%22id%22%3A42%2C%22first_name%22%3A%22Oleg%22%2C%22username%22%3A%22oleg%22%7D' +
  '&hash=6a3b473eeadeff5d50e43f65998e91352a79ae8743f2a2206657304a8c32efb7'

test('valid WebAppData passes and returns lossless user identity', async () => {
  const result = await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 })
  assert.ok(result.ok, `expected ok, got ${JSON.stringify(result)}`)
  assert.equal(result.userId, '42')
  assert.equal(result.authDate, AUTH_DATE)
  assert.equal(result.queryId, 'test-query-0001')
})

test('tampered value and wrong token fail signature validation', async () => {
  const tampered = VALID_INIT_DATA.replace('127.0.0.1', '127.0.0.2')
  assert.deepEqual(await validateMaxInitData(tampered, BOT_TOKEN, { nowSeconds: AUTH_DATE + 60 }), { ok: false, reason: 'signature mismatch' })
  assert.deepEqual(await validateMaxInitData(VALID_INIT_DATA, 'another-token', { nowSeconds: AUTH_DATE + 60 }), { ok: false, reason: 'signature mismatch' })
})

test('missing, duplicate and malformed hash are rejected', async () => {
  assert.deepEqual(await validateMaxInitData('auth_date=1773000000&ip=127.0.0.1', BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: 'missing hash' })
  assert.deepEqual(await validateMaxInitData(`${VALID_INIT_DATA}&hash=abcd`, BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: 'duplicate parameter: hash' })
  assert.deepEqual(await validateMaxInitData('auth_date=1773000000&hash=abcd', BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: 'malformed hash' })
})

test('duplicate signed semantic keys are rejected before business parsing', async () => {
  for (const [key, value] of [['auth_date', '1773000000'], ['user', '%7B%22id%22%3A99%7D'], ['query_id', 'other-query']]) {
    assert.deepEqual(await validateMaxInitData(`${VALID_INIT_DATA}&${key}=${value}`, BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: `duplicate parameter: ${key}` })
  }
})

test('malformed percent encoding fails closed', async () => {
  assert.deepEqual(await validateMaxInitData('auth_date=%E0%A4%A&hash=abcd', BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: 'bad encoding' })
  assert.equal(extractWebAppData('https://app.example/#WebAppData=%E0%A4%A'), null)
})

test('stale and too-far-future auth_date are rejected', async () => {
  assert.deepEqual(await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE + 901 }), { ok: false, reason: 'stale auth_date' })
  assert.deepEqual(await validateMaxInitData(VALID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE - 901 }), { ok: false, reason: 'stale auth_date' })
})

test('missing auth_date requires freshness to be explicitly disabled', async () => {
  assert.deepEqual(await validateMaxInitData(NO_AUTH_DATE_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: 'missing auth_date' })
  const result = await validateMaxInitData(NO_AUTH_DATE_INIT_DATA, BOT_TOKEN, { maxAgeSeconds: 0 })
  assert.ok(result.ok)
  assert.equal(result.userId, '42')
  assert.equal(result.authDate, null)
})

test('malformed signed user JSON is rejected instead of becoming anonymous', async () => {
  assert.deepEqual(await validateMaxInitData(MALFORMED_USER_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE }), { ok: false, reason: 'invalid user payload' })
})

test('MAX int64 user id is preserved without Number precision loss', async () => {
  const result = await validateMaxInitData(LARGE_ID_INIT_DATA, BOT_TOKEN, { nowSeconds: AUTH_DATE })
  assert.ok(result.ok)
  assert.equal(result.userId, '9223372036854775807')
})

test('outer launch URL requires exactly one well-formed semantic parameter', () => {
  const encoded = encodeURIComponent(VALID_INIT_DATA)
  assert.equal(extractWebAppData(`https://app.example/#WebAppPlatform=web&WebAppData=${encoded}`), VALID_INIT_DATA)
  assert.equal(extractWebAppData('https://app.example/'), null)
  assert.equal(extractWebAppData('https://app.example/#other=1'), null)
  assert.equal(extractWebAppData(`https://app.example/#WebAppData=${encoded}&WebAppData=${encoded}`), null)
  assert.equal(extractWebAppData(`https://app.example/#WebAppPlatform=web&WebAppPlatform=ios&WebAppData=${encoded}`), null)
})
