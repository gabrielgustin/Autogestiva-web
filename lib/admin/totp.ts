import { createHmac, randomBytes } from 'node:crypto'

// Códigos de 6 dígitos que cambian cada 30 segundos (TOTP, RFC 6238): los que muestran Google Authenticator y similares.
const STEP_SECONDS = 30
const DIGITS = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export const newTotpSecret = () => base32Encode(randomBytes(20))

export function totpAt(secret: string, step: number, digits = DIGITS) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return String(code).padStart(digits, '0')
}

// Acepta el código actual o el de 30 s antes/después (relojes desfasados). Devuelve el paso usado, o null.
// `lastStep` evita que el mismo código se use dos veces.
export function verifyTotp(secret: string, code: string, nowMs = Date.now(), lastStep = -1) {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(nowMs / 1000 / STEP_SECONDS)
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && totpAt(secret, step) === code) return step
  }
  return null
}

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Autogestiva:${account}`)}?secret=${secret}&issuer=Autogestiva&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
