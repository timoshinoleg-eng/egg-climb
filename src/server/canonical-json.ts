function quoted(value: string): string {
  return JSON.stringify(value) as string
}

/**
 * Minimal JSON Canonicalization Scheme for contract data: object keys are
 * sorted, arrays preserve order, and only ordinary JSON values are accepted.
 * Number rendering deliberately delegates to ECMAScript JSON.stringify.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return quoted(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON rejects non-finite numbers')
    return JSON.stringify(value) as string
  }
  if (Array.isArray(value)) {
    const items: string[] = []
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new Error('Canonical JSON rejects sparse arrays')
      items.push(canonicalJson(value[index]))
    }
    return `[${items.join(',')}]`
  }
  if (typeof value !== 'object') throw new Error('Canonical JSON rejects non-JSON values')

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Canonical JSON requires plain objects')
  const record = value as Record<string, unknown>
  const members: string[] = []
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) throw new Error('Canonical JSON rejects undefined object values')
    members.push(`${quoted(key)}:${canonicalJson(record[key])}`)
  }
  return `{${members.join(',')}}`
}

export async function sha256HexText(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)
  const buffer = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(buffer).set(encoded)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
