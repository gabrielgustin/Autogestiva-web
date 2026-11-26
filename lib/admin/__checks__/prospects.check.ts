// Autocontrol: npx tsx lib/admin/__checks__/prospects.check.ts
import assert from 'node:assert/strict'
import { daysBetween, isoIn, phoneDigits, toDbRow, waLink } from '../prospects'

assert.equal(phoneDigits('+54 9 351 342-0260'), '3513420260')
assert.equal(phoneDigits('+54 351 460-1175'), '3514601175')
assert.equal(phoneDigits('0351 15 512-3456'), '3515123456')
assert.equal(phoneDigits('011 15 5124-2585'), '1151242585')
assert.equal(phoneDigits('03514601175'), '3514601175')
assert.equal(phoneDigits('3517608037'), '3517608037')
assert.equal(phoneDigits('7292973'), '7292973')
assert.equal(phoneDigits('+54 351 524 3700;+543468471705'), '3515243700')
assert.equal(phoneDigits('3516435666 543516435666'), '3516435666')
assert.equal(waLink('7292973'), '')
assert.equal(waLink('3517608037', 'hola'), 'https://wa.me/5493517608037?text=hola')

assert.deepEqual(toDbRow({ estado: 'Cliente', whatsapp: '+54 9 351 342-0260' }), { row: { estado: 'Cliente', whatsapp: '3513420260' } })
assert.ok('error' in toDbRow({ estado: 'Cualquiera' }))
assert.ok('error' in toDbRow({ negocio: '  ' }))
assert.ok('error' in toDbRow({ proximoFecha: '14/12/2026' }))
assert.deepEqual(toDbRow({ producto: 'Inventado', rubro: '' }), { row: { producto: 'Otro', rubro: null } })

assert.equal(isoIn(1, new Date(2026, 11, 31)), '2027-01-01')
assert.equal(daysBetween('2026-11-26', '2026-12-03'), 7)
console.log('prospects ok')
