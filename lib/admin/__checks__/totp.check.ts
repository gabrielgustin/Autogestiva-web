// Autocontrol: npx tsx lib/admin/__checks__/totp.check.ts
import assert from 'node:assert/strict'
import { base32Decode, base32Encode, newTotpSecret, totpAt, verifyTotp } from '../totp'

// Vectores de la RFC 6238 (SHA-1, clave "12345678901234567890", 8 dígitos).
const rfc = base32Encode(Buffer.from('12345678901234567890'))
assert.equal(rfc, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
assert.equal(totpAt(rfc, Math.floor(59 / 30), 8), '94287082')
assert.equal(totpAt(rfc, Math.floor(1111111109 / 30), 8), '07081804')
assert.equal(totpAt(rfc, Math.floor(2000000000 / 30), 8), '69279037')
assert.equal(base32Decode(rfc).toString(), '12345678901234567890')

const secret = newTotpSecret()
assert.equal(secret.length, 32)
const now = 1_800_000_000_000
const step = Math.floor(now / 30000)
assert.equal(verifyTotp(secret, totpAt(secret, step), now), step)
assert.equal(verifyTotp(secret, totpAt(secret, step - 1), now), step - 1)
assert.equal(verifyTotp(secret, totpAt(secret, step - 2), now), null)
assert.equal(verifyTotp(secret, totpAt(secret, step), now, step), null, 'el mismo código no sirve dos veces')
assert.equal(verifyTotp(secret, '12345', now), null)
console.log('totp ok')
