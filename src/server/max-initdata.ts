/**
 * Server-side validation of MAX Mini Apps launch parameters (WebAppData).
 *
 * Implements the official algorithm from the MAX platform docs
 * (dev.max.ru/docs/webapps/validation):
 *
 *   secret_key = HMAC-SHA256(key: "WebAppData", data: BOT_TOKEN)
 *   signature  = hex(HMAC-SHA256(key: secret_key, data: launch_params))
 *
 * where launch_params is the list of `key=value` pairs (all parameters
 * except `hash`), values URL-decoded, keys sorted a→z, joined with "\n".
 *
 * Runs on WebCrypto (globalThis.crypto.subtle), so the same code works in
 * Node 22, Vercel Functions and edge runtimes. No new dependencies.
 * Server-only module: never ship BOT_TOKEN to the client bundle.
 */

export interface MaxInitDataOptions {
  /** Max accepted age of auth_date in seconds; 0 disables the freshness check. Default: 900. */
  readonly maxAgeSeconds?: number
  /** Injected clock (unix seconds) for tests; defaults to the wall clock. */
  readonly nowSeconds?: number
}

export type MaxInitDataResult =
  | {
      readonly ok: true
      readonly userId: number | null
      readonly displayName: string | null
      readonly authDate: number | null
      readonly queryId: string | null
      readonly launchParams: string
    }
  | { readonly ok: false; readonly reason: string }

const HMAC_KEY_LABEL = 'WebAppData'
const DEFAULT_MAX_AGE_SECONDS = 900

async function hmacSha256(keyMaterial: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const rawKey = typeof keyMaterial === 'string' ? encoder.encode(keyMaterial) : keyMaterial
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, encoder.encode(data))
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Extract the WebAppData value from a mini-app launch URL.
 * The fragment is URL-encoded once at the URL level; values inside
 * WebAppData keep their own encoding for validateMaxInitData.
 * Fail-closed: any duplicated launch parameter (especially WebAppData)
 * rejects the URL.
 */
export function extractWebAppData(launchUrl: string): string | null {
  const hashIndex = launchUrl.indexOf('#')
  if (hashIndex < 0) return null
  const fragment = launchUrl.slice(hashIndex + 1)
  const seen = new Set<string>()
  let value: string | null = null
  for (const pair of fragment.split('&')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const key = pair.slice(0, eq)
    if (seen.has(key)) return null
    seen.add(key)
    if (key !== 'WebAppData') continue
    const raw = pair.slice(eq + 1)
    try {
      value = decodeURIComponent(raw)
    } catch {
      value = raw
    }
  }
  return value
}

/**
 * Validate a WebAppData string against the bot token.
 * Checks: exactly one hash parameter, well-formed pairs, HMAC-SHA256
 * signature (constant-time compare), and auth_date freshness.
 */
export async function validateMaxInitData(
  initData: string,
  botToken: string,
  options: MaxInitDataOptions = {},
): Promise<MaxInitDataResult> {
  if (!initData || !botToken) return { ok: false, reason: 'empty input' }

  const pairs: Array<[string, string]> = []
  let hash: string | null = null
  for (const pair of initData.split('&')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) return { ok: false, reason: 'malformed pair' }
    const key = pair.slice(0, eq)
    let value = pair.slice(eq + 1)
    try {
      value = decodeURIComponent(value)
    } catch {
      return { ok: false, reason: 'bad encoding' }
    }
    if (key === 'hash') {
      if (hash !== null) return { ok: false, reason: 'duplicate hash' }
      hash = value
      continue
    }
    pairs.push([key, value])
  }
  if (hash === null) return { ok: false, reason: 'missing hash' }
  if (hash.length !== 64) return { ok: false, reason: 'malformed hash' }

  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const launchParams = pairs.map(([key, value]) => `${key}=${value}`).join('\n')

  const secretKey = await hmacSha256(HMAC_KEY_LABEL, botToken)
  const signature = toHex(await hmacSha256(secretKey, launchParams))
  if (!timingSafeEqual(signature, hash)) return { ok: false, reason: 'signature mismatch' }

  const authRaw = pairs.find(([key]) => key === 'auth_date')?.[1]
  const authDate = authRaw !== undefined && /^\d+$/.test(authRaw) ? Number(authRaw) : null
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  if (maxAge > 0) {
    if (authDate === null) return { ok: false, reason: 'missing auth_date' }
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (now - authDate > maxAge || authDate - now > maxAge) return { ok: false, reason: 'stale auth_date' }
  }

  let userId: number | null = null
  let displayName: string | null = null
  const userRaw = pairs.find(([key]) => key === 'user')?.[1]
  if (userRaw !== undefined) {
    try {
      const user = JSON.parse(userRaw) as { id?: unknown; first_name?: unknown; username?: unknown }
      if (typeof user.id === 'number' && Number.isSafeInteger(user.id)) userId = user.id
      if (typeof user.first_name === 'string') displayName = user.first_name
      else if (typeof user.username === 'string') displayName = user.username
    } catch {
      // Anonymous payload: signature already proved authenticity.
    }
  }

  const queryRaw = pairs.find(([key]) => key === 'query_id')?.[1]

  return {
    ok: true,
    userId,
    displayName,
    authDate,
    queryId: queryRaw ?? null,
    launchParams,
  }
}
