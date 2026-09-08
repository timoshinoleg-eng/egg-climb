/**
 * Strict server-side validation of MAX Mini Apps WebAppData.
 * Official algorithm:
 *   secret = HMAC-SHA256(key: "WebAppData", data: BOT_TOKEN)
 *   hash   = hex(HMAC-SHA256(key: secret, data: sorted decoded key=value lines))
 *
 * BOT_TOKEN and raw signed payloads are server-only and must not be logged.
 */

export interface MaxInitDataOptions {
  /** Max accepted age/skew in seconds; 0 disables freshness only. Default: 900. */
  readonly maxAgeSeconds?: number
  /** Injected unix-seconds clock for tests. */
  readonly nowSeconds?: number
}

export type MaxInitDataResult =
  | {
      readonly ok: true
      /** Lossless decimal int64 representation; never coerce MAX identity to JS Number. */
      readonly userId: string | null
      readonly authDate: number | null
      readonly queryId: string | null
      readonly launchParams: string
    }
  | { readonly ok: false; readonly reason: string }

const HMAC_KEY_LABEL = 'WebAppData'
const DEFAULT_MAX_AGE_SECONDS = 900
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n
const PARAMETER_KEY = /^[A-Za-z0-9_]+$/

async function hmacSha256(keyMaterial: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const rawKey = typeof keyMaterial === 'string' ? encoder.encode(keyMaterial) : keyMaterial
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, encoder.encode(data))
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

function decodeStrict(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * Extract exactly one WebAppData value from a MAX launch fragment. Any
 * malformed encoding, malformed pair, encoded/unknown key syntax, or duplicate
 * outer semantic key rejects the whole fragment.
 */
export function extractWebAppData(launchUrl: string): string | null {
  const hashIndex = launchUrl.indexOf('#')
  if (hashIndex < 0) return null
  const fragment = launchUrl.slice(hashIndex + 1)
  if (!fragment) return null
  const seen = new Set<string>()
  let webAppData: string | null = null
  for (const pair of fragment.split('&')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) return null
    const key = pair.slice(0, eq)
    if (!PARAMETER_KEY.test(key) || seen.has(key)) return null
    seen.add(key)
    const value = decodeStrict(pair.slice(eq + 1))
    if (value === null) return null
    if (key === 'WebAppData') webAppData = value
  }
  return webAppData
}

function skipWhitespace(source: string, start: number): number {
  let index = start
  while (index < source.length && /\s/.test(source[index] as string)) index += 1
  return index
}

function scanStringEnd(source: string, start: number): number {
  if (source[start] !== '"') return -1
  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index] as string
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '"') return index + 1
  }
  return -1
}

function scanValueEnd(source: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] as string
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '{' || char === '[') { depth += 1; continue }
    if (char === ']' && depth > 0) { depth -= 1; continue }
    if (char === '}') {
      if (depth === 0) return index
      depth -= 1
      continue
    }
    if (char === ',' && depth === 0) return index
  }
  return source.length
}

/** Extract top-level user.id from the original JSON token without losing int64 precision. */
function losslessUserId(userJson: string): string | null {
  const parsed = JSON.parse(userJson) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('user must be an object')

  let index = skipWhitespace(userJson, 0)
  if (userJson[index] !== '{') throw new Error('user must be an object')
  index += 1
  let idToken: string | null = null
  let idSeen = false
  while (true) {
    index = skipWhitespace(userJson, index)
    if (userJson[index] === '}') break
    const keyEnd = scanStringEnd(userJson, index)
    if (keyEnd < 0) throw new Error('invalid user key')
    const key = JSON.parse(userJson.slice(index, keyEnd)) as string
    index = skipWhitespace(userJson, keyEnd)
    if (userJson[index] !== ':') throw new Error('invalid user property')
    const valueStart = skipWhitespace(userJson, index + 1)
    const valueEnd = scanValueEnd(userJson, valueStart)
    if (key === 'id') {
      if (idSeen) throw new Error('duplicate user id')
      idSeen = true
      idToken = userJson.slice(valueStart, valueEnd).trim()
    }
    index = skipWhitespace(userJson, valueEnd)
    if (userJson[index] === ',') { index += 1; continue }
    if (userJson[index] === '}') break
    throw new Error('invalid user object')
  }

  if (!idSeen || idToken === null) return null
  if (!/^(0|[1-9]\d*)$/.test(idToken)) throw new Error('invalid user id')
  const value = BigInt(idToken)
  if (value > MAX_SIGNED_INT64) throw new Error('user id outside int64')
  return idToken
}

/**
 * Validate signed WebAppData. All inner keys must be unique; this prevents
 * HMAC/parser differentials where verification sees one pair and business
 * logic later chooses another duplicate value.
 */
export async function validateMaxInitData(
  initData: string,
  botToken: string,
  options: MaxInitDataOptions = {},
): Promise<MaxInitDataResult> {
  if (!initData || !botToken) return { ok: false, reason: 'empty input' }

  const pairs: Array<[string, string]> = []
  const seen = new Set<string>()
  let hash: string | null = null
  for (const pair of initData.split('&')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) return { ok: false, reason: 'malformed pair' }
    const key = pair.slice(0, eq)
    if (!PARAMETER_KEY.test(key)) return { ok: false, reason: 'malformed key' }
    if (seen.has(key)) return { ok: false, reason: `duplicate parameter: ${key}` }
    seen.add(key)
    const value = decodeStrict(pair.slice(eq + 1))
    if (value === null) return { ok: false, reason: 'bad encoding' }
    if (key === 'hash') hash = value
    else pairs.push([key, value])
  }
  if (hash === null) return { ok: false, reason: 'missing hash' }
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'malformed hash' }

  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const launchParams = pairs.map(([key, value]) => `${key}=${value}`).join('\n')
  const secretKey = await hmacSha256(HMAC_KEY_LABEL, botToken)
  const signature = toHex(await hmacSha256(secretKey, launchParams))
  if (!timingSafeEqual(signature, hash)) return { ok: false, reason: 'signature mismatch' }

  const authRaw = pairs.find(([key]) => key === 'auth_date')?.[1]
  let authDate: number | null = null
  if (authRaw !== undefined) {
    if (!/^\d+$/.test(authRaw)) return { ok: false, reason: 'invalid auth_date' }
    authDate = Number(authRaw)
    if (!Number.isSafeInteger(authDate)) return { ok: false, reason: 'invalid auth_date' }
  }
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  if (!Number.isFinite(maxAge) || maxAge < 0) throw new Error('Invalid maxAgeSeconds option')
  if (maxAge > 0) {
    if (authDate === null) return { ok: false, reason: 'missing auth_date' }
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (!Number.isSafeInteger(now)) throw new Error('Invalid nowSeconds option')
    if (now - authDate > maxAge || authDate - now > maxAge) return { ok: false, reason: 'stale auth_date' }
  }

  const userRaw = pairs.find(([key]) => key === 'user')?.[1]
  let userId: string | null = null
  if (userRaw !== undefined) {
    try {
      userId = losslessUserId(userRaw)
    } catch {
      return { ok: false, reason: 'invalid user payload' }
    }
  }
  const queryId = pairs.find(([key]) => key === 'query_id')?.[1] ?? null

  return { ok: true, userId, authDate, queryId, launchParams }
}
